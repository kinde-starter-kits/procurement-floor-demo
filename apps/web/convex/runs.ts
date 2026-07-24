import {v} from 'convex/values';
import {mutation, query} from './_generated/server';
import {components} from './_generated/api';
import {authzMode, REQUESTER_SCOPES, REQUESTER_SUBJECT} from './authz';

/**
 * Start a run. Creates the requisition, records the requester's ceiling (the
 * root of every delegation chain), and mints the runId-carrying component
 * delegation. Each node mints its own hop of the chain (see hop.begin).
 */
export const start = mutation({
  args: {
    orgCode: v.string(),
    subject: v.string(),
    agentId: v.string(),
    runId: v.string(),
    title: v.string(),
    description: v.string(),
    budgetCents: v.number()
  },
  handler: async (ctx, args) => {
    const mode = authzMode();

    const requisitionId = await ctx.db.insert('requisitions', {
      orgCode: args.orgCode,
      title: args.title,
      description: args.description,
      budgetCents: BigInt(Math.round(args.budgetCents)),
      requestedBySubject: REQUESTER_SUBJECT,
      status: 'sourcing'
    });

    const delegationId: string = await ctx.runMutation(
      components.agentAuth.delegations.issue,
      {
        agentId: args.agentId,
        expiresAt: Date.now() + 60 * 60 * 1000,
        issuerKind: 'org',
        issuerSubject: args.subject,
        scopes: [],
        resources: [`run:${args.runId}`]
      }
    );

    await ctx.db.insert('runEvents', {
      orgCode: args.orgCode,
      runId: args.runId,
      seq: 0,
      kind: 'run.started',
      payload: {
        subject: REQUESTER_SUBJECT,
        requisitionId,
        title: args.title,
        mode,
        // The human requester's ceiling — a Buyer, capped at tier 1.
        requesterScopes: REQUESTER_SCOPES
      },
      at: Date.now()
    });

    return {requisitionId, delegationId};
  }
});

export const resolveDelegation = query({
  args: {delegationId: v.string()},
  handler: async (ctx, {delegationId}): Promise<{runId: string} | null> => {
    const result = await ctx.runQuery(components.agentAuth.delegations.verify, {
      delegationId
    });
    if (!result.valid) return null;
    const row = await ctx.runQuery(components.agentAuth.delegations.get, {delegationId});
    const runResource = (row?.resources ?? []).find((r) => r.startsWith('run:'));
    if (!runResource) return null;
    return {runId: runResource.slice('run:'.length)};
  }
});
