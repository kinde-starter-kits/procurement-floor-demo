import {v} from 'convex/values';
import {mutation, query} from './_generated/server';

/**
 * Append a runEvents row with the next sequence number for (orgCode, runId).
 * org and run are supplied by the route from the VERIFIED token + delegation,
 * never from the client body.
 */
export const append = mutation({
  args: {
    orgCode: v.string(),
    runId: v.string(),
    kind: v.string(),
    payload: v.any()
  },
  handler: async (ctx, {orgCode, runId, kind, payload}) => {
    const last = await ctx.db
      .query('runEvents')
      .withIndex('by_run_seq', (q) => q.eq('orgCode', orgCode).eq('runId', runId))
      .order('desc')
      .first();
    const seq = (last?.seq ?? -1) + 1;

    await ctx.db.insert('runEvents', {orgCode, runId, seq, kind, payload, at: Date.now()});
    return {seq};
  }
});

/** The full event sequence for a run, in order. */
export const listByRun = query({
  args: {orgCode: v.string(), runId: v.string()},
  handler: async (ctx, {orgCode, runId}) =>
    ctx.db
      .query('runEvents')
      .withIndex('by_run_seq', (q) => q.eq('orgCode', orgCode).eq('runId', runId))
      .order('asc')
      .collect()
});
