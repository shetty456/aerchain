import type { VendorResponse } from './schemas';

export type ClarificationResolution = {
  rfxLineId: string;
  confirmed: boolean;
  detail: string;
  evidenceExcerpt: string;
};

export type QualificationClarificationResolution = {
  questionId: string;
  answer: 'YES' | 'NO' | 'UNKNOWN';
  detail: string;
  evidenceExcerpt: string;
};

export function applyConfirmedClarifications(
  response: VendorResponse,
  resolutions: ClarificationResolution[],
  qualificationResolutions: QualificationClarificationResolution[] = [],
): VendorResponse {
  const confirmed = new Map(resolutions.filter((item) => item.confirmed).map((item) => [item.rfxLineId, item]));
  const qualificationUpdates = new Map(qualificationResolutions.map((item) => [item.questionId, item]));
  const existingQualificationIds = new Set(response.qualificationAnswers.map((answer) => answer.questionId));
  const clarificationEvidence = (excerpt: string) => ({
    artifactId: `clarification-${response.vendorId}`,
    fileName: `${response.vendorId}-clarification-email.txt`,
    location: 'vendor clarification reply',
    excerpt,
    providerSource: null,
  });
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
        evidence: [...line.evidence, clarificationEvidence(resolution.evidenceExcerpt)],
      };
    }),
    qualificationAnswers: [
      ...response.qualificationAnswers.map((answer) => {
        const update = qualificationUpdates.get(answer.questionId);
        if (!update || answer.answer !== 'UNKNOWN') return answer;
        return { ...answer, answer: update.answer, detail: update.detail, evidence: [...answer.evidence, clarificationEvidence(update.evidenceExcerpt)] };
      }),
      ...qualificationResolutions
        .filter((update) => !existingQualificationIds.has(update.questionId))
        .map((update) => ({ questionId: update.questionId, answer: update.answer, detail: update.detail, evidence: [clarificationEvidence(update.evidenceExcerpt)] })),
    ],
  };
}
