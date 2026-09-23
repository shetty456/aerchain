import { advanceDemoRun } from '@/lib/demo/run-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  try {
    return Response.json({ run: await advanceDemoRun() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The next processing step could not be completed.' }, { status: 500 });
  }
}
