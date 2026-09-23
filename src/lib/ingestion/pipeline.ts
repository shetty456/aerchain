import 'server-only';

import { windowsHardwareEvent } from '@/data/windows-hardware-fy27';
import { PROCUREMENT_GUARDRAIL } from '@/lib/ai/prompts';
import type { AiProvider } from '@/lib/ai/provider';
import { procurementAiProvider } from '@/lib/ai/procurement-provider';
import { extractSource, getArtifactForVendor } from './source-artifacts';
import { getArtifactFingerprint } from './source-artifacts';
import { normalizeResponse } from './canonicalize';
import {
  rawExtractedResponseSchema,
  rawLineBatchSchema,
  rawMetadataBatchSchema,
  vendorResponseSchema,
  type RawExtractedResponse,
} from '@/lib/procurement/schemas';
import { elapsedSince, procurementLog } from '@/lib/observability/logger';
import { readPipelineStage, writePipelineStage } from '@/lib/storage/pipeline-cache';
import { z } from 'zod';

const PIPELINE_SCHEMA_VERSION = 'vendor-response-batched-v1';
const LINE_BATCH_SIZE = 10;
const extractedSourceCacheSchema = z.object({
  artifact: z.object({ id: z.string(), vendorId: z.string(), kind: z.enum(['XLSX', 'PDF', 'DOCX', 'IMAGE', 'EMAIL']), fileName: z.string() }),
  content: z.string(),
  visionJobId: z.string().optional(),
  extractionMethod: z.enum(['LOCAL_STRUCTURAL', 'SARVAM_VISION']),
});

function lineBatchPrompt(source: string, fileName: string, artifactId: string, lineOffset: number) {
  const rfx = windowsHardwareEvent.lineItems.slice(lineOffset, lineOffset + LINE_BATCH_SIZE).map((line) => ({
    id: line.id,
    requestedProduct: line.requestedProduct,
    quantity: line.quantity,
    unit: line.unit,
    mandatorySpecifications: line.mandatorySpecifications,
  }));
  return `Extract only quotations that map to the following RFx subset.

Rules:
- Map by meaning, model and specification, not row position alone.
- Preserve raw prices and state their currency and price basis. Do not calculate conversions or discounts.
- A missing specification is AMBIGUOUS or UNKNOWN, never silently MEETS.
- A different make/model may be a buyer judgment issue even when superficially equivalent.
- Evidence must use artifactId "${artifactId}", fileName "${fileName}", and only locations/excerpts supported by the source.
- Return only actually quoted lines from this RFx subset. Do not return lines outside the subset.
- Return no more than ${LINE_BATCH_SIZE} line items. Missing RFx lines are added deterministically later.

RFx lines:
${JSON.stringify(rfx)}

Vendor source:
${source}`;
}

function metadataPrompt(source: string, fileName: string, artifactId: string) {
  return `Extract only supplier qualification answers and commercial terms from this vendor response.

Rules:
- Never infer a missing answer or term.
- Evidence must use artifactId "${artifactId}", fileName "${fileName}", and only locations/excerpts supported by the source.
- Unknown mandatory answers remain UNKNOWN; they are not failures.
- Capture factual ambiguities about qualification or commercial terms.

Qualification questions:
${JSON.stringify(windowsHardwareEvent.qualificationQuestions)}

Requested commercial terms:
${JSON.stringify(windowsHardwareEvent.requestedCommercialTerms)}

Vendor source:
${source}`;
}

async function mapInBatches(
  vendorId: string,
  source: string,
  fileName: string,
  artifactId: string,
  mappingHash: string,
  provider: AiProvider,
  requestId: string,
): Promise<RawExtractedResponse> {
  const metadataHash = `${mappingHash}:metadata`;
  let metadata = await readPipelineStage(vendorId, 'mapping-metadata', metadataHash, rawMetadataBatchSchema);
  if (metadata) {
    procurementLog.info('vendor.mapping.metadata.cache_hit', { requestId, vendorId });
  } else {
    procurementLog.info('vendor.mapping.metadata.started', { requestId, vendorId });
    metadata = await provider.generateStructured({
      schemaName: 'vendor_response_metadata',
      schema: rawMetadataBatchSchema,
      system: PROCUREMENT_GUARDRAIL,
      prompt: metadataPrompt(source, fileName, artifactId),
      maxTokens: 4_000,
    });
    await writePipelineStage(vendorId, 'mapping-metadata', metadataHash, metadata);
    procurementLog.info('vendor.mapping.metadata.cached', { requestId, vendorId });
  }

  const lineItems: RawExtractedResponse['lineItems'] = [];
  const ambiguities: RawExtractedResponse['ambiguities'] = [...metadata.ambiguities];
  for (let offset = 0; offset < windowsHardwareEvent.lineItems.length; offset += LINE_BATCH_SIZE) {
    const batchNumber = offset / LINE_BATCH_SIZE + 1;
    const stage = `mapping-lines-${batchNumber}` as const;
    const batchHash = `${mappingHash}:lines:${offset}:${LINE_BATCH_SIZE}`;
    let batch = await readPipelineStage(vendorId, stage, batchHash, rawLineBatchSchema);
    if (batch) {
      procurementLog.info('vendor.mapping.batch.cache_hit', { requestId, vendorId, batchNumber });
    } else {
      procurementLog.info('vendor.mapping.batch.started', { requestId, vendorId, batchNumber });
      batch = await provider.generateStructured({
        schemaName: `vendor_response_lines_${batchNumber}`,
        schema: rawLineBatchSchema,
        system: PROCUREMENT_GUARDRAIL,
        prompt: lineBatchPrompt(source, fileName, artifactId, offset),
        maxTokens: 6_000,
      });
      await writePipelineStage(vendorId, stage, batchHash, batch);
      procurementLog.info('vendor.mapping.batch.cached', {
        requestId,
        vendorId,
        batchNumber,
        extractedLines: batch.lineItems.length,
      });
    }
    lineItems.push(...batch.lineItems);
    ambiguities.push(...batch.ambiguities);
  }

  return rawExtractedResponseSchema.parse({
    lineItems,
    qualificationAnswers: metadata.qualificationAnswers,
    commercialTerms: metadata.commercialTerms,
    ambiguities,
    clarificationRequired: ambiguities.some((ambiguity) => ambiguity.resolution === 'CLARIFY_VENDOR'),
  });
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
    raw = await mapInBatches(vendorId, source.content, artifact.fileName, artifact.id, mappingHash, provider, requestId);
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
