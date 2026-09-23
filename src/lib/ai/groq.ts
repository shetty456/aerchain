import 'server-only';

import Groq from 'groq-sdk';
import { z } from 'zod';
import { AiConfigurationError, AiProviderError, type StructuredGenerationRequest } from './provider';
import { elapsedSince, procurementLog } from '@/lib/observability/logger';

function getClient() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new AiConfigurationError('GROQ_API_KEY is missing. Add it to .env.local and restart the server.');
  const configuredTimeout = Number(process.env.GROQ_TIMEOUT_SECONDS || 120);
  const timeout = (Number.isFinite(configuredTimeout) && configuredTimeout >= 10 ? configuredTimeout : 120) * 1_000;
  return new Groq({ apiKey, timeout, maxRetries: 2 });
}

export class GroqReasoningProvider {
  async generateStructured<TSchema extends z.ZodType>(
    request: StructuredGenerationRequest<TSchema>,
  ): Promise<z.infer<TSchema>> {
    const startedAt = Date.now();
    const model = process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b';
    try {
      procurementLog.info('groq.mapping.started', { schema: request.schemaName, model, promptCharacters: request.prompt.length });
      const response = await getClient().chat.completions.create({
        model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.prompt },
        ],
        temperature: 0,
        max_completion_tokens: request.maxTokens ?? 6_000,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: request.schemaName,
            strict: true,
            schema: z.toJSONSchema(request.schema, { unrepresentable: 'any' }) as Record<string, unknown>,
          },
        },
      });

      const choice = response.choices[0];
      const content = choice?.message.content;
      if (!content) throw new Error(`Groq returned no structured content (finish reason: ${choice?.finish_reason ?? 'unknown'}).`);
      const parsed = request.schema.parse(JSON.parse(content));
      procurementLog.info('groq.mapping.completed', {
        schema: request.schemaName,
        model,
        finishReason: choice.finish_reason,
        completionTokens: response.usage?.completion_tokens,
        promptTokens: response.usage?.prompt_tokens,
        elapsedMs: elapsedSince(startedAt),
      });
      return parsed;
    } catch (error) {
      if (error instanceof AiConfigurationError) throw error;
      if (error instanceof z.ZodError) {
        procurementLog.error('groq.mapping.invalid_output', { schema: request.schemaName, issueCount: error.issues.length, elapsedMs: elapsedSince(startedAt) });
        throw new AiProviderError('Groq returned structured output that failed schema validation.', error, 'INVALID_OUTPUT');
      }
      const isTimeout = error instanceof Error && (error.name.includes('Timeout') || error.message.toLowerCase().includes('timeout'));
      procurementLog.error(isTimeout ? 'groq.mapping.timeout' : 'groq.mapping.failed', {
        schema: request.schemaName,
        model,
        elapsedMs: elapsedSince(startedAt),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AiProviderError(
        isTimeout ? 'Groq timed out while mapping the vendor response.' : 'Groq structured generation failed.',
        error,
        isTimeout ? 'TIMEOUT' : 'PROVIDER_ERROR',
      );
    }
  }
}

export const groqReasoningProvider = new GroqReasoningProvider();
