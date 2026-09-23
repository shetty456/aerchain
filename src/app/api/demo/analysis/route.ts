import { createHash } from 'node:crypto';
import { z } from 'zod';
import { windowsHardwareEvent } from '@/data/windows-hardware-fy27';
import { procurementAiProvider } from '@/lib/ai/procurement-provider';
import { applyClarification, getClarifications } from '@/lib/demo/clarification-manager';
import { getDemoRun } from '@/lib/demo/run-manager';
import { processVendorResponse } from '@/lib/ingestion/pipeline';
import { analyzeProcurement, type AnalysisPlan, type AnalysisVendor } from '@/lib/procurement/analysis';
import { getQualificationStatus } from '@/lib/procurement/qualification';
import { readRuntimeDocument, writeRuntimeDocument } from '@/lib/storage/runtime-documents';

export const runtime = 'nodejs';
export const maxDuration = 300;

const intentSchema = z.object({
  operation: z.enum(['QUALIFIED_VENDORS', 'CHEAPEST_OVERALL', 'CHEAPEST_QUALIFIED_PER_LINE', 'UNRESOLVED_ITEMS', 'SPLIT_AWARD_SAVINGS', 'VENDOR_COMPARISON', 'CATEGORY_SUMMARY', 'LINE_DETAIL', 'COMMERCIAL_TERMS', 'SUMMARY']),
  vendorNames: z.array(z.string()).max(5),
  categories: z.array(z.string()).max(10),
  lineIds: z.array(z.string()).max(30),
  limit: z.number().int().min(1).max(10),
});
const explanationSchema = z.object({
  answer: z.string(),
  caveats: z.array(z.string()).max(3),
  followUps: z.array(z.string()).max(3),
});
type AnalysisResponse = {
  question: string;
  plan: AnalysisPlan;
  result: Record<string, unknown>;
  explanation: z.infer<typeof explanationSchema> | null;
  explanationError?: string;
  calculatedBy: string;
  cached: boolean;
};

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function compactForExplanation(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 5).map(compactForExplanation);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, compactForExplanation(child)]));
  return value;
}

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
      const result = await processVendorResponse(vendor.id, undefined, undefined, { cacheScope: run.cacheScope });
      const response = applyClarification(result.response, clarifications[vendor.id]);
      vendors.push({ id: vendor.id, name: vendor.name, qualification: getQualificationStatus(response).status, response });
    }
    const question = body.question.trim();
    const datasetHash = hash(vendors.map((vendor) => ({ id: vendor.id, qualification: vendor.qualification, response: vendor.response })));
    const cacheKey = `analysis-${hash({ question: question.toLowerCase(), datasetHash }).slice(0, 48)}`;
    const cached = await readRuntimeDocument<AnalysisResponse>(cacheKey);
    if (cached) return Response.json({ ...cached, cached: true });

    const intent = await procurementAiProvider.generateStructured({
      schemaName: 'procurement_analysis_intent', schema: intentSchema,
      system: 'Interpret the buyer question as one procurement analysis operation and optional exact filters. Never calculate or answer. Use empty arrays when there is no filter.',
      prompt: `Question: ${question}
Available vendors: ${vendors.map((vendor) => vendor.name).join(', ')}
Available categories: ${[...new Set(windowsHardwareEvent.lineItems.map((line) => line.category))].join(', ')}
Line IDs run from HW-001 to HW-030.
Operations:
- QUALIFIED_VENDORS: qualification status
- CHEAPEST_OVERALL: cheapest qualified complete supplier
- CHEAPEST_QUALIFIED_PER_LINE: eligible split allocation
- UNRESOLVED_ITEMS: missing, ambiguous, deviation, or review items
- SPLIT_AWARD_SAVINGS: split versus cheapest qualified complete supplier
- VENDOR_COMPARISON: compare supplier totals
- CATEGORY_SUMMARY: spend grouped by category
- LINE_DETAIL: quote detail for specified lines
- COMMERCIAL_TERMS: freight, tax, payment, delivery, warranty, validity, discounts
- SUMMARY: broad event overview
Set limit to 5 unless the buyer explicitly requests another number (maximum 10).`,
      maxTokens: 500,
    });
    const result = analyzeProcurement(intent, windowsHardwareEvent.lineItems, vendors) as Record<string, unknown>;
    let explanation: z.infer<typeof explanationSchema> | null = null;
    let explanationError: string | undefined;
    try {
      explanation = await procurementAiProvider.generateStructured({
        schemaName: 'procurement_analysis_explanation', schema: explanationSchema,
        system: 'Explain a procurement calculation to a buyer using only the supplied deterministic result. Never recalculate, invent a value, or imply that an unresolved item is eligible. Be concise and decision-oriented. INR values should be easy to scan.',
        prompt: `Buyer question: ${question}\nDeterministic result (arrays limited to five rows for explanation only):\n${JSON.stringify(compactForExplanation(result))}`,
        maxTokens: 800,
      });
    } catch (error) {
      explanationError = error instanceof Error ? error.message : 'AI explanation was unavailable.';
    }
    const payload: AnalysisResponse = { question, plan: intent, result, explanation, explanationError, calculatedBy: 'Deterministic procurement tools', cached: false };
    await writeRuntimeDocument(cacheKey, payload);
    return Response.json(payload);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Analysis could not be completed.' }, { status: 502 });
  }
}
