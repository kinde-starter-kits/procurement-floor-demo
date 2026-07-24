import {NextResponse} from 'next/server';
import type {Id} from '@/convex/_generated/dataModel';
import {api} from '@/convex/_generated/api';
import {convexClient, toErrorResponse, verifyAgent} from '@/lib/agent-request';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const agent = await verifyAgent(req);
    const body = (await req.json().catch(() => ({}))) as {
      requisitionId?: string;
      quoteId?: string;
      amountCents?: number;
      placedByAgent?: string;
      status?: string;
      correlationId?: string;
    };
    if (!body.requisitionId || !body.quoteId || typeof body.amountCents !== 'number') {
      return NextResponse.json({error: 'invalid_order'}, {status: 400});
    }

    const {orderId} = await convexClient().mutation(api.orders.place, {
      orgCode: agent.orgCode,
      requisitionId: body.requisitionId as Id<'requisitions'>,
      quoteId: body.quoteId as Id<'quotes'>,
      amountCents: body.amountCents,
      // placedBySubject comes from the verified token, never the body.
      placedBySubject: agent.subject,
      placedByAgent: body.placedByAgent ?? agent.subject,
      status: body.status ?? 'placed',
      correlationId: body.correlationId ?? ''
    });
    return NextResponse.json({orderId});
  } catch (error) {
    return toErrorResponse(error);
  }
}
