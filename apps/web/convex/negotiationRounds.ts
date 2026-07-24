import {v} from 'convex/values';
import {mutation} from './_generated/server';

// Record a negotiation round. orgCode comes from the route's verified token.
export const record = mutation({
  args: {
    orgCode: v.string(),
    requisitionId: v.id('requisitions'),
    round: v.number(),
    summary: v.string(),
    startedAt: v.number()
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('negotiationRounds', {
      orgCode: args.orgCode,
      requisitionId: args.requisitionId,
      round: args.round,
      summary: args.summary,
      startedAt: args.startedAt
    });
    return null;
  }
});
