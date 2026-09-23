export const DEMO_USD_INR_RATE = 87;

export interface NormalizationInput {
  rawPrice: number;
  currency: 'INR' | 'USD';
  priceBasis: number;
  discountPercent?: number | null;
}

export function normalizeUnitPrice(input: NormalizationInput) {
  if (!Number.isFinite(input.rawPrice) || input.rawPrice < 0) throw new Error('Raw price must be non-negative.');
  if (!Number.isInteger(input.priceBasis) || input.priceBasis <= 0) throw new Error('Price basis must be a positive integer.');

  const inrPrice = input.currency === 'USD' ? input.rawPrice * DEMO_USD_INR_RATE : input.rawPrice;
  const discountMultiplier = 1 - (input.discountPercent ?? 0) / 100;
  return Math.round((inrPrice / input.priceBasis) * discountMultiplier * 100) / 100;
}
