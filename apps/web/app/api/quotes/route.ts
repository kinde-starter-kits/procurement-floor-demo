import {NextResponse} from 'next/server';
import type {Id} from '@/convex/_generated/dataModel';
import {api} from '@/convex/_generated/api';
import {convexClient, retry, toErrorResponse, verifyAgent} from '@/lib/agent-request';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const agent = await verifyAgent(req);
    const body = (await req.json().catch(() => ({}))) as {
      requisitionId?: string;
      supplierId?: string;
      amountCents?: number;
      terms?: string;
      round?: number;
      status?: string;
    };
    if (!body.requisitionId || !body.supplierId || typeof body.amountCents !== 'number') {
      return NextResponse.json({error: 'invalid_quote'}, {status: 400});
    }

    const {quoteId} = await retry(() =>
      convexClient().mutation(api.quotes.create, {
        orgCode: agent.orgCode,
        requisitionId: body.requisitionId as Id<'requisitions'>,
        supplierId: body.supplierId as Id<'suppliers'>,
        amountCents: body.amountCents!,
        terms: body.terms ?? '',
        round: body.round ?? 1,
        status: body.status ?? 'submitted'
      })
    );
    return NextResponse.json({quoteId});
  } catch (error) {
    return toErrorResponse(error);
  }
}
