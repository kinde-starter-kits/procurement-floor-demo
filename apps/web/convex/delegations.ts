import {v} from 'convex/values';
import {query} from './_generated/server';

/** The delegation chain for a run, ordered by hop, with effective scopes. */
export const listByRun = query({
  args: {orgCode: v.string(), runId: v.string()},
  handler: async (ctx, {orgCode, runId}) =>
    ctx.db
      .query('delegations')
      .withIndex('by_run_hop', (q) => q.eq('orgCode', orgCode).eq('runId', runId))
      .order('asc')
      .collect()
});
