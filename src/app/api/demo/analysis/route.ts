import { z } from 'zod';
import { windowsHardwareEvent } from '@/data/windows-hardware-fy27';
import { procurementAiProvider } from '@/lib/ai/procurement-provider';
import { applyClarification, getClarifications } from '@/lib/demo/clarification-manager';
import { getDemoRun } from '@/lib/demo/run-manager';
import { processVendorResponse } from '@/lib/ingestion/pipeline';
import { analyzeProcurement, type AnalysisVendor } from '@/lib/procurement/analysis';
import { getQualificationStatus } from '@/lib/procurement/qualification';

export const runtime = 'nodejs';
export const maxDuration = 300;

const intentSchema = z.object({ operation: z.enum(['QUALIFIED_VENDORS', 'CHEAPEST_OVERALL', 'CHEAPEST_QUALIFIED_PER_LINE', 'UNRESOLVED_ITEMS', 'SPLIT_AWARD_SAVINGS', 'SUMMARY']) });

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { question?: string };
    if (!body.question?.trim()) return Response.json({ error: 'Enter a question about this sourcing event.' }, { status: 400 });
    const run = await getDemoRun();
    if (!run) return Response.json({ error: 'No processed supplier responses are available.' }, { status: 409 });
    const ready = windowsHardwareEvent.invitedVendors.filter((item) => run.vendors[item.id]?.status === 'READY');
    if (!ready.length) return Response.json({ error: 'Supplier responses are still processing. Try again when at least one is ready.' }, { status: 409 });
    const clarifications = await getClarifications();
    const vendors: AnalysisVendor[] = [];
    for (const vendor of ready) {
      const result = await processVendorResponse(vendor.id);
      const response = applyClarification(result.response, clarifications[vendor.id]);
      vendors.push({ id: vendor.id, name: vendor.name, qualification: getQualificationStatus(response).status, response });
    }
    const intent = await procurementAiProvider.generateStructured({
      schemaName: 'procurement_analysis_intent', schema: intentSchema,
      system: 'Interpret the buyer question as exactly one procurement analysis operation. Do not calculate or answer the question.',
      prompt: `Question: ${body.question}\nAvailable operations: qualification status; cheapest qualified complete vendor; cheapest qualified vendor per line; unresolved items; split-award savings versus cheapest qualified complete vendor; summary.`,
      maxTokens: 300,
    });
    return Response.json({ question: body.question, result: analyzeProcurement(intent.operation, windowsHardwareEvent.lineItems, vendors) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Analysis could not be completed.' }, { status: 502 });
  }
}
