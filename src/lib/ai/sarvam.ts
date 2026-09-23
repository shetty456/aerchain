import 'server-only';

import { SarvamAIClient } from 'sarvamai';
import { z } from 'zod';
import {
  AiConfigurationError,
  AiProviderError,
  type AiProvider,
  type DigitisedDocument,
  type DocumentInput,
  type StructuredGenerationRequest,
} from './provider';

const TERMINAL_STATUSES = new Set(['completed', 'partially_completed', 'failed', 'rejected']);
const POLL_INTERVAL_MS = 1_500;
const MAX_POLLS = 80;

function getClient() {
  const apiKey = process.env.SARVAM_API_KEY?.trim();
  if (!apiKey) throw new AiConfigurationError();
  return new SarvamAIClient({ apiSubscriptionKey: apiKey });
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class SarvamProvider implements AiProvider {
  async digitiseDocument(input: DocumentInput): Promise<DigitisedDocument> {
    try {
      const client = getClient();
      const bytes = input.bytes.slice().buffer as ArrayBuffer;
      const file = new File([bytes], input.fileName, { type: input.mimeType });
      const job = await client.docAi.digitise({
        file: [file],
        language: 'en-IN',
        output_format: 'json',
        content_type: 'printed',
        model: 'sarvam-vision-v1',
      });

      let status = job.status.toLowerCase();
      for (let attempt = 0; !TERMINAL_STATUSES.has(status) && attempt < MAX_POLLS; attempt += 1) {
        await sleep(POLL_INTERVAL_MS);
        const current = await client.docAi.getStatus(job.job_id);
        status = current.status.toLowerCase();
      }

      if (status !== 'completed' && status !== 'partially_completed') {
        throw new Error(`Document AI job ${job.job_id} ended with status ${status}.`);
      }

      const result = await client.docAi.getResults(job.job_id, { format: 'json' });
      return { jobId: job.job_id, status, result };
    } catch (error) {
      if (error instanceof AiConfigurationError) throw error;
      throw new AiProviderError(`Sarvam could not digitise ${input.fileName}.`, error);
    }
  }

  async generateStructured<TSchema extends z.ZodType>(
    request: StructuredGenerationRequest<TSchema>,
  ): Promise<z.infer<TSchema>> {
    try {
      const client = getClient();
      const model = process.env.SARVAM_MODEL?.trim() || 'sarvam-105b';
      const response = await client.chat.completions({
        model: model as 'sarvam-105b',
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.prompt },
        ],
        reasoning_effort: 'low',
        temperature: 0.1,
        max_tokens: 12_000,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: request.schemaName,
            description: 'Validated procurement workflow output.',
            strict: true,
            schema: z.toJSONSchema(request.schema, { unrepresentable: 'any' }) as Record<string, unknown>,
          },
        },
      });

      const content = response.choices[0]?.message.content;
      if (!content) throw new Error('Sarvam returned no structured content.');
      return request.schema.parse(JSON.parse(content));
    } catch (error) {
      if (error instanceof AiConfigurationError) throw error;
      if (error instanceof z.ZodError) {
        throw new AiProviderError('Sarvam returned structured output that failed schema validation.', error);
      }
      throw new AiProviderError('Sarvam structured generation failed.', error);
    }
  }
}

export const sarvamProvider = new SarvamProvider();
