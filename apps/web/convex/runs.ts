import {v} from 'convex/values';
import {mutation, query} from './_generated/server';
import {components} from './_generated/api';
import {authzMode, nextScopes, stepNeeds} from './authz';

/**
 * Start a run. Creates the requisition, records the requester's ceiling, mints
 * the run's runId-carrying component delegation, and records hop 1 (sourcing) of
 * the delegation chain with its EFFECTIVE scopes.
 *
 * The delegation chain of record lives in the `delegations` table: every hop
 * stores the effective scopes it carries, so the chain (and, in broken mode, its
 * growth) can be read back afterwards.
 */
export const start = mutation({
  args: {
    orgCode: v.string(),
    subject: v.string(),
    agentId: v.string(),
    runId: v.string(),
    // The requester's own scopes (from their verified token) — their ceiling.
    requesterScopes: v.array(v.string()),
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
      requestedBySubject: args.subject,
      status: 'sourcing'
    });

    // runId-carrying delegation (transport). The scope chain of record is the
    // `delegations` table below, which is not capped by the component.
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

    // Hop 1 (sourcing): broken mode provisions the sourcing task's needs.
    const hop1Scopes = nextScopes(mode, [], stepNeeds('sourcing'));
    await ctx.db.insert('delegations', {
      orgCode: args.orgCode,
      runId: args.runId,
      hop: 1,
      subject: 'sourcing',
      scopes: hop1Scopes,
      issuedAt: Date.now()
    });

    await ctx.db.insert('runEvents', {
      orgCode: args.orgCode,
      runId: args.runId,
      seq: 0,
      kind: 'run.started',
      payload: {
        subject: args.subject,
        requisitionId,
        title: args.title,
        mode,
        requesterScopes: args.requesterScopes
      },
      at: Date.now()
    });
    await ctx.db.insert('runEvents', {
      orgCode: args.orgCode,
      runId: args.runId,
      seq: 1,
      kind: 'delegation.minted',
      payload: {hop: 1, step: 'sourcing', scopes: hop1Scopes, added: hop1Scopes, mode},
      at: Date.now()
    });

    return {requisitionId, delegationId, hop1Scopes};
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
