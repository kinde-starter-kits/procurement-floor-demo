import {v} from 'convex/values';
import {mutation} from './_generated/server';

// Create a quote. orgCode comes from the route's verified token. Money is stored
// as integer cents (int64); the route passes a plain number over JSON.
export const create = mutation({
  args: {
    orgCode: v.string(),
    requisitionId: v.id('requisitions'),
    supplierId: v.id('suppliers'),
    amountCents: v.number(),
    terms: v.string(),
    round: v.number(),
    status: v.string()
  },
  handler: async (ctx, args) => {
    const quoteId = await ctx.db.insert('quotes', {
      orgCode: args.orgCode,
      requisitionId: args.requisitionId,
      supplierId: args.supplierId,
      amountCents: BigInt(Math.round(args.amountCents)),
      terms: args.terms,
      round: args.round,
      status: args.status
    });
    return {quoteId};
  }
});
