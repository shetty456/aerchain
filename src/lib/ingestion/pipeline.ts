import 'server-only';

import { windowsHardwareEvent } from '@/data/windows-hardware-fy27';
import { PROCUREMENT_GUARDRAIL } from '@/lib/ai/prompts';
import type { AiProvider } from '@/lib/ai/provider';
import { sarvamProvider } from '@/lib/ai/sarvam';
import { extractSource, getArtifactForVendor } from './source-artifacts';
import { normalizeResponse } from './canonicalize';
import { rawExtractedResponseSchema } from '@/lib/procurement/schemas';
import { elapsedSince, procurementLog } from '@/lib/observability/logger';

function mapPrompt(source: string, fileName: string, artifactId: string) {
  const rfx = windowsHardwareEvent.lineItems.map((line) => ({
    id: line.id,
    requestedProduct: line.requestedProduct,
    quantity: line.quantity,
    unit: line.unit,
    mandatorySpecifications: line.mandatorySpecifications,
  }));
  return `Map the vendor response below to the RFx lines.

Rules:
- Map by meaning, model and specification, not row position alone.
- Preserve raw prices and state their currency and price basis. Do not calculate conversions or discounts.
- A missing specification is AMBIGUOUS or UNKNOWN, never silently MEETS.
- A different make/model may be a buyer judgment issue even when superficially equivalent.
- Evidence must use artifactId "${artifactId}", fileName "${fileName}", and only locations/excerpts supported by the source.
- Return only actually quoted lines. Missing RFx lines are added deterministically later.

RFx lines:
${JSON.stringify(rfx)}

Qualification questions:
${JSON.stringify(windowsHardwareEvent.qualificationQuestions)}

Vendor source:
${source}`;
}

export async function processVendorResponse(vendorId: string, provider: AiProvider = sarvamProvider, requestId = crypto.randomUUID()) {
  const startedAt = Date.now();
  const artifact = getArtifactForVendor(vendorId);
  procurementLog.info('vendor.processing.started', { requestId, vendorId, artifactId: artifact.id, fileName: artifact.fileName, kind: artifact.kind });
  const extractionStartedAt = Date.now();
  const source = await extractSource(artifact, provider);
  procurementLog.info('vendor.extraction.completed', { requestId, vendorId, method: source.extractionMethod, visionJobId: source.visionJobId, sourceCharacters: source.content.length, elapsedMs: elapsedSince(extractionStartedAt) });
  const mappingStartedAt = Date.now();
  const raw = await provider.generateStructured({
    schemaName: 'vendor_response_extraction',
    schema: rawExtractedResponseSchema,
    system: PROCUREMENT_GUARDRAIL,
    prompt: mapPrompt(source.content, artifact.fileName, artifact.id),
  });
  procurementLog.info('vendor.mapping.validated', { requestId, vendorId, extractedLines: raw.lineItems.length, ambiguityCount: raw.ambiguities.length, elapsedMs: elapsedSince(mappingStartedAt) });
  const normalizationStartedAt = Date.now();
  const response = normalizeResponse(vendorId, artifact.id, raw);
  procurementLog.info('vendor.normalization.completed', {
    requestId, vendorId, totalLines: response.lineItems.length,
    normalizedLines: response.lineItems.filter((line) => line.normalizedUnitPrice !== null).length,
    exceptionLines: response.lineItems.filter((line) => !['VERIFIED', 'NORMALIZED'].includes(line.status)).length,
    elapsedMs: elapsedSince(normalizationStartedAt), totalElapsedMs: elapsedSince(startedAt),
  });
  return {
    response,
    ingestion: {
      extractionMethod: source.extractionMethod,
      visionJobId: source.visionJobId,
      provider: 'sarvam',
      model: process.env.SARVAM_MODEL || 'sarvam-105b',
      cached: false,
    },
  };
}
