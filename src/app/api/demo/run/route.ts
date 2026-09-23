import { getDemoRun, startDemoRun } from '@/lib/demo/run-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  return Response.json({ run: await getDemoRun() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST() {
  return Response.json({ run: await startDemoRun() }, { status: 202 });
}
