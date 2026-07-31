import {NextResponse} from 'next/server';
import {api} from '@/convex/_generated/api';
import {convexClient, resolveRunId, retry, toErrorResponse, verifyAgent} from '@/lib/agent-request';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const agent = await verifyAgent(req);
    const runId = await resolveRunId(req);
    const body = (await req.json().catch(() => ({}))) as {kind?: unknown; payload?: unknown};
    const kind = typeof body.kind === 'string' ? body.kind : '';
    if (!kind) return NextResponse.json({error: 'kind_required'}, {status: 400});
    const payload = (body.payload ?? {}) as Record<string, unknown>;

    // Stamp the acting subject onto every event — this is the run's identity trail.
    const {seq} = await retry(() =>
      convexClient().mutation(api.events.append, {
        orgCode: agent.orgCode,
        runId,
        kind,
        payload: {...payload, subject: agent.subject}
      })
    );
    return NextResponse.json({seq});
  } catch (error) {
    return toErrorResponse(error);
  }
}
