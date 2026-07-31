import {NextResponse} from 'next/server';
import {api} from '@/convex/_generated/api';
import {convexClient, resolveRunId, retry, toErrorResponse} from '@/lib/agent-request';

export const runtime = 'nodejs';

// Record a terminal failure for a run. Authenticated by the run delegation
// (X-Floor-Delegation), NOT a Kinde M2M token — so the graph can report a failure
// even when token minting is the thing that failed. The runId comes from the
// verified delegation; the body's runId must match it.
export async function POST(req: Request) {
  try {
    const runId = await resolveRunId(req);
    const body = (await req.json().catch(() => ({}))) as {
      orgCode?: string;
      runId?: string;
      reason?: string;
    };
    if (!body.orgCode || body.runId !== runId) {
      return NextResponse.json({error: 'run_mismatch'}, {status: 403});
    }
    const {seq} = await retry(() =>
      convexClient().mutation(api.runs.fail, {
        orgCode: body.orgCode!,
        runId,
        reason: body.reason ? String(body.reason).slice(0, 300) : 'The run could not proceed.'
      })
    );
    return NextResponse.json({ok: true, seq});
  } catch (error) {
    return toErrorResponse(error);
  }
}
