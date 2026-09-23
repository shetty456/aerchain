import type { z } from 'zod';

export interface DigitisedDocument {
  jobId: string;
  status: 'completed' | 'partially_completed';
  result: unknown;
}

export interface DocumentInput {
  fileName: string;
  bytes: Uint8Array;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
}

export interface StructuredGenerationRequest<TSchema extends z.ZodType> {
  schemaName: string;
  schema: TSchema;
  system: string;
  prompt: string;
}

export interface AiProvider {
  digitiseDocument(input: DocumentInput): Promise<DigitisedDocument>;
  generateStructured<TSchema extends z.ZodType>(
    request: StructuredGenerationRequest<TSchema>,
  ): Promise<z.infer<TSchema>>;
}

export class AiConfigurationError extends Error {
  constructor(message = 'SARVAM_API_KEY is missing. Add it to .env.local and restart the server.') {
    super(message);
    this.name = 'AiConfigurationError';
  }
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly code: 'TIMEOUT' | 'PROVIDER_ERROR' | 'INVALID_OUTPUT' = 'PROVIDER_ERROR',
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
