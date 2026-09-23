import 'server-only';

import { z } from 'zod';
import { windowsHardwareEvent } from '@/data/windows-hardware-fy27';
import { procurementAiProvider } from '@/lib/ai/procurement-provider';
import { CLARIFICATION_GUARDRAIL, PROCUREMENT_GUARDRAIL } from '@/lib/ai/prompts';
import { processVendorResponse } from '@/lib/ingestion/pipeline';
import { procurementLog } from '@/lib/observability/logger';
import { applyConfirmedClarifications } from '@/lib/procurement/clarification';
import type { VendorResponse } from '@/lib/procurement/schemas';
import { readRuntimeDocument, writeRuntimeDocument } from '@/lib/storage/runtime-documents';
import { getDemoRun } from './run-manager';

const questionSchema = z.object({
  subject: z.string(),
  questions: z.array(z.string()).min(1).max(3),
});

const resolutionSchema = z.object({
  lineResolutions: z.array(z.object({
    rfxLineId: z.string(),
    confirmed: z.boolean(),
    detail: z.string(),
    evidenceExcerpt: z.string(),
  })),
  qualificationResolutions: z.array(z.object({
    questionId: z.string(),
    answer: z.enum(['YES', 'NO', 'UNKNOWN']),
    detail: z.string(),
    evidenceExcerpt: z.string(),
  })),
});

export type ClarificationRecord = {
  vendorId: string;
  status: 'GENERATING' | 'SENT' | 'RESPONSE_RECEIVED' | 'REPROCESSING' | 'COMPLETED' | 'FAILED';
  subject?: string;
  questions?: string[];
  vendorReply?: string;
  resolutions?: z.infer<typeof resolutionSchema>['lineResolutions'];
  qualificationResolutions?: z.infer<typeof resolutionSchema>['qualificationResolutions'];
  error?: string;
  history: Array<{ status: string; at: string }>;
  updatedAt: string;
};

async function readRecords(): Promise<Record<string, ClarificationRecord>> {
  return await readRuntimeDocument<Record<string, ClarificationRecord>>('clarifications') ?? {};
}

async function writeRecords(records: Record<string, ClarificationRecord>) {
  await writeRuntimeDocument('clarifications', records);
}

async function updateRecord(vendorId: string, update: Partial<ClarificationRecord>) {
  const records = await readRecords();
  const current = records[vendorId];
  if (!current) return;
  const now = new Date().toISOString();
  const status = update.status ?? current.status;
  records[vendorId] = {
    ...current,
    ...update,
    updatedAt: now,
    history: status === current.status ? current.history : [...current.history, { status, at: now }],
  };
  await writeRecords(records);
}

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

type ClarificationIssue = { kind: 'LINE' | 'QUALIFICATION'; id: string; issue: string };

function simulatedReply(vendorId: string, issues: ClarificationIssue[]) {
  const vendor = windowsHardwareEvent.invitedVendors.find((item) => item.id === vendorId)!;
  const confirmations = issues.map((issue) => {
    if (issue.kind === 'QUALIFICATION') return `${issue.id}: YES. We explicitly confirm ${issue.issue}`;
    const line = windowsHardwareEvent.lineItems.find((item) => item.id === issue.id);
    const specifications = line?.mandatorySpecifications.join(', ') || issue.issue;
    return `${issue.id}: Confirmed. Our quoted configuration includes ${specifications}.`;
  }).join('\n');
  return `Subject: Re: RFx factual clarification\n\nHello Procurement Team,\n\nPlease see our confirmations below:\n${confirmations}\n\nThese confirmations form part of our quotation. Commercial pricing is unchanged.\n\nRegards,\n${vendor.contactName}\n${vendor.name}`;
}

async function executeClarification(vendorId: string) {
  try {
    const run = await getDemoRun();
    const result = await processVendorResponse(vendorId, undefined, undefined, { cacheScope: run?.cacheScope });
    const records = await readRecords();
    const previousResolutions = records[vendorId]?.resolutions ?? [];
    const previousQualificationResolutions = records[vendorId]?.qualificationResolutions ?? [];
    const response = applyConfirmedClarifications(result.response, previousResolutions, previousQualificationResolutions);
    const validLineIds = new Set(windowsHardwareEvent.lineItems.map((line) => line.id));
    const alreadyConfirmed = new Set(previousResolutions.filter((item) => item.confirmed).map((item) => item.rfxLineId));
    const uniqueIssues = new Map<string, string>();
    for (const ambiguity of response.ambiguities) {
      if (ambiguity.type !== 'FACTUAL' || ambiguity.resolution !== 'CLARIFY_VENDOR' || !ambiguity.lineId) continue;
      if (!validLineIds.has(ambiguity.lineId) || alreadyConfirmed.has(ambiguity.lineId) || uniqueIssues.has(ambiguity.lineId)) continue;
      uniqueIssues.set(ambiguity.lineId, ambiguity.issue);
    }
    const validQuestionIds = new Set(windowsHardwareEvent.qualificationQuestions.map((question) => question.id));
    const alreadyAnswered = new Set(previousQualificationResolutions.filter((item) => item.answer !== 'UNKNOWN').map((item) => item.questionId));
    const answerByQuestion = new Map(response.qualificationAnswers.map((answer) => [answer.questionId, answer.answer]));
    const hardGateQuestions = windowsHardwareEvent.qualificationQuestions.filter((question) => question.hardGate);
    const failedHardGates = hardGateQuestions.filter((question) => answerByQuestion.get(question.id) === 'NO');
    if (failedHardGates.length) throw new Error(`Supplier explicitly failed mandatory qualification: ${failedHardGates.map((question) => question.label).join(', ')}. Buyer review is required; autonomous clarification is stopped.`);
    const hardGateIssues: ClarificationIssue[] = hardGateQuestions
      .filter((question) => !alreadyAnswered.has(question.id) && (!answerByQuestion.has(question.id) || answerByQuestion.get(question.id) === 'UNKNOWN'))
      .map((question) => ({ kind: 'QUALIFICATION' as const, id: question.id, issue: question.description }));
    const optionalQualificationIssues: ClarificationIssue[] = windowsHardwareEvent.qualificationQuestions
      .filter((question) => !question.hardGate && !alreadyAnswered.has(question.id) && (!answerByQuestion.has(question.id) || answerByQuestion.get(question.id) === 'UNKNOWN'))
      .map((question) => ({ kind: 'QUALIFICATION' as const, id: question.id, issue: question.description }));
    const lineIssues: ClarificationIssue[] = [...uniqueIssues].map(([lineId, issue]) => ({ kind: 'LINE' as const, id: lineId, issue }));
    const issues = hardGateIssues.length ? hardGateIssues.slice(0, 3) : [...optionalQualificationIssues, ...lineIssues].slice(0, 3);
    if (!issues.length) throw new Error('This vendor has no factual gaps available for autonomous clarification.');

    const question = await procurementAiProvider.generateStructured({
      schemaName: 'vendor_clarification_questions',
      schema: questionSchema,
      system: CLARIFICATION_GUARDRAIL,
      prompt: `Vendor: ${windowsHardwareEvent.invitedVendors.find((vendor) => vendor.id === vendorId)?.name}\nCreate one concise email covering these factual gaps. Keep every supplied identifier in its question.\n\n${JSON.stringify(issues)}`,
      maxTokens: 1_200,
    });
    await updateRecord(vendorId, { status: 'SENT', subject: question.subject, questions: question.questions });
    await pause(700);

    const reply = simulatedReply(vendorId, issues);
    await updateRecord(vendorId, { status: 'RESPONSE_RECEIVED', vendorReply: reply });
    await pause(700);
    await updateRecord(vendorId, { status: 'REPROCESSING' });

    const interpreted = await procurementAiProvider.generateStructured({
      schemaName: 'vendor_clarification_resolution',
      schema: resolutionSchema,
      system: PROCUREMENT_GUARDRAIL,
      prompt: `Interpret this clarification reply only against the listed factual issues. Mark confirmed true only where the reply explicitly confirms the fact.\n\nIssues:\n${JSON.stringify(issues)}\n\nVendor reply:\n${reply}`,
      maxTokens: 1_500,
    });
    const merged = new Map(previousResolutions.map((item) => [item.rfxLineId, item]));
    for (const resolution of interpreted.lineResolutions) {
      if (validLineIds.has(resolution.rfxLineId)) merged.set(resolution.rfxLineId, resolution);
    }
    const mergedQualification = new Map(previousQualificationResolutions.map((item) => [item.questionId, item]));
    for (const resolution of interpreted.qualificationResolutions) {
      if (validQuestionIds.has(resolution.questionId)) mergedQualification.set(resolution.questionId, resolution);
    }
    await updateRecord(vendorId, { status: 'COMPLETED', resolutions: [...merged.values()], qualificationResolutions: [...mergedQualification.values()] });
    procurementLog.info('clarification.completed', { vendorId, lineResolutionCount: interpreted.lineResolutions.length, qualificationResolutionCount: interpreted.qualificationResolutions.length });
  } catch (error) {
    await updateRecord(vendorId, { status: 'FAILED', error: error instanceof Error ? error.message : 'Clarification failed.' });
    procurementLog.error('clarification.failed', { vendorId, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export async function startClarification(vendorId: string) {
  if (!windowsHardwareEvent.invitedVendors.some((vendor) => vendor.id === vendorId)) throw new Error('Unknown vendor.');
  const records = await readRecords();
  if (records[vendorId] && !['FAILED', 'COMPLETED'].includes(records[vendorId].status)) return records[vendorId];
  const now = new Date().toISOString();
  const previous = records[vendorId];
  records[vendorId] = {
    ...previous,
    vendorId,
    status: 'GENERATING',
    error: undefined,
    history: [...(previous?.history ?? []), { status: 'GENERATING', at: now }],
    updatedAt: now,
  };
  await writeRecords(records);
  await executeClarification(vendorId);
  return (await readRecords())[vendorId];
}

export async function getClarifications() {
  return readRecords();
}

export function applyClarification(response: VendorResponse, record?: ClarificationRecord): VendorResponse {
  if (!record) return response;
  return applyConfirmedClarifications(response, record.resolutions ?? [], record.qualificationResolutions ?? []);
}
