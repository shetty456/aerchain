import 'server-only';

import { windowsHardwareEvent } from '@/data/windows-hardware-fy27';
import { PROCUREMENT_GUARDRAIL } from '@/lib/ai/prompts';
import type { AiProvider } from '@/lib/ai/provider';
import { procurementAiProvider } from '@/lib/ai/procurement-provider';
import { extractSource, getArtifactForVendor } from './source-artifacts';
import { getArtifactFingerprint } from './source-artifacts';
import { normalizeResponse } from './canonicalize';
import { rawExtractedResponseSchema, vendorResponseSchema } from '@/lib/procurement/schemas';
import { elapsedSince, procurementLog } from '@/lib/observability/logger';
import { readPipelineStage, writePipelineStage } from '@/lib/storage/pipeline-cache';
import { z } from 'zod';

const PIPELINE_SCHEMA_VERSION = 'vendor-response-v1';
const extractedSourceCacheSchema = z.object({
  artifact: z.object({ id: z.string(), vendorId: z.string(), kind: z.enum(['XLSX', 'PDF', 'DOCX', 'IMAGE', 'EMAIL']), fileName: z.string() }),
  content: z.string(),
  visionJobId: z.string().optional(),
  extractionMethod: z.enum(['LOCAL_STRUCTURAL', 'SARVAM_VISION']),
});

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

export async function processVendorResponse(vendorId: string, provider: AiProvider = procurementAiProvider, requestId = crypto.randomUUID()) {
  const startedAt = Date.now();
  const artifact = getArtifactForVendor(vendorId);
  const artifactHash = await getArtifactFingerprint(artifact);
  const cachedStages: string[] = [];
  procurementLog.info('vendor.processing.started', { requestId, vendorId, artifactId: artifact.id, fileName: artifact.fileName, kind: artifact.kind });
  const extractionStartedAt = Date.now();
  let source = await readPipelineStage(vendorId, 'extraction', artifactHash, extractedSourceCacheSchema);
  if (source) {
    cachedStages.push('extraction');
    procurementLog.info('vendor.extraction.cache_hit', { requestId, vendorId, artifactHash: artifactHash.slice(0, 12) });
  } else {
    procurementLog.info('vendor.extraction.cache_miss', { requestId, vendorId, artifactHash: artifactHash.slice(0, 12) });
    source = await extractSource(artifact, provider);
    await writePipelineStage(vendorId, 'extraction', artifactHash, source);
    procurementLog.info('vendor.extraction.cached', { requestId, vendorId, visionJobId: source.visionJobId });
  }
  procurementLog.info('vendor.extraction.completed', { requestId, vendorId, method: source.extractionMethod, visionJobId: source.visionJobId, sourceCharacters: source.content.length, elapsedMs: elapsedSince(extractionStartedAt) });
  const mappingStartedAt = Date.now();
  const mappingHash = `${artifactHash}:${process.env.GROQ_MODEL || 'openai/gpt-oss-20b'}:${PIPELINE_SCHEMA_VERSION}`;
  let raw = await readPipelineStage(vendorId, 'mapping', mappingHash, rawExtractedResponseSchema);
  if (raw) {
    cachedStages.push('mapping');
    procurementLog.info('vendor.mapping.cache_hit', { requestId, vendorId, schemaVersion: PIPELINE_SCHEMA_VERSION });
  } else {
    procurementLog.info('vendor.mapping.cache_miss', { requestId, vendorId, schemaVersion: PIPELINE_SCHEMA_VERSION });
    raw = await provider.generateStructured({
      schemaName: 'vendor_response_extraction',
      schema: rawExtractedResponseSchema,
      system: PROCUREMENT_GUARDRAIL,
      prompt: mapPrompt(source.content, artifact.fileName, artifact.id),
      maxTokens: 16_000,
    });
    await writePipelineStage(vendorId, 'mapping', mappingHash, raw);
    procurementLog.info('vendor.mapping.cached', { requestId, vendorId, extractedLines: raw.lineItems.length });
  }
  procurementLog.info('vendor.mapping.validated', { requestId, vendorId, extractedLines: raw.lineItems.length, ambiguityCount: raw.ambiguities.length, elapsedMs: elapsedSince(mappingStartedAt) });
  const normalizationStartedAt = Date.now();
  const normalizationHash = `${mappingHash}:normalization-v1`;
  let response = await readPipelineStage(vendorId, 'normalization', normalizationHash, vendorResponseSchema);
  if (response) {
    cachedStages.push('normalization');
    procurementLog.info('vendor.normalization.cache_hit', { requestId, vendorId });
  } else {
    response = normalizeResponse(vendorId, artifact.id, raw);
    await writePipelineStage(vendorId, 'normalization', normalizationHash, response);
    procurementLog.info('vendor.normalization.cached', { requestId, vendorId });
  }
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
      provider: 'sarvam-vision + groq',
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      cached: cachedStages.length > 0,
      cachedStages,
      artifactHash,
    },
  };
}
