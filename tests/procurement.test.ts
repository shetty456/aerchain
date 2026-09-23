import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeResponse } from '../src/lib/ingestion/canonicalize';
import { normalizeUnitPrice } from '../src/lib/procurement/normalization';
import { getQualificationStatus } from '../src/lib/procurement/qualification';
import { vendorResponseSchema, type RawExtractedResponse } from '../src/lib/procurement/schemas';

test('normalizes USD, per-100 pricing and discount deterministically', () => {
  assert.equal(normalizeUnitPrice({ rawPrice: 1000, currency: 'USD', priceBasis: 100, discountPercent: 5 }), 826.5);
});

test('keeps unknown hard-gate qualification incomplete rather than failed', () => {
  const response = vendorResponseSchema.parse({
    vendorId: 'vendor-c', artifactId: 'artifact-c', processedAt: new Date().toISOString(), lineItems: [],
    qualificationAnswers: [
      { questionId: 'warranty', answer: 'YES' },
      { questionId: 'delivery', answer: 'YES' },
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
