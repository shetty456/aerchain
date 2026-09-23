import 'server-only';

import { SarvamAIClient, SarvamAITimeoutError } from 'sarvamai';
import { z } from 'zod';
import {
  AiConfigurationError,
  AiProviderError,
  type AiProvider,
  type DigitisedDocument,
  type DocumentInput,
  type StructuredGenerationRequest,
} from './provider';
import { elapsedSince, procurementLog } from '@/lib/observability/logger';

const TERMINAL_STATUSES = new Set(['completed', 'partially_completed', 'failed', 'rejected']);
const POLL_INTERVAL_MS = 1_500;
const MAX_POLLS = 80;

function getClient() {
  const apiKey = process.env.SARVAM_API_KEY?.trim();
  if (!apiKey) throw new AiConfigurationError();
  const configuredTimeout = Number(process.env.SARVAM_TIMEOUT_SECONDS || 180);
  const timeoutInSeconds = Number.isFinite(configuredTimeout) && configuredTimeout >= 30 ? configuredTimeout : 180;
  return new SarvamAIClient({ apiSubscriptionKey: apiKey, timeoutInSeconds, maxRetries: 2 });
}

function isTimeout(error: unknown) {
  return error instanceof SarvamAITimeoutError
    || (error instanceof Error && error.message.toLowerCase().includes('timeout'));
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class SarvamProvider implements AiProvider {
  async digitiseDocument(input: DocumentInput): Promise<DigitisedDocument> {
    const startedAt = Date.now();
    try {
      const client = getClient();
      const bytes = input.bytes.slice().buffer as ArrayBuffer;
      const file = new File([bytes], input.fileName, { type: input.mimeType });
      procurementLog.info('sarvam.vision.submit.started', { fileName: input.fileName, mimeType: input.mimeType, bytes: input.bytes.byteLength });
      const job = await client.docAi.digitise({
        file: [file],
        language: 'en-IN',
        output_format: 'json',
        content_type: 'printed',
        model: 'sarvam-vision-v1',
      });
      procurementLog.info('sarvam.vision.job.created', { fileName: input.fileName, jobId: job.job_id, status: job.status, elapsedMs: elapsedSince(startedAt) });

      let status = job.status.toLowerCase();
      for (let attempt = 0; !TERMINAL_STATUSES.has(status) && attempt < MAX_POLLS; attempt += 1) {
        await sleep(POLL_INTERVAL_MS);
        const current = await client.docAi.getStatus(job.job_id);
        status = current.status.toLowerCase();
        procurementLog.debug('sarvam.vision.job.polled', { jobId: job.job_id, attempt: attempt + 1, status, elapsedMs: elapsedSince(startedAt) });
      }

      if (status !== 'completed' && status !== 'partially_completed') {
        throw new Error(`Document AI job ${job.job_id} ended with status ${status}.`);
      }

      const result = await client.docAi.getResults(job.job_id, { format: 'json' });
      procurementLog.info('sarvam.vision.completed', { jobId: job.job_id, status, elapsedMs: elapsedSince(startedAt) });
      return { jobId: job.job_id, status, result };
    } catch (error) {
      if (error instanceof AiConfigurationError) throw error;
      if (isTimeout(error)) {
        procurementLog.warn('sarvam.vision.timeout', { fileName: input.fileName, elapsedMs: elapsedSince(startedAt) });
        throw new AiProviderError(
          `Sarvam timed out while reading ${input.fileName}. The document job was not treated as complete; retry the response when the service is available.`,
          error,
          'TIMEOUT',
        );
      }
      procurementLog.error('sarvam.vision.failed', { fileName: input.fileName, elapsedMs: elapsedSince(startedAt), error: error instanceof Error ? error.message : 'Unknown error' });
      throw new AiProviderError(`Sarvam could not digitise ${input.fileName}.`, error);
    }
  }

  async generateStructured<TSchema extends z.ZodType>(
    request: StructuredGenerationRequest<TSchema>,
  ): Promise<z.infer<TSchema>> {
    const startedAt = Date.now();
    try {
      const client = getClient();
      const model = process.env.SARVAM_MODEL?.trim() || 'sarvam-105b';
      procurementLog.info('sarvam.mapping.started', { schema: request.schemaName, model, promptCharacters: request.prompt.length });
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
      const parsed = request.schema.parse(JSON.parse(content));
      procurementLog.info('sarvam.mapping.completed', { schema: request.schemaName, model, elapsedMs: elapsedSince(startedAt) });
      return parsed;
    } catch (error) {
      if (error instanceof AiConfigurationError) throw error;
      if (error instanceof z.ZodError) {
        procurementLog.error('sarvam.mapping.invalid_output', { schema: request.schemaName, elapsedMs: elapsedSince(startedAt), issueCount: error.issues.length });
        throw new AiProviderError('Sarvam returned structured output that failed schema validation.', error, 'INVALID_OUTPUT');
      }
      if (isTimeout(error)) {
        procurementLog.warn('sarvam.mapping.timeout', { schema: request.schemaName, elapsedMs: elapsedSince(startedAt) });
        throw new AiProviderError('Sarvam timed out while mapping the vendor response. Retry without changing any normalized data.', error, 'TIMEOUT');
      }
      procurementLog.error('sarvam.mapping.failed', { schema: request.schemaName, elapsedMs: elapsedSince(startedAt), error: error instanceof Error ? error.message : 'Unknown error' });
      throw new AiProviderError('Sarvam structured generation failed.', error);
    }
  }
}

export const sarvamProvider = new SarvamProvider();
