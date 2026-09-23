import { startClarification } from '@/lib/demo/clarification-manager';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ vendorId: string }> }) {
  try {
    const { vendorId } = await context.params;
    return Response.json({ clarification: await startClarification(vendorId) }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Clarification could not be started.' }, { status: 400 });
  }
}
