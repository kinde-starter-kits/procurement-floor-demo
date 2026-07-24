import {NextResponse} from 'next/server';
import {api} from '@/convex/_generated/api';
import {
  AgentRequestError,
  convexClient,
  resolveRunId,
  toErrorResponse,
  verifyAgent
} from '@/lib/agent-request';

export const runtime = 'nodejs';

// Mint this node's hop of the delegation chain. org/runId/subject/agentId/scopes
// all come from the verified token + delegation. `step`/`amountCents` are work
// data; the authorization MODE is read from the deployment env in Convex.
export async function POST(req: Request) {
  try {
    const agent = await verifyAgent(req);
    if (!agent.agentId) throw new AgentRequestError(403, {error: 'agent_not_registered'});
    const runId = await resolveRunId(req);
    const body = (await req.json().catch(() => ({}))) as {step?: unknown; amountCents?: unknown};
    if (body.step !== 'sourcing' && body.step !== 'negotiation' && body.step !== 'ordering') {
      return NextResponse.json({error: 'invalid_step'}, {status: 400});
    }

    const result = await convexClient().mutation(api.hop.begin, {
      orgCode: agent.orgCode,
      runId,
      step: body.step,
      callerSubject: agent.subject,
      callerAgentId: agent.agentId,
      callerScopes: agent.scopes,
      amountCents: typeof body.amountCents === 'number' ? body.amountCents : undefined
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
