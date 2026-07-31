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
      round?: number;
      summary?: string;
      startedAt?: number;
    };
    if (!body.requisitionId || typeof body.round !== 'number') {
      return NextResponse.json({error: 'invalid_round'}, {status: 400});
    }

    await retry(() =>
      convexClient().mutation(api.negotiationRounds.record, {
        orgCode: agent.orgCode,
        requisitionId: body.requisitionId as Id<'requisitions'>,
        round: body.round!,
        summary: body.summary ?? '',
        startedAt: body.startedAt ?? Date.now()
      })
    );
    return NextResponse.json({ok: true});
  } catch (error) {
    return toErrorResponse(error);
  }
}
