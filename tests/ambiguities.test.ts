import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveLineAmbiguities } from '../src/lib/procurement/ambiguities';

const baseLine = {
  candidateRfxLineId: 'HW-001',
  matchStatus: 'MATCHED' as const,
  quotedDescription: 'Latitude 5450',
  quotedQuantity: 100,
  rawPrice: 72_000,
  rawCurrency: 'INR' as const,
  priceBasis: 1,
  rawUnit: 'each',
  specificationMatch: 'MEETS' as const,
  specificationDeviations: [],
  missingInformation: [],
  evidence: [],
};

test('derives factual clarification from unknown specification details', () => {
  const result = deriveLineAmbiguities([{ ...baseLine, specificationMatch: 'UNKNOWN', missingInformation: ['Windows edition'] }]);
  assert.equal(result[0].type, 'FACTUAL');
  assert.equal(result[0].resolution, 'CLARIFY_VENDOR');
  assert.match(result[0].issue, /Windows edition/);
});

test('routes specification deviations to buyer review', () => {
  const result = deriveLineAmbiguities([{ ...baseLine, specificationMatch: 'DEVIATES', specificationDeviations: ['HP model substituted'] }]);
  assert.equal(result[0].type, 'JUDGMENT');
  assert.equal(result[0].resolution, 'BUYER_REVIEW');
});
