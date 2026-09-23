import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeResponse } from '../src/lib/ingestion/canonicalize';
import { normalizeUnitPrice } from '../src/lib/procurement/normalization';
import { getQualificationStatus } from '../src/lib/procurement/qualification';
import { vendorResponseSchema, type RawExtractedResponse } from '../src/lib/procurement/schemas';
import { rawExtractedResponseSchema } from '../src/lib/procurement/schemas';
import { z } from 'zod';
import { windowsHardwareEvent } from '../src/data/windows-hardware-fy27';
import { analyzeProcurement, type AnalysisVendor } from '../src/lib/procurement/analysis';

function assertStrictObjects(node: unknown, location = '$') {
  if (!node || typeof node !== 'object') return;
  const schema = node as Record<string, unknown>;
  if (schema.properties && typeof schema.properties === 'object') {
    const keys = Object.keys(schema.properties);
    assert.deepEqual(schema.required, keys, `${location} must require every property for Groq strict mode`);
    assert.equal(schema.additionalProperties, false, `${location} must reject additional properties`);
  }
  for (const [key, child] of Object.entries(schema)) assertStrictObjects(child, `${location}/${key}`);
}

test('raw extraction JSON schema satisfies Groq strict object requirements', () => {
  assertStrictObjects(z.toJSONSchema(rawExtractedResponseSchema, { unrepresentable: 'any' }));
});

test('normalizes USD, per-100 pricing and discount deterministically', () => {
  assert.equal(normalizeUnitPrice({ rawPrice: 1000, currency: 'USD', priceBasis: 100, discountPercent: 5 }), 826.5);
});

test('keeps unknown hard-gate qualification incomplete rather than failed', () => {
  const response = vendorResponseSchema.parse({
    vendorId: 'vendor-c', artifactId: 'artifact-c', processedAt: new Date().toISOString(), lineItems: [],
    qualificationAnswers: [
      { questionId: 'warranty', answer: 'YES', detail: null, evidence: [] },
      { questionId: 'delivery', answer: 'YES', detail: null, evidence: [] },
    ],
    commercialTerms: { currency: 'INR', freight: 'UNKNOWN', tax: 'UNKNOWN', paymentTerms: null, deliveryLeadTimeDays: null, warrantyMonths: null, quoteValidityDays: null, discountPercent: null, minimumOrderCondition: null, evidence: [] },
    ambiguities: [], clarificationRequired: true,
  });
  assert.deepEqual(getQualificationStatus(response), {
    status: 'INCOMPLETE', failed: [], unknown: ['authorized-reseller'],
  });
});

test('adds missing RFx lines and applies commercial discount in code', () => {
  const raw: RawExtractedResponse = {
    lineItems: [{
      candidateRfxLineId: 'HW-001', matchStatus: 'MATCHED', quotedDescription: 'Latitude 5450',
      quotedQuantity: 100, rawPrice: 100_000, rawCurrency: 'INR', priceBasis: 1, rawUnit: 'each',
      specificationMatch: 'AMBIGUOUS', specificationDeviations: [], missingInformation: ['Windows edition'], evidence: [],
    }],
    qualificationAnswers: [],
    commercialTerms: { currency: 'INR', freight: 'INCLUDED', tax: 'EXCLUDED', paymentTerms: null, deliveryLeadTimeDays: null, warrantyMonths: null, quoteValidityDays: null, discountPercent: 4.5, minimumOrderCondition: null, evidence: [] },
    ambiguities: [{ id: 'amb-1', lineId: 'HW-001', type: 'FACTUAL', issue: 'Windows edition is missing.', resolution: 'CLARIFY_VENDOR' }],
    clarificationRequired: true,
  };
  const response = normalizeResponse('vendor-b', 'artifact-b', raw);
  assert.equal(response.lineItems.length, 30);
  assert.equal(response.lineItems[0].normalizedUnitPrice, 95_500);
  assert.equal(response.lineItems[0].status, 'AWAITING_CLARIFICATION');
  assert.equal(response.lineItems[1].status, 'MISSING');
});

test('analysis filters lines before performing deterministic calculations', () => {
  const selectedLines = windowsHardwareEvent.lineItems.slice(0, 2);
  const response = vendorResponseSchema.parse({
    vendorId: 'vendor-a', artifactId: 'artifact-a', processedAt: new Date().toISOString(),
    lineItems: selectedLines.map((line, index) => ({
      rfxLineId: line.id, matchStatus: 'MATCHED', quotedDescription: line.requestedProduct,
      quotedQuantity: line.quantity, rawPrice: 1000 + index, normalizedUnitPrice: 1000 + index,
      rawCurrency: 'INR', normalizedCurrency: 'INR', rawUnit: line.unit, normalizedUnit: line.unit,
      specificationMatch: 'MEETS', specificationDeviations: [], missingInformation: [], status: 'VERIFIED', evidence: [],
    })),
    qualificationAnswers: [],
    commercialTerms: { currency: 'INR', freight: 'INCLUDED', tax: 'EXCLUDED', paymentTerms: null, deliveryLeadTimeDays: null, warrantyMonths: null, quoteValidityDays: null, discountPercent: null, minimumOrderCondition: null, evidence: [] },
    ambiguities: [], clarificationRequired: false,
  });
  const vendors: AnalysisVendor[] = [{ id: 'vendor-a', name: 'Nexora', qualification: 'QUALIFIED', response }];
  const result = analyzeProcurement({ operation: 'LINE_DETAIL', lineIds: [selectedLines[1].id], limit: 5 }, selectedLines, vendors) as { scope: { lineCount: number }; lines: Array<{ lineId: string }> };
  assert.equal(result.scope.lineCount, 1);
  assert.equal(result.lines[0].lineId, selectedLines[1].id);
});
