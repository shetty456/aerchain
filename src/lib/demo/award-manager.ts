import 'server-only';
import { windowsHardwareEvent } from '@/data/windows-hardware-fy27';
import { applyClarification, getClarifications } from './clarification-manager';
import { getDemoRun } from './run-manager';
import { processVendorResponse } from '@/lib/ingestion/pipeline';
import { analyzeProcurement, type AnalysisVendor } from '@/lib/procurement/analysis';
import { getQualificationStatus } from '@/lib/procurement/qualification';
import { readRuntimeDocument, writeRuntimeDocument } from '@/lib/storage/runtime-documents';

export type AwardRecommendation = { id: string; status: 'DRAFT' | 'ACCEPTED'; createdAt: string; acceptedAt?: string; allocations: Array<{ lineId: string; item: string; quantity: number; vendorId: string; vendor: string; unitPrice: number; lineTotal: number }>; spendByVendor: Array<{ vendor: string; spend: number; lines: number }>; totalSpend: number; baselineVendor?: string; baselineSpend?: number; savings?: number; unawardedLines: number; unawardedLineIds: string[]; caveats: string[] };
export async function getAward() { return readRuntimeDocument<AwardRecommendation>('award'); }
async function saveAward(award: AwardRecommendation) { await writeRuntimeDocument('award', award); }

export async function createAward() {
  const run = await getDemoRun(); if (!run) throw new Error('Process supplier responses before creating an award recommendation.');
  const clarifications = await getClarifications(); const vendors: AnalysisVendor[] = [];
  for (const vendor of windowsHardwareEvent.invitedVendors.filter((item) => run.vendors[item.id]?.status === 'READY')) { const result = await processVendorResponse(vendor.id, undefined, undefined, { cacheScope: run.cacheScope }); const response = applyClarification(result.response, clarifications[vendor.id]); vendors.push({ id: vendor.id, name: vendor.name, qualification: getQualificationStatus(response).status, response }); }
  const analysis = analyzeProcurement('SPLIT_AWARD_SAVINGS', windowsHardwareEvent.lineItems, vendors) as { selections: Array<AwardRecommendation['allocations'][number] | null>; splitTotal: number; cheapestSingle: { vendor: string; total: number } | null; savings: number | null };
  const allocations = analysis.selections.filter((item): item is AwardRecommendation['allocations'][number] => Boolean(item));
  const spend = new Map<string, { spend: number; lines: number }>(); for (const item of allocations) { const current = spend.get(item.vendor) ?? { spend: 0, lines: 0 }; current.spend += item.lineTotal; current.lines += 1; spend.set(item.vendor, current); }
  const awardedIds = new Set(allocations.map((item) => item.lineId));
  const unawardedLineIds = windowsHardwareEvent.lineItems.filter((line) => !awardedIds.has(line.id)).map((line) => line.id);
  const award: AwardRecommendation = { id: crypto.randomUUID(), status: 'DRAFT', createdAt: new Date().toISOString(), allocations, spendByVendor: [...spend].map(([vendor, value]) => ({ vendor, ...value })), totalSpend: analysis.splitTotal, baselineVendor: analysis.cheapestSingle?.vendor, baselineSpend: analysis.cheapestSingle?.total, savings: analysis.savings ?? undefined, unawardedLines: unawardedLineIds.length, unawardedLineIds, caveats: [analysis.cheapestSingle ? 'Savings are measured against the cheapest qualified vendor covering every eligible line.' : 'No qualified single-vendor baseline covers every eligible line.', 'Only VERIFIED and NORMALIZED quotes from qualified suppliers are allocated.', 'Buyer acceptance confirms this recommendation only; it does not create a purchase order.'] };
  await saveAward(award); return award;
}
export async function acceptAward() { const award = await getAward(); if (!award) throw new Error('Create an award recommendation first.'); if (award.unawardedLines > 0) throw new Error(`Recommendation cannot be accepted while ${award.unawardedLines} RFx lines remain unawarded. Recalculate after resolving them.`); const accepted = { ...award, status: 'ACCEPTED' as const, acceptedAt: new Date().toISOString() }; await saveAward(accepted); return accepted; }
