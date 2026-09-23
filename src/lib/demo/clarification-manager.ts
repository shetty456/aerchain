import 'server-only';

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { windowsHardwareEvent } from '@/data/windows-hardware-fy27';
import { procurementAiProvider } from '@/lib/ai/procurement-provider';
import { CLARIFICATION_GUARDRAIL, PROCUREMENT_GUARDRAIL } from '@/lib/ai/prompts';
import { processVendorResponse } from '@/lib/ingestion/pipeline';
import { procurementLog } from '@/lib/observability/logger';
import { applyConfirmedClarifications } from '@/lib/procurement/clarification';
import type { VendorResponse } from '@/lib/procurement/schemas';

const questionSchema = z.object({
  subject: z.string(),
  questions: z.array(z.string()).min(1).max(3),
});

const resolutionSchema = z.object({
  resolutions: z.array(z.object({
    rfxLineId: z.string(),
    confirmed: z.boolean(),
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
  resolutions?: z.infer<typeof resolutionSchema>['resolutions'];
  error?: string;
  history: Array<{ status: string; at: string }>;
  updatedAt: string;
};

const clarificationPath = path.join(process.env.PIPELINE_CACHE_DIR || path.join(process.cwd(), '.demo-runtime'), 'clarifications.json');
const clarificationGlobal = globalThis as typeof globalThis & {
  __aerchainClarificationWorkers?: Map<string, Promise<void>>;
  __aerchainClarificationQueue?: Promise<void>;
};
const workers = clarificationGlobal.__aerchainClarificationWorkers ??= new Map<string, Promise<void>>();
clarificationGlobal.__aerchainClarificationQueue ??= Promise.resolve();

async function readRecords(): Promise<Record<string, ClarificationRecord>> {
  try {
    return JSON.parse(await readFile(clarificationPath, 'utf8')) as Record<string, ClarificationRecord>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

async function writeRecords(records: Record<string, ClarificationRecord>) {
  await mkdir(path.dirname(clarificationPath), { recursive: true });
  const temporary = `${clarificationPath}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, clarificationPath);
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

function simulatedReply(vendorId: string, issues: Array<{ lineId: string; issue: string }>) {
  const vendor = windowsHardwareEvent.invitedVendors.find((item) => item.id === vendorId)!;
  const confirmations = issues.map((issue) => `${issue.lineId}: Confirmed. Our quoted configuration includes the requested requirement concerning ${issue.issue}`).join('\n');
  return `Subject: Re: RFx factual clarification\n\nHello Procurement Team,\n\nPlease see our confirmations below:\n${confirmations}\n\nThese confirmations form part of our quotation. Commercial pricing is unchanged.\n\nRegards,\n${vendor.contactName}\n${vendor.name}`;
}

async function executeClarification(vendorId: string) {
  try {
    const { response } = await processVendorResponse(vendorId);
    const issues = response.ambiguities
      .filter((ambiguity): ambiguity is typeof ambiguity & { lineId: string } => ambiguity.type === 'FACTUAL' && ambiguity.resolution === 'CLARIFY_VENDOR' && Boolean(ambiguity.lineId))
      .slice(0, 3)
      .map((ambiguity) => ({ lineId: ambiguity.lineId, issue: ambiguity.issue }));
    if (!issues.length) throw new Error('This vendor has no factual line-item gaps available for autonomous clarification.');

    const question = await procurementAiProvider.generateStructured({
      schemaName: 'vendor_clarification_questions',
      schema: questionSchema,
      system: CLARIFICATION_GUARDRAIL,
      prompt: `Vendor: ${windowsHardwareEvent.invitedVendors.find((vendor) => vendor.id === vendorId)?.name}\nCreate one concise email covering these factual gaps. Keep the RFx line IDs in each question.\n\n${JSON.stringify(issues)}`,
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
    await updateRecord(vendorId, { status: 'COMPLETED', resolutions: interpreted.resolutions });
    procurementLog.info('clarification.completed', { vendorId, resolutionCount: interpreted.resolutions.length });
  } catch (error) {
    await updateRecord(vendorId, { status: 'FAILED', error: error instanceof Error ? error.message : 'Clarification failed.' });
    procurementLog.error('clarification.failed', { vendorId, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export async function startClarification(vendorId: string) {
  if (!windowsHardwareEvent.invitedVendors.some((vendor) => vendor.id === vendorId)) throw new Error('Unknown vendor.');
  const records = await readRecords();
  if (records[vendorId] && !['FAILED'].includes(records[vendorId].status)) return records[vendorId];
  const now = new Date().toISOString();
  records[vendorId] = { vendorId, status: 'GENERATING', history: [{ status: 'GENERATING', at: now }], updatedAt: now };
  await writeRecords(records);
  const worker = clarificationGlobal.__aerchainClarificationQueue!
    .then(() => executeClarification(vendorId))
    .finally(() => workers.delete(vendorId));
  clarificationGlobal.__aerchainClarificationQueue = worker.catch(() => undefined);
  workers.set(vendorId, worker);
  return records[vendorId];
}

export async function getClarifications() {
  return readRecords();
}

export function applyClarification(response: VendorResponse, record?: ClarificationRecord): VendorResponse {
  if (record?.status !== 'COMPLETED' || !record.resolutions?.length) return response;
  return applyConfirmedClarifications(response, record.resolutions);
}
