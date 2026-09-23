import type { VendorResponse } from './schemas';

export type ClarificationResolution = {
  rfxLineId: string;
  confirmed: boolean;
  detail: string;
  evidenceExcerpt: string;
};

export function applyConfirmedClarifications(response: VendorResponse, resolutions: ClarificationResolution[]): VendorResponse {
  const confirmed = new Map(resolutions.filter((item) => item.confirmed).map((item) => [item.rfxLineId, item]));
  return {
    ...response,
    lineItems: response.lineItems.map((line) => {
      if (!line.rfxLineId || !confirmed.has(line.rfxLineId)) return line;
      const resolution = confirmed.get(line.rfxLineId)!;
      return {
        ...line,
        specificationMatch: 'MEETS',
        missingInformation: [],
        status: line.normalizedUnitPrice === null ? 'UNRESOLVED' : line.status === 'NORMALIZED' ? 'NORMALIZED' : 'VERIFIED',
        evidence: [...line.evidence, {
          artifactId: `clarification-${response.vendorId}`,
          fileName: `${response.vendorId}-clarification-email.txt`,
          location: 'vendor clarification reply',
          excerpt: resolution.evidenceExcerpt,
          providerSource: null,
        }],
      };
    }),
  };
}
