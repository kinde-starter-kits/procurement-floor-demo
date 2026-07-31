import {v} from 'convex/values';
import {mutation, query} from './_generated/server';
import {components} from './_generated/api';
import {authzMode, RUNID_CARRIER_AGENT_ID} from './authz';

/**
 * Start a run, rooted in the SELECTED HUMAN. Creates the requisition, records the
 * requester's real subject + ceiling (the root of every delegation chain), and
 * mints the runId-carrying component delegation. Each node mints its own hop.
 */
export const start = mutation({
  args: {
    orgCode: v.string(),
    requesterSubject: v.string(),
    requesterScopes: v.array(v.string()),
    requesterRole: v.string(),
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
      requestedBySubject: args.requesterSubject,
      status: 'sourcing'
    });

    const delegationId: string = await ctx.runMutation(
      components.agentAuth.delegations.issue,
      {
        agentId: RUNID_CARRIER_AGENT_ID,
        expiresAt: Date.now() + 60 * 60 * 1000,
        issuerKind: 'user',
        issuerSubject: args.requesterSubject,
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
        subject: args.requesterSubject,
        requesterRole: args.requesterRole,
        requesterScopes: args.requesterScopes,
        requisitionId,
        title: args.title,
        budgetCents: args.budgetCents,
        mode
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

/**
 * Record a terminal failure for a run. Appends a `run.failed` event so the UI
 * shows a clear error instead of freezing at run.started. Idempotent-ish: skips
 * if the run already reached a terminal event.
 */
export const fail = mutation({
  args: {orgCode: v.string(), runId: v.string(), reason: v.string()},
  handler: async (ctx, {orgCode, runId, reason}) => {
    const events = await ctx.db
      .query('runEvents')
      .withIndex('by_run_seq', (q) => q.eq('orgCode', orgCode).eq('runId', runId))
      .collect();
    const terminal = new Set(['run.completed', 'run.terminated', 'run.failed']);
    if (events.some((e) => terminal.has(e.kind))) return {seq: null};
    const seq = (events.at(-1)?.seq ?? -1) + 1;
    await ctx.db.insert('runEvents', {
      orgCode,
      runId,
      seq,
      kind: 'run.failed',
      payload: {reason},
      at: Date.now()
    });
    return {seq};
  }
});

/** The requester context recorded at run start (root subject + scopes). */
export const requesterContext = query({
  args: {orgCode: v.string(), runId: v.string()},
  handler: async (ctx, {orgCode, runId}) => {
    const started = await ctx.db
      .query('runEvents')
      .withIndex('by_run_seq', (q) => q.eq('orgCode', orgCode).eq('runId', runId))
      .first();
    const p = started?.payload as {subject?: string; requesterScopes?: string[]} | undefined;
    return p ? {subject: p.subject ?? '', scopes: p.requesterScopes ?? []} : null;
  }
});
