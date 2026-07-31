import {randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {tasks} from '@trigger.dev/sdk/v3';
import {api} from '@/convex/_generated/api';
import {convexClient, retry, toErrorResponse} from '@/lib/agent-request';
import {resolveRequester} from '@/lib/requester';

export const runtime = 'nodejs';

interface Byok {
  baseUrl: string;
  apiKey: string;
  model: string;
}
function validByok(x: unknown): Byok | null {
  const b = x as Partial<Byok> | undefined;
  if (b && typeof b.baseUrl === 'string' && typeof b.apiKey === 'string' && typeof b.model === 'string') {
    return {baseUrl: b.baseUrl, apiKey: b.apiKey, model: b.model};
  }
  return null;
}

// Starts a run rooted in the SELECTED HUMAN (guest role or Kinde session). Returns
// immediately; the graph runs in the Trigger.dev task.
export async function POST(req: Request) {
  try {
    const requester = await resolveRequester();
    if (!requester) {
      return NextResponse.json({error: 'pick_a_role'}, {status: 401});
    }
    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      description?: string;
      budgetCents?: number;
      byok?: unknown;
    };
    const title = body.title ?? 'Untitled requisition';
    const description = body.description ?? '';
    const budgetCents = typeof body.budgetCents === 'number' ? body.budgetCents : 0;
    const byok = validByok(body.byok);

    const runId = randomUUID();
    const {requisitionId, delegationId} = await retry(() =>
      convexClient().mutation(api.runs.start, {
        orgCode: requester.orgCode,
        requesterSubject: requester.subject,
        requesterScopes: requester.scopes,
        requesterRole: requester.role,
        runId,
        title,
        description,
        budgetCents
      })
    );

    const baseUrl = process.env.FLOOR_BASE_URL ?? new URL(req.url).origin;
    const handle = await tasks.trigger('procurement-run', {
      runId,
      orgCode: requester.orgCode,
      delegation: delegationId,
      baseUrl,
      requisition: {requisitionId, title, description, budgetCents},
      ...(byok ? {byok} : {})
    });

    return NextResponse.json({runId, requisitionId, orgCode: requester.orgCode, handle});
  } catch (error) {
    return toErrorResponse(error);
  }
}
