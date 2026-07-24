import {NextResponse} from 'next/server';
import {api} from '@/convex/_generated/api';
import {convexClient, resolveRunId, toErrorResponse, verifyAgent} from '@/lib/agent-request';

export const runtime = 'nodejs';

// Mint the next hop of the delegation chain. orgCode and runId come from the
// verified token + delegation. `toStep`/`amountCents` are work data from the body;
// the authorization MODE is never taken from the request — the Convex mutation
// reads it from the deployment env.
export async function POST(req: Request) {
  try {
    const agent = await verifyAgent(req);
    const runId = await resolveRunId(req);
    const body = (await req.json().catch(() => ({}))) as {
      toStep?: unknown;
      amountCents?: unknown;
    };
    if (body.toStep !== 'negotiation' && body.toStep !== 'ordering') {
      return NextResponse.json({error: 'invalid_to_step'}, {status: 400});
    }
    const amountCents = typeof body.amountCents === 'number' ? body.amountCents : undefined;

    const result = await convexClient().mutation(api.handoffs.mint, {
      orgCode: agent.orgCode,
      runId,
      toStep: body.toStep,
      amountCents
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
