import 'server-only';

import { windowsHardwareEvent } from '@/data/windows-hardware-fy27';
import { getAward } from './award-manager';
import { getClarifications } from './clarification-manager';
import { getDemoRun, type DemoVendorStatus } from './run-manager';

export type AuditEvent = { id: string; at: string; title: string; detail: string; kind: 'EVENT' | 'RESPONSE' | 'CLARIFICATION' | 'DECISION' };

const stageCopy: Record<DemoVendorStatus, string> = {
  QUEUED: 'Response received and queued',
  EXTRACTING: 'Document extraction started',
  MAPPING: 'RFx line mapping started',
  NORMALIZING: 'Commercial normalization started',
  READY: 'Response ready for comparison',
  FAILED: 'Response processing needs attention',
};

const clarificationCopy: Record<string, string> = {
  GENERATING: 'Factual clarification drafted',
  SENT: 'Clarification sent to supplier',
  RESPONSE_RECEIVED: 'Supplier clarification received',
  REPROCESSING: 'Clarification reprocessing started',
  COMPLETED: 'Comparison updated from confirmed facts',
  FAILED: 'Clarification needs attention',
};

export async function getAuditTrail(): Promise<AuditEvent[]> {
  const [run, clarifications, award] = await Promise.all([getDemoRun(), getClarifications(), getAward()]);
  if (!run) return [];
  const events: AuditEvent[] = [{ id: `run-${run.runId}`, at: run.createdAt, title: 'RFx sent to 5 suppliers', detail: run.mode === 'SHOWCASE_REPLAY' ? 'Showcase replay started from saved, validated results.' : 'Windows Hardware FY27 response window opened.', kind: 'EVENT' }];
  for (const vendor of windowsHardwareEvent.invitedVendors) {
    const state = run.vendors[vendor.id];
    const history = state.history?.length ? state.history : [{ status: state.status, at: state.updatedAt }];
    history.forEach((entry, index) => events.push({ id: `${run.runId}-${vendor.id}-${index}`, at: entry.at, title: stageCopy[entry.status], detail: `${vendor.name} · ${vendor.responseFormat}`, kind: 'RESPONSE' }));
    const clarification = clarifications[vendor.id];
    clarification?.history.forEach((entry, index) => events.push({ id: `clarification-${vendor.id}-${index}`, at: entry.at, title: clarificationCopy[entry.status] ?? entry.status, detail: vendor.name, kind: 'CLARIFICATION' }));
  }
  if (award) {
    events.push({ id: `award-${award.id}`, at: award.createdAt, title: 'Award recommendation calculated', detail: `${award.allocations.length} lines allocated using qualified, eligible quotes.`, kind: 'DECISION' });
    if (award.acceptedAt) events.push({ id: `award-${award.id}-accepted`, at: award.acceptedAt, title: 'Award recommendation accepted', detail: 'Buyer explicitly accepted the recommendation.', kind: 'DECISION' });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}
