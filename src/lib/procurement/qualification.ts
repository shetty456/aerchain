import type { VendorResponse } from './schemas';

const HARD_GATES = ['authorized-reseller', 'warranty', 'delivery'] as const;

export function getQualificationStatus(response: VendorResponse) {
  const answers = new Map(response.qualificationAnswers.map((answer) => [answer.questionId, answer.answer]));
  const failed = HARD_GATES.filter((gate) => answers.get(gate) === 'NO');
  const unknown = HARD_GATES.filter((gate) => !answers.has(gate) || answers.get(gate) === 'UNKNOWN');

  if (failed.length > 0) return { status: 'DISQUALIFIED' as const, failed, unknown };
  if (unknown.length > 0) return { status: 'INCOMPLETE' as const, failed, unknown };
  return { status: 'QUALIFIED' as const, failed, unknown };
}
