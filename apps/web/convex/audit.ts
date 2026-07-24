import {v} from 'convex/values';
import {query} from './_generated/server';
import {components} from './_generated/api';

/** Recent rows from the COMPONENT's own audit trail (the real record). */
export const recent = query({
  args: {orgCode: v.string(), limit: v.optional(v.number())},
  handler: async (ctx, {orgCode, limit}) => {
    const res = await ctx.runQuery(components.agentAuth.audit.query, {
      orgCode,
      paginationOpts: {numItems: limit ?? 40, cursor: null}
    });
    return res.page;
  }
});

/** The COMPONENT's delegation rows for a given agent (its real delegation chain). */
export const componentDelegations = query({
  args: {agentId: v.string()},
  handler: async (ctx, {agentId}) =>
    ctx.runQuery(components.agentAuth.delegations.listForAgent, {
      agentId: agentId as never,
      limit: 20
    })
});
