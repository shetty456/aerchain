import { type z } from 'zod';
import { ambiguitySchema, rawExtractedLineSchema } from './schemas';

type RawLine = z.infer<typeof rawExtractedLineSchema>;
type Ambiguity = z.infer<typeof ambiguitySchema>;

export function deriveLineAmbiguities(lines: RawLine[]): Ambiguity[] {
  return lines.flatMap((line, index) => {
    const hasFactualGap = line.matchStatus === 'AMBIGUOUS'
      || line.specificationMatch === 'AMBIGUOUS'
      || line.specificationMatch === 'UNKNOWN'
      || line.missingInformation.length > 0;
    const hasJudgmentIssue = line.specificationMatch === 'DEVIATES'
      || line.specificationDeviations.length > 0
      || line.matchStatus === 'UNMATCHED';
    if (!hasFactualGap && !hasJudgmentIssue) return [];
    const details = [...line.specificationDeviations, ...line.missingInformation];
    return [{
      id: `derived-${line.candidateRfxLineId ?? 'unmatched'}-${index + 1}`,
      lineId: line.candidateRfxLineId,
      type: hasJudgmentIssue ? 'JUDGMENT' as const : 'FACTUAL' as const,
      issue: details.join('; ') || (hasJudgmentIssue ? 'The quoted item requires buyer review.' : 'The quoted specification requires vendor confirmation.'),
      resolution: hasJudgmentIssue ? 'BUYER_REVIEW' as const : 'CLARIFY_VENDOR' as const,
    }];
  });
}
