import { acceptAward, createAward, getAward } from '@/lib/demo/award-manager';
export const runtime = 'nodejs'; export const maxDuration = 300;
export async function GET() { return Response.json({ award: await getAward() }, { headers: { 'Cache-Control': 'no-store' } }); }
export async function POST() { try { return Response.json({ award: await createAward() }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Award creation failed.' }, { status: 400 }); } }
export async function PUT() { try { return Response.json({ award: await acceptAward() }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Award acceptance failed.' }, { status: 400 }); } }
