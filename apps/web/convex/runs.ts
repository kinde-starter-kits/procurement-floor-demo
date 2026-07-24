import {v} from 'convex/values';
import {mutation, query} from './_generated/server';
import {components} from './_generated/api';

const RUN_SCOPES = [
  'procurement:read',
  'quotes:request',
  'quotes:negotiate',
  'orders:place:t1'
];

/**
 * Start a run: create the requisition, issue a run delegation whose `resources`
 * carries `run:<runId>` (so the runId travels inside a verified credential, not
 * the request body), record the hop-0 delegation, and emit `run.started`.
 * Called by the trigger route after it has verified the starter's token.
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
    const requisitionId = await ctx.db.insert('requisitions', {
      orgCode: args.orgCode,
      title: args.title,
      description: args.description,
      budgetCents: BigInt(Math.round(args.budgetCents)),
      requestedBySubject: args.subject,
      status: 'sourcing'
    });

    // P4 issues this delegation only to carry the runId (in `resources`); nothing
    // enforces scopes yet (that's P5/P6). Issue with empty scopes so it is always
    // a valid subset of the issuing agent's grants (avoids `scopes_exceed_agent`).
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

    await ctx.db.insert('delegations', {
      orgCode: args.orgCode,
      runId: args.runId,
      hop: 0,
      subject: args.subject,
      scopes: RUN_SCOPES,
      issuedAt: Date.now()
    });

    await ctx.db.insert('runEvents', {
      orgCode: args.orgCode,
      runId: args.runId,
      seq: 0,
      kind: 'run.started',
      payload: {subject: args.subject, requisitionId, title: args.title},
      at: Date.now()
    });

    return {requisitionId, delegationId};
  }
});

/**
 * Resolve a run delegation to its runId. Verifies the HMAC signature through the
 * component, then reads `run:<runId>` out of the delegation's resources. Returns
 * null for an invalid/forged delegation.
 */
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
