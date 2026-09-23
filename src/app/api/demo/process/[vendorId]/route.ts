import { AiConfigurationError, AiProviderError } from '@/lib/ai/provider';
import { processVendorResponse } from '@/lib/ingestion/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(_request: Request, context: RouteContext<'/api/demo/process/[vendorId]'>) {
  const { vendorId } = await context.params;
  try {
    return Response.json(await processVendorResponse(vendorId));
  } catch (error) {
    if (error instanceof AiConfigurationError) {
      return Response.json({ error: error.message, code: 'AI_NOT_CONFIGURED' }, { status: 503 });
    }
    if (error instanceof AiProviderError) {
      console.error(error.cause);
      return Response.json({ error: error.message, code: 'AI_PROVIDER_ERROR' }, { status: 502 });
    }
    console.error(error);
    return Response.json({ error: 'Vendor response processing failed.', code: 'PROCESSING_ERROR' }, { status: 500 });
  }
}
