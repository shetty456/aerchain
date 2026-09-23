import 'server-only';

import type { z } from 'zod';
import { groqReasoningProvider } from './groq';
import type { AiProvider, DocumentInput, StructuredGenerationRequest } from './provider';
import { sarvamProvider } from './sarvam';

export class ProcurementAiProvider implements AiProvider {
  digitiseDocument(input: DocumentInput) {
    return sarvamProvider.digitiseDocument(input);
  }

  generateStructured<TSchema extends z.ZodType>(request: StructuredGenerationRequest<TSchema>) {
    return groqReasoningProvider.generateStructured(request);
  }
}

export const procurementAiProvider = new ProcurementAiProvider();
