import { getAuditTrail } from '@/lib/demo/audit-trail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ events: await getAuditTrail() }, { headers: { 'Cache-Control': 'no-store' } });
}
