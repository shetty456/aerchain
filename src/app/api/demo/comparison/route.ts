import { windowsHardwareEvent } from '@/data/windows-hardware-fy27';
import { getDemoRun, getVendorCacheScope } from '@/lib/demo/run-manager';
import { applyClarification, getClarifications } from '@/lib/demo/clarification-manager';
import { processVendorResponse } from '@/lib/ingestion/pipeline';
import { getQualificationStatus } from '@/lib/procurement/qualification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const run = await getDemoRun();
  if (!run) return Response.json({ error: 'Send the RFx before opening comparison.' }, { status: 409 });
  const readyVendors = windowsHardwareEvent.invitedVendors.filter((vendor) => run.vendors[vendor.id]?.status === 'READY');
  const clarifications = await getClarifications();
  const vendors = [];
  for (const vendor of readyVendors) {
    const result = await processVendorResponse(vendor.id, undefined, undefined, { cacheScope: getVendorCacheScope(run, vendor.id) });
    const response = applyClarification(result.response, clarifications[vendor.id]);
    vendors.push({ vendor, qualification: getQualificationStatus(response), response, clarification: clarifications[vendor.id] ?? null });
  }
  return Response.json({
    event: { id: windowsHardwareEvent.id, title: windowsHardwareEvent.title, baseCurrency: windowsHardwareEvent.baseCurrency, demoExchangeRates: windowsHardwareEvent.demoExchangeRates, lineItems: windowsHardwareEvent.lineItems },
    vendors,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
