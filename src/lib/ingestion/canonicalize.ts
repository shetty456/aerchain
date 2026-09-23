import { windowsHardwareEvent } from '@/data/windows-hardware-fy27';
import { normalizeUnitPrice } from '@/lib/procurement/normalization';
import { vendorResponseSchema, type RawExtractedResponse, type VendorResponse } from '@/lib/procurement/schemas';

export function normalizeResponse(vendorId: string, artifactId: string, raw: RawExtractedResponse): VendorResponse {
  const byId = new Map(raw.lineItems.filter((line) => line.candidateRfxLineId).map((line) => [line.candidateRfxLineId, line]));
  const lineItems = windowsHardwareEvent.lineItems.map((rfxLine) => {
    const extracted = byId.get(rfxLine.id);
    if (!extracted) {
      return {
        rfxLineId: rfxLine.id, matchStatus: 'MISSING' as const, quotedDescription: 'Not quoted',
        quotedQuantity: null, rawPrice: null, normalizedUnitPrice: null, rawCurrency: null,
        normalizedCurrency: 'INR' as const, rawUnit: null, normalizedUnit: rfxLine.unit,
        specificationMatch: 'UNKNOWN' as const, specificationDeviations: [],
        missingInformation: ['Vendor did not quote this RFx line.'], status: 'MISSING' as const, evidence: [],
      };
    }

    const normalizedUnitPrice = extracted.rawPrice !== null && extracted.rawCurrency && extracted.priceBasis
      ? normalizeUnitPrice({ rawPrice: extracted.rawPrice, currency: extracted.rawCurrency, priceBasis: extracted.priceBasis, discountPercent: raw.commercialTerms.discountPercent })
      : null;
    const needsBuyer = raw.ambiguities.some((ambiguity) => ambiguity.lineId === rfxLine.id && ambiguity.type === 'JUDGMENT');
    const needsClarification = raw.ambiguities.some((ambiguity) => ambiguity.lineId === rfxLine.id && ambiguity.resolution === 'CLARIFY_VENDOR');
    const status = needsBuyer ? 'NEEDS_BUYER_REVIEW' as const
      : needsClarification ? 'AWAITING_CLARIFICATION' as const
        : extracted.specificationMatch === 'DEVIATES' ? 'SPEC_DEVIATION' as const
          : normalizedUnitPrice === null ? 'UNRESOLVED' as const
            : extracted.rawCurrency === 'USD' || extracted.priceBasis !== 1 || raw.commercialTerms.discountPercent
              ? 'NORMALIZED' as const : 'VERIFIED' as const;

    return {
      rfxLineId: rfxLine.id, matchStatus: extracted.matchStatus, quotedDescription: extracted.quotedDescription,
      quotedQuantity: extracted.quotedQuantity, rawPrice: extracted.rawPrice, normalizedUnitPrice,
      rawCurrency: extracted.rawCurrency, normalizedCurrency: 'INR' as const, rawUnit: extracted.rawUnit,
      normalizedUnit: rfxLine.unit, specificationMatch: extracted.specificationMatch,
      specificationDeviations: extracted.specificationDeviations, missingInformation: extracted.missingInformation,
      status, evidence: extracted.evidence,
    };
  });

  return vendorResponseSchema.parse({
    vendorId, artifactId, processedAt: new Date().toISOString(), lineItems,
    qualificationAnswers: raw.qualificationAnswers,
    commercialTerms: { ...raw.commercialTerms, currency: raw.commercialTerms.currency ?? 'INR' },
    ambiguities: raw.ambiguities, clarificationRequired: raw.clarificationRequired,
  });
}
