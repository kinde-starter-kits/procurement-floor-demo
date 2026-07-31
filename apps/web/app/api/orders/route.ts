import {NextResponse} from 'next/server';
import type {Id} from '@/convex/_generated/dataModel';
import {api} from '@/convex/_generated/api';
import {convexClient, resolveRunId, retry, toErrorResponse, verifyAgent} from '@/lib/agent-request';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const agent = await verifyAgent(req);
    const runId = await resolveRunId(req);
    const authorization = req.headers.get('authorization') ?? '';
    const token = authorization.slice('Bearer '.length);
    const body = (await req.json().catch(() => ({}))) as {
      requisitionId?: string;
      quoteId?: string;
      amountCents?: number;
      correlationId?: string;
      instanceId?: string;
    };
    if (!body.requisitionId || !body.quoteId || typeof body.amountCents !== 'number') {
      return NextResponse.json({error: 'invalid_order'}, {status: 400});
    }

    // The MODE is decided inside Convex from the deployment env, not here.
    const result = await retry(() =>
      convexClient().action(api.orders.submit, {
        token,
        orgCode: agent.orgCode,
        runId,
        subject: agent.subject,
        requisitionId: body.requisitionId as Id<'requisitions'>,
        quoteId: body.quoteId as Id<'quotes'>,
        amountCents: body.amountCents!,
        instanceId: body.instanceId,
        correlationId: body.correlationId ?? ''
      })
    );

    // A denial is a normal outcome (200), not an error — the run reads it and stops.
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
