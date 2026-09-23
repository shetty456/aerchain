import 'server-only';

import { windowsHardwareEvent } from '@/data/windows-hardware-fy27';
import { processVendorResponse, type VendorProcessingStage } from '@/lib/ingestion/pipeline';
import { procurementLog } from '@/lib/observability/logger';
import { deleteRuntimeDocument, readRuntimeDocument, writeRuntimeDocument } from '@/lib/storage/runtime-documents';

export type DemoVendorStatus = 'QUEUED' | VendorProcessingStage | 'READY' | 'FAILED';
type VendorResult = { normalizedLines: number; exceptionLines: number };

export type DemoRunState = {
  runId: string;
  eventId: string;
  mode?: 'LIVE' | 'SHOWCASE_REPLAY';
  fresh?: boolean;
  cacheScope?: string;
  status: 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS';
  createdAt: string;
  updatedAt: string;
  vendors: Record<string, {
    status: DemoVendorStatus;
    normalizedLines?: number;
    exceptionLines?: number;
    cached?: boolean;
    error?: string;
    updatedAt: string;
    history?: Array<{ status: DemoVendorStatus; at: string }>;
  }>;
  replayResults?: Record<string, VendorResult>;
};

async function readState() {
  return readRuntimeDocument<DemoRunState>('event-run');
}

async function writeState(state: DemoRunState) {
  await writeRuntimeDocument('event-run', state);
}

async function updateVendor(runId: string, vendorId: string, update: Partial<DemoRunState['vendors'][string]>) {
  const state = await readState();
  if (!state || state.runId !== runId) return;
  const now = new Date().toISOString();
  const current = state.vendors[vendorId];
  const nextStatus = update.status ?? current.status;
  state.vendors[vendorId] = {
    ...current,
    ...update,
    updatedAt: now,
    history: nextStatus === current.status ? current.history : [...(current.history ?? []), { status: nextStatus, at: now }],
  };
  state.updatedAt = now;
  await writeState(state);
}

function emptyRun(fresh: boolean): DemoRunState {
  const now = new Date().toISOString();
  const runId = crypto.randomUUID();
  return {
    runId,
    eventId: windowsHardwareEvent.id,
    mode: 'LIVE',
    fresh,
    cacheScope: fresh ? runId : undefined,
    status: 'RUNNING',
    createdAt: now,
    updatedAt: now,
    vendors: Object.fromEntries(windowsHardwareEvent.invitedVendors.map((vendor) => [vendor.id, {
      status: 'QUEUED', updatedAt: now, history: [{ status: 'QUEUED', at: now }],
    }])),
  };
}

export async function startDemoRun(options: { fresh?: boolean } = {}) {
  const existing = await readState();
  if (existing?.status === 'RUNNING') return existing;
  const state = emptyRun(Boolean(options.fresh));
  if (options.fresh) {
    await writeRuntimeDocument('clarifications', {});
    await deleteRuntimeDocument('award');
  }
  await writeState(state);
  procurementLog.info('demo.run.created', { runId: state.runId, fresh: state.fresh, orchestration: 'resumable-request' });
  return state;
}

export async function getDemoRun() {
  return readState();
}

const replayPause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function finishIfSettled(runId: string) {
  const state = await readState();
  if (!state || state.runId !== runId) return state;
  const vendors = Object.values(state.vendors);
  if (vendors.some((vendor) => !['READY', 'FAILED'].includes(vendor.status))) return state;
  state.status = vendors.some((vendor) => vendor.status === 'FAILED') ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
  state.updatedAt = new Date().toISOString();
  await writeState(state);
  procurementLog.info(state.mode === 'SHOWCASE_REPLAY' ? 'demo.replay.completed' : 'demo.run.completed', {
    runId, status: state.status, ...(state.mode === 'SHOWCASE_REPLAY' ? { aiRequests: 0 } : {}),
  });
  return state;
}

async function advanceReplay(state: DemoRunState, vendorId: string) {
  const saved = state.replayResults?.[vendorId];
  if (!saved) {
    await updateVendor(state.runId, vendorId, { status: 'FAILED', error: 'No saved showcase result is available.' });
    return finishIfSettled(state.runId);
  }
  await updateVendor(state.runId, vendorId, { status: 'EXTRACTING', error: undefined });
  await replayPause(450);
  await updateVendor(state.runId, vendorId, { status: 'MAPPING' });
  await replayPause(550);
  await updateVendor(state.runId, vendorId, { status: 'NORMALIZING' });
  await replayPause(350);
  await updateVendor(state.runId, vendorId, { ...saved, status: 'READY', cached: true, error: undefined });
  return finishIfSettled(state.runId);
}

async function advanceLive(state: DemoRunState, vendorId: string) {
  try {
    const result = await processVendorResponse(vendorId, undefined, crypto.randomUUID(), {
      cacheScope: state.cacheScope,
      onStage: (status) => updateVendor(state.runId, vendorId, { status, error: undefined }),
    });
    const lines = result.response.lineItems;
    await updateVendor(state.runId, vendorId, {
      status: 'READY',
      normalizedLines: lines.filter((line) => line.normalizedUnitPrice !== null).length,
      exceptionLines: lines.filter((line) => !['VERIFIED', 'NORMALIZED'].includes(line.status)).length,
      cached: result.ingestion.cached,
      error: undefined,
    });
  } catch (error) {
    await updateVendor(state.runId, vendorId, { status: 'FAILED', error: error instanceof Error ? error.message : 'Processing failed.' });
  }
  return finishIfSettled(state.runId);
}

export async function advanceDemoRun() {
  const state = await readState();
  if (!state) throw new Error('No demo run exists.');
  if (state.status !== 'RUNNING') return state;
  const next = windowsHardwareEvent.invitedVendors.find((vendor) => state.vendors[vendor.id]?.status === 'QUEUED');
  if (!next) return finishIfSettled(state.runId);
  procurementLog.info('demo.run.step.started', { runId: state.runId, vendorId: next.id, mode: state.mode, fresh: state.fresh });
  return state.mode === 'SHOWCASE_REPLAY' ? advanceReplay(state, next.id) : advanceLive(state, next.id);
}

export async function replayDemoRun() {
  const current = await readState();
  if (current?.status === 'RUNNING') throw new Error('A response journey is already running.');
  const showcase = await readRuntimeDocument<DemoRunState>('showcase-event-run') ?? current;
  if (!showcase) throw new Error('No saved showcase is available.');
  const replayResults = Object.fromEntries(windowsHardwareEvent.invitedVendors.map((vendor) => {
    const result = showcase.vendors[vendor.id];
    if (result?.status !== 'READY' || result.normalizedLines === undefined || result.exceptionLines === undefined) {
      throw new Error('A complete five-vendor showcase is required before replaying it.');
    }
    return [vendor.id, { normalizedLines: result.normalizedLines, exceptionLines: result.exceptionLines }];
  }));
  const clarifications = await readRuntimeDocument('showcase-clarifications');
  const award = await readRuntimeDocument('showcase-award');
  if (clarifications) await writeRuntimeDocument('clarifications', clarifications);
  if (award) await writeRuntimeDocument('award', award); else await deleteRuntimeDocument('award');
  const state = emptyRun(false);
  state.mode = 'SHOWCASE_REPLAY';
  state.replayResults = replayResults;
  await writeState(state);
  procurementLog.info('demo.replay.created', { runId: state.runId, orchestration: 'resumable-request' });
  return state;
}

export async function retryDemoVendor(vendorId: string) {
  if (!windowsHardwareEvent.invitedVendors.some((vendor) => vendor.id === vendorId)) throw new Error('Unknown vendor.');
  const state = await readState();
  if (!state) throw new Error('No demo run exists.');
  const now = new Date().toISOString();
  state.vendors[vendorId] = { ...state.vendors[vendorId], status: 'QUEUED', error: undefined, updatedAt: now, history: [...(state.vendors[vendorId].history ?? []), { status: 'QUEUED', at: now }] };
  state.status = 'RUNNING';
  state.updatedAt = now;
  await writeState(state);
  return state;
}
