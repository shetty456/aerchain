import { retryDemoVendor } from '@/lib/demo/run-manager';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(_request: Request, context: RouteContext<'/api/demo/run/[vendorId]'>) {
  try {
    const { vendorId } = await context.params;
    return Response.json({ run: await retryDemoVendor(vendorId) }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Retry failed.' }, { status: 400 });
  }
}
