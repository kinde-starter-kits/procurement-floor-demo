import {v} from 'convex/values';
import {mutation} from './_generated/server';
import {components} from './_generated/api';
import {
  attenuatedHopScopes,
  authzMode,
  brokenNextScopes,
  orderTier,
  REQUESTER_SUBJECT,
  stepNeeds,
  type Step
} from './authz';

const HOUR = 60 * 60 * 1000;

/**
 * Mint this node's hop of the delegation chain.
 *
 * BROKEN: parent ∪ next-step needs — grows (recorded in the app delegations
 * table, no enforcement).
 *
 * ATTENUATED: the hop carries requester-ceiling ∩ agent scopes — shrinks. The
 * chain is issued through the COMPONENT's delegations API (rooted at the human
 * requester); the app row is just a readable mirror. For the ordering hop we
 * also start a component instance so `authz.can` can decide the order.
 */
export const begin = mutation({
  args: {
    orgCode: v.string(),
    runId: v.string(),
    step: v.union(v.literal('sourcing'), v.literal('negotiation'), v.literal('ordering')),
    callerSubject: v.string(),
    callerAgentId: v.string(),
    callerScopes: v.array(v.string()),
    amountCents: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const mode = authzMode();
    const step = args.step as Step;

    const parent = await ctx.db
      .query('delegations')
      .withIndex('by_run_hop', (q) => q.eq('orgCode', args.orgCode).eq('runId', args.runId))
      .order('desc')
      .first();
    const hop = (parent?.hop ?? 0) + 1;

    let scopes: string[];
    let componentDelegationId: string | null = null;
    let instanceId: string | null = null;

    if (mode === 'broken') {
      scopes = brokenNextScopes(parent?.scopes ?? [], stepNeeds(step, args.amountCents));
    } else {
      // Attenuated: requester ceiling ∩ this agent's own scopes.
      scopes = attenuatedHopScopes(args.callerScopes);
      // Issue through the component, rooted at the human requester. The
      // component refuses any scope the agent does not itself hold.
      componentDelegationId = await ctx.runMutation(components.agentAuth.delegations.issue, {
        agentId: args.callerAgentId as never,
        issuerKind: 'user',
        issuerSubject: REQUESTER_SUBJECT,
        scopes,
        resources: [`run:${args.runId}`],
        expiresAt: Date.now() + HOUR
      });
      if (step === 'ordering') {
        instanceId = await ctx.runMutation(components.agentAuth.instances.start, {
          agentId: args.callerAgentId as never,
          runId: `${args.runId}:ordering`,
          actingForSubject: REQUESTER_SUBJECT,
          orgCode: args.orgCode,
          expiresAt: Date.now() + HOUR
        });
      }
    }

    await ctx.db.insert('delegations', {
      orgCode: args.orgCode,
      runId: args.runId,
      hop,
      ...(parent ? {parentDelegationId: parent._id} : {}),
      subject: step,
      scopes,
      issuedAt: Date.now()
    });

    const last = await ctx.db
      .query('runEvents')
      .withIndex('by_run_seq', (q) => q.eq('orgCode', args.orgCode).eq('runId', args.runId))
      .order('desc')
      .first();
    const seq = (last?.seq ?? -1) + 1;
    await ctx.db.insert('runEvents', {
      orgCode: args.orgCode,
      runId: args.runId,
      seq,
      kind: 'delegation.minted',
      payload: {
        hop,
        step,
        scopes,
        ...(parent ? {parentScopes: parent.scopes} : {}),
        ...(args.amountCents !== undefined ? {tier: orderTier(args.amountCents)} : {}),
        mode
      },
      at: Date.now()
    });

    return {hop, scopes, instanceId, componentDelegationId};
  }
});
