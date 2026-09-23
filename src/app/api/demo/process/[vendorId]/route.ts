import { AiConfigurationError, AiProviderError } from '@/lib/ai/provider';
import { processVendorResponse } from '@/lib/ingestion/pipeline';
import { elapsedSince, procurementLog } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(_request: Request, context: RouteContext<'/api/demo/process/[vendorId]'>) {
  const { vendorId } = await context.params;
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  procurementLog.info('api.vendor_processing.requested', { requestId, vendorId });
  try {
    const result = await processVendorResponse(vendorId, undefined, requestId);
    procurementLog.info('api.vendor_processing.succeeded', { requestId, vendorId, elapsedMs: elapsedSince(startedAt) });
    return Response.json({ ...result, requestId });
  } catch (error) {
    if (error instanceof AiConfigurationError) {
      procurementLog.warn('api.vendor_processing.not_configured', { requestId, vendorId });
      return Response.json({ error: error.message, code: 'AI_NOT_CONFIGURED' }, { status: 503 });
    }
    if (error instanceof AiProviderError) {
      procurementLog.error('api.vendor_processing.provider_failed', { requestId, vendorId, code: error.code, error: error.message, elapsedMs: elapsedSince(startedAt) });
      return Response.json(
        { error: error.message, code: error.code === 'TIMEOUT' ? 'AI_TIMEOUT' : 'AI_PROVIDER_ERROR', retryable: error.code === 'TIMEOUT' },
        { status: error.code === 'TIMEOUT' ? 504 : 502 },
      );
    }
    procurementLog.error('api.vendor_processing.failed', { requestId, vendorId, error: error instanceof Error ? error.message : 'Unknown error', elapsedMs: elapsedSince(startedAt) });
    return Response.json({ error: 'Vendor response processing failed.', code: 'PROCESSING_ERROR' }, { status: 500 });
  }
}
