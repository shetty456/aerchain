import assert from 'node:assert/strict';
import test from 'node:test';
import { applyConfirmedClarifications } from '../src/lib/procurement/clarification';
import { vendorResponseSchema } from '../src/lib/procurement/schemas';

const response = vendorResponseSchema.parse({
  vendorId: 'vendor-a', artifactId: 'artifact-a', processedAt: new Date().toISOString(),
  lineItems: [{
    rfxLineId: 'HW-001', matchStatus: 'MATCHED', quotedDescription: 'Latitude 5450', quotedQuantity: 100,
    rawPrice: 72_000, normalizedUnitPrice: 72_000, rawCurrency: 'INR', normalizedCurrency: 'INR', rawUnit: 'each', normalizedUnit: 'each',
    specificationMatch: 'UNKNOWN', specificationDeviations: [], missingInformation: ['Windows edition'], status: 'AWAITING_CLARIFICATION', evidence: [],
  }],
  qualificationAnswers: [],
  commercialTerms: { currency: 'INR', freight: 'UNKNOWN', tax: 'UNKNOWN', paymentTerms: null, deliveryLeadTimeDays: null, warrantyMonths: null, quoteValidityDays: null, discountPercent: null, minimumOrderCondition: null, evidence: [] },
  ambiguities: [], clarificationRequired: true,
});

test('applies only explicitly confirmed clarification resolutions with evidence', () => {
  const updated = applyConfirmedClarifications(response, [{ rfxLineId: 'HW-001', confirmed: true, detail: 'Windows 11 Pro confirmed', evidenceExcerpt: 'HW-001 includes Windows 11 Pro.' }]);
  assert.equal(updated.lineItems[0].status, 'VERIFIED');
  assert.equal(updated.lineItems[0].specificationMatch, 'MEETS');
  assert.equal(updated.lineItems[0].missingInformation.length, 0);
  assert.equal(updated.lineItems[0].evidence[0].excerpt, 'HW-001 includes Windows 11 Pro.');
});

test('does not change a line when the vendor did not confirm it', () => {
  const updated = applyConfirmedClarifications(response, [{ rfxLineId: 'HW-001', confirmed: false, detail: 'Not answered', evidenceExcerpt: 'No confirmation supplied.' }]);
  assert.equal(updated.lineItems[0].status, 'AWAITING_CLARIFICATION');
  assert.deepEqual(updated.lineItems[0].missingInformation, ['Windows edition']);
});
