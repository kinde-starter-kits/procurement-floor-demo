import {randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {tasks} from '@trigger.dev/sdk/v3';
import {api} from '@/convex/_generated/api';
import {AgentRequestError, convexClient, toErrorResponse, verifyAgent} from '@/lib/agent-request';

export const runtime = 'nodejs';

// Starts the procurement run task and returns immediately. The graph itself runs
// inside the Trigger.dev task, not in this handler.
export async function POST(req: Request) {
  try {
    const agent = await verifyAgent(req);
    if (!agent.agentId) {
      throw new AgentRequestError(403, {error: 'agent_not_registered'});
    }

    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      description?: string;
      budgetCents?: number;
    };
    const title = body.title ?? 'Untitled requisition';
    const description = body.description ?? '';
    const budgetCents = typeof body.budgetCents === 'number' ? body.budgetCents : 0;

    const runId = randomUUID();

    // Create the requisition, issue the run delegation, emit run.started.
    const {requisitionId, delegationId} = await convexClient().mutation(api.runs.start, {
      orgCode: agent.orgCode,
      subject: agent.subject,
      agentId: agent.agentId,
      runId,
      // The requester's ceiling — their own scopes from the verified token.
      requesterScopes: agent.scopes,
      title,
      description,
      budgetCents
    });

    const baseUrl = process.env.FLOOR_BASE_URL ?? new URL(req.url).origin;

    const handle = await tasks.trigger('procurement-run', {
      runId,
      delegation: delegationId,
      baseUrl,
      requisition: {requisitionId, title, description, budgetCents}
    });

    return NextResponse.json({runId, requisitionId, delegation: delegationId, handle});
  } catch (error) {
    return toErrorResponse(error);
  }
}
