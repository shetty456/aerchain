import { getDemoRun, replayDemoRun, startDemoRun } from '@/lib/demo/run-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  return Response.json({ run: await getDemoRun() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { action?: string };
    const run = body.action === 'REPLAY_SHOWCASE'
      ? await replayDemoRun()
      : await startDemoRun({ fresh: body.action === 'START_FRESH' });
    return Response.json({ run }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not start the response journey.' }, { status: 409 });
  }
}
