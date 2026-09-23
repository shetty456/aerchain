import 'server-only';

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { windowsHardwareEvent } from '@/data/windows-hardware-fy27';
import { processVendorResponse, type VendorProcessingStage } from '@/lib/ingestion/pipeline';
import { procurementLog } from '@/lib/observability/logger';

export type DemoVendorStatus = 'QUEUED' | VendorProcessingStage | 'READY' | 'FAILED';
export type DemoRunState = {
  runId: string;
  eventId: string;
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
  }>;
};

const statePath = path.join(process.env.PIPELINE_CACHE_DIR || path.join(process.cwd(), '.demo-runtime'), 'event-run.json');
const demoGlobal = globalThis as typeof globalThis & {
  __aerchainActiveWorkers?: Map<string, Promise<void>>;
  __aerchainWriteQueue?: Promise<void>;
};
const activeWorkers = demoGlobal.__aerchainActiveWorkers ??= new Map<string, Promise<void>>();
demoGlobal.__aerchainWriteQueue ??= Promise.resolve();

async function readState(): Promise<DemoRunState | null> {
  try {
    return JSON.parse(await readFile(statePath, 'utf8')) as DemoRunState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function writeState(state: DemoRunState) {
  const operation = demoGlobal.__aerchainWriteQueue!.then(async () => {
    await mkdir(path.dirname(statePath), { recursive: true });
    const temporary = `${statePath}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, statePath);
  });
  demoGlobal.__aerchainWriteQueue = operation.catch(() => undefined);
  await operation;
}

async function updateVendor(runId: string, vendorId: string, update: Partial<DemoRunState['vendors'][string]>) {
  const state = await readState();
  if (!state || state.runId !== runId) return;
  const now = new Date().toISOString();
  state.vendors[vendorId] = { ...state.vendors[vendorId], ...update, updatedAt: now };
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

function launchWorker(runId: string, vendorIds?: string[]) {
  if (activeWorkers.has(runId)) return;
  const worker = executeRun(runId, vendorIds)
    .catch((error) => procurementLog.error('demo.run.failed', { runId, error: error instanceof Error ? error.message : 'Unknown error' }))
    .finally(() => activeWorkers.delete(runId));
  activeWorkers.set(runId, worker);
}

export async function startDemoRun() {
  const existing = await readState();
  if (existing?.status === 'RUNNING') {
    launchWorker(existing.runId);
    return existing;
  }
  const now = new Date().toISOString();
  const state: DemoRunState = {
    runId: crypto.randomUUID(),
    eventId: windowsHardwareEvent.id,
    status: 'RUNNING',
    createdAt: now,
    updatedAt: now,
    vendors: Object.fromEntries(windowsHardwareEvent.invitedVendors.map((vendor) => [vendor.id, { status: 'QUEUED', updatedAt: now }])),
  };
  await writeState(state);
  launchWorker(state.runId);
  return state;
}

export async function getDemoRun() {
  const state = await readState();
  if (state?.status === 'RUNNING') launchWorker(state.runId);
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
