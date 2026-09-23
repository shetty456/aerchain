import 'server-only';

import { windowsHardwareEvent } from '@/data/windows-hardware-fy27';
import { processVendorResponse, type VendorProcessingStage } from '@/lib/ingestion/pipeline';
import { procurementLog } from '@/lib/observability/logger';
import { readRuntimeDocument, writeRuntimeDocument } from '@/lib/storage/runtime-documents';

export type DemoVendorStatus = 'QUEUED' | VendorProcessingStage | 'READY' | 'FAILED';
export type DemoRunState = {
  runId: string;
  eventId: string;
  mode?: 'LIVE' | 'SHOWCASE_REPLAY';
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
  replayResults?: Record<string, {
    normalizedLines: number;
    exceptionLines: number;
  }>;
};

const demoGlobal = globalThis as typeof globalThis & {
  __aerchainActiveWorkers?: Map<string, Promise<void>>;
  __aerchainWriteQueue?: Promise<void>;
};
const activeWorkers = demoGlobal.__aerchainActiveWorkers ??= new Map<string, Promise<void>>();
demoGlobal.__aerchainWriteQueue ??= Promise.resolve();

async function readState(): Promise<DemoRunState | null> {
  return readRuntimeDocument<DemoRunState>('event-run');
}

async function writeState(state: DemoRunState) {
  const operation = demoGlobal.__aerchainWriteQueue!.then(async () => {
    await writeRuntimeDocument('event-run', state);
  });
  demoGlobal.__aerchainWriteQueue = operation.catch(() => undefined);
  await operation;
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

async function executeRun(runId: string, vendorIds = windowsHardwareEvent.invitedVendors.map((vendor) => vendor.id)) {
  procurementLog.info('demo.run.started', { runId });
  for (const vendor of windowsHardwareEvent.invitedVendors.filter((item) => vendorIds.includes(item.id))) {
    const current = await readState();
    if (!current || current.runId !== runId) return;
    if (current.vendors[vendor.id]?.status === 'READY') continue;
    try {
      const result = await processVendorResponse(vendor.id, undefined, crypto.randomUUID(), {
        onStage: (status) => updateVendor(runId, vendor.id, { status, error: undefined }),
      });
      const lineItems = result.response.lineItems;
      await updateVendor(runId, vendor.id, {
        status: 'READY',
        normalizedLines: lineItems.filter((line) => line.normalizedUnitPrice !== null).length,
        exceptionLines: lineItems.filter((line) => !['VERIFIED', 'NORMALIZED'].includes(line.status)).length,
        cached: result.ingestion.cached,
        error: undefined,
      });
    } catch (error) {
      await updateVendor(runId, vendor.id, {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Processing failed.',
      });
    }
  }
  const state = await readState();
  if (!state || state.runId !== runId) return;
  const failed = Object.values(state.vendors).some((vendor) => vendor.status === 'FAILED');
  state.status = failed ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
  state.updatedAt = new Date().toISOString();
  await writeState(state);
  procurementLog.info('demo.run.completed', { runId, status: state.status });
}

const replayPause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function executeShowcaseReplay(runId: string) {
  procurementLog.info('demo.replay.started', { runId });
  for (const vendor of windowsHardwareEvent.invitedVendors) {
    const current = await readState();
    if (!current || current.runId !== runId) return;
    if (current.vendors[vendor.id]?.status === 'READY') continue;
    const saved = current.replayResults?.[vendor.id];
    if (!saved) {
      await updateVendor(runId, vendor.id, { status: 'FAILED', error: 'No saved showcase result is available.' });
      continue;
    }
    await updateVendor(runId, vendor.id, { status: 'EXTRACTING', error: undefined });
    await replayPause(500);
    await updateVendor(runId, vendor.id, { status: 'MAPPING' });
    await replayPause(650);
    await updateVendor(runId, vendor.id, { status: 'NORMALIZING' });
    await replayPause(450);
    await updateVendor(runId, vendor.id, {
      status: 'READY',
      normalizedLines: saved.normalizedLines,
      exceptionLines: saved.exceptionLines,
      cached: true,
      error: undefined,
    });
    await replayPause(250);
  }
  const state = await readState();
  if (!state || state.runId !== runId) return;
  const failed = Object.values(state.vendors).some((vendor) => vendor.status === 'FAILED');
  state.status = failed ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
  state.updatedAt = new Date().toISOString();
  await writeState(state);
  procurementLog.info('demo.replay.completed', { runId, status: state.status, aiRequests: 0 });
}

function launchWorker(runId: string, vendorIds?: string[], mode: DemoRunState['mode'] = 'LIVE') {
  if (activeWorkers.has(runId)) return;
  const worker = (mode === 'SHOWCASE_REPLAY' ? executeShowcaseReplay(runId) : executeRun(runId, vendorIds))
    .catch((error) => procurementLog.error('demo.run.failed', { runId, error: error instanceof Error ? error.message : 'Unknown error' }))
    .finally(() => activeWorkers.delete(runId));
  activeWorkers.set(runId, worker);
}

export async function startDemoRun() {
  const existing = await readState();
  if (existing?.status === 'RUNNING') {
    launchWorker(existing.runId, undefined, existing.mode);
    return existing;
  }
  const now = new Date().toISOString();
  const state: DemoRunState = {
    runId: crypto.randomUUID(),
    eventId: windowsHardwareEvent.id,
    mode: 'LIVE',
    status: 'RUNNING',
    createdAt: now,
    updatedAt: now,
    vendors: Object.fromEntries(windowsHardwareEvent.invitedVendors.map((vendor) => [vendor.id, { status: 'QUEUED', updatedAt: now, history: [{ status: 'QUEUED', at: now }] }])),
  };
  await writeState(state);
  launchWorker(state.runId);
  return state;
}

export async function getDemoRun() {
  const state = await readState();
  if (state?.status === 'RUNNING') launchWorker(state.runId, undefined, state.mode);
  return state;
}

export async function replayDemoRun() {
  const existing = await readState();
  if (!existing) throw new Error('Process the supplier responses once before replaying the showcase.');
  if (existing.status === 'RUNNING') throw new Error('A response journey is already running.');
  const replayResults = Object.fromEntries(windowsHardwareEvent.invitedVendors.map((vendor) => {
    const result = existing.vendors[vendor.id];
    if (result?.status !== 'READY' || result.normalizedLines === undefined || result.exceptionLines === undefined) {
      throw new Error('A complete five-vendor result is required before replaying the showcase.');
    }
    return [vendor.id, { normalizedLines: result.normalizedLines, exceptionLines: result.exceptionLines }];
  }));
  const now = new Date().toISOString();
  const state: DemoRunState = {
    runId: crypto.randomUUID(),
    eventId: windowsHardwareEvent.id,
    mode: 'SHOWCASE_REPLAY',
    status: 'RUNNING',
    createdAt: now,
    updatedAt: now,
    vendors: Object.fromEntries(windowsHardwareEvent.invitedVendors.map((vendor) => [vendor.id, { status: 'QUEUED', updatedAt: now, history: [{ status: 'QUEUED', at: now }] }])),
    replayResults,
  };
  await writeState(state);
  launchWorker(state.runId, undefined, state.mode);
  return state;
}

export async function retryDemoVendor(vendorId: string) {
  if (!windowsHardwareEvent.invitedVendors.some((vendor) => vendor.id === vendorId)) throw new Error('Unknown vendor.');
  const state = await readState();
  if (!state) throw new Error('No demo run exists.');
  state.vendors[vendorId] = { ...state.vendors[vendorId], status: 'QUEUED', error: undefined, updatedAt: new Date().toISOString() };
  state.status = 'RUNNING';
  state.updatedAt = new Date().toISOString();
  await writeState(state);
  const finishingWorker = activeWorkers.get(state.runId);
  if (finishingWorker) await finishingWorker;
  launchWorker(state.runId, [vendorId]);
  return state;
}
