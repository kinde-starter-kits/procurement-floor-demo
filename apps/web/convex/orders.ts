import {v} from 'convex/values';
import {mutation} from './_generated/server';

// Place an order. orgCode + placedBySubject come from the route's verified token.
export const place = mutation({
  args: {
    orgCode: v.string(),
    requisitionId: v.id('requisitions'),
    quoteId: v.id('quotes'),
    amountCents: v.number(),
    placedBySubject: v.string(),
    placedByAgent: v.string(),
    status: v.string(),
    correlationId: v.string()
  },
  handler: async (ctx, args) => {
    const orderId = await ctx.db.insert('orders', {
      orgCode: args.orgCode,
      requisitionId: args.requisitionId,
      quoteId: args.quoteId,
      amountCents: BigInt(Math.round(args.amountCents)),
      placedBySubject: args.placedBySubject,
      placedByAgent: args.placedByAgent,
      status: args.status,
      correlationId: args.correlationId
    });
    return {orderId};
  }
});
