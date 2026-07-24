import {v} from 'convex/values';
import {mutation} from './_generated/server';
import {authzMode, nextScopes, orderTier, stepNeeds, type Step} from './authz';

/**
 * Mint the next hop of the delegation chain at a handoff.
 *
 * BROKEN mode (this phase): the next hop's scopes = parent scopes PLUS the next
 * step's needs, derived from the work in front of it (for ordering, the tier
 * implied by the winning amount). No intersection with the parent chain, so the
 * chain grows. The mode is read from the deployment env only — `toStep` and
 * `amountCents` are work data, but the MODE can never come from the request.
 */
export const mint = mutation({
  args: {
    orgCode: v.string(),
    runId: v.string(),
    toStep: v.union(v.literal('negotiation'), v.literal('ordering')),
    amountCents: v.optional(v.number())
  },
  handler: async (ctx, {orgCode, runId, toStep, amountCents}) => {
    const mode = authzMode();

    const parent = await ctx.db
      .query('delegations')
      .withIndex('by_run_hop', (q) => q.eq('orgCode', orgCode).eq('runId', runId))
      .order('desc')
      .first();
    if (!parent) throw new Error('no parent delegation for run');

    const need = stepNeeds(toStep as Step, amountCents);
    const scopes = nextScopes(mode, parent.scopes, need); // throws not_implemented if attenuated
    const hop = parent.hop + 1;

    await ctx.db.insert('delegations', {
      orgCode,
      runId,
      hop,
      parentDelegationId: parent._id,
      subject: toStep,
      scopes,
      issuedAt: Date.now()
    });

    const last = await ctx.db
      .query('runEvents')
      .withIndex('by_run_seq', (q) => q.eq('orgCode', orgCode).eq('runId', runId))
      .order('desc')
      .first();
    const seq = (last?.seq ?? -1) + 1;
    await ctx.db.insert('runEvents', {
      orgCode,
      runId,
      seq,
      kind: 'delegation.minted',
      payload: {
        hop,
        step: toStep,
        scopes,
        added: need,
        parentScopes: parent.scopes,
        ...(amountCents !== undefined ? {tier: orderTier(amountCents), amountCents} : {}),
        mode
      },
      at: Date.now()
    });

    return {hop, scopes, added: need};
  }
});
