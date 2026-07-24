import {v} from 'convex/values';
import {authorize} from '@kinde-oss/kinde-convex-agent-auth';
import {action, mutation} from './_generated/server';
import {api, components} from './_generated/api';
import {authzMode, orderTier} from './authz';

/** Insert an order row. */
export const place = mutation({
  args: {
    orgCode: v.string(),
    requisitionId: v.id('requisitions'),
    quoteId: v.id('quotes'),
    amountCents: v.number(),
    placedBySubject: v.string(),
    placedByAgent: v.string(),
    status: v.string(),
    correlationId: v.string()
  },
  handler: async (ctx, args) => {
    const orderId = await ctx.db.insert('orders', {
      orgCode: args.orgCode,
      requisitionId: args.requisitionId,
      quoteId: args.quoteId,
      amountCents: BigInt(Math.round(args.amountCents)),
      placedBySubject: args.placedBySubject,
      placedByAgent: args.placedByAgent,
      status: args.status,
      correlationId: args.correlationId
    });
    return {orderId};
  }
});

/**
 * Submit an order. The mode is read from the deployment env (never the request).
 *
 * BROKEN: place it, no check.
 * ATTENUATED: authorize through the component's `authz.can` first. The required
 * scope is the order's tier (e.g. orders:place:t2). If the ordering agent's
 * effective scopes — capped by the requester-rooted delegation chain and its own
 * grant — lack it, the component denies with `insufficient_scope` naming the
 * missing scope. No order row is created; a denial event is recorded.
 */
export const submit = action({
  args: {
    token: v.string(),
    orgCode: v.string(),
    runId: v.string(),
    subject: v.string(),
    requisitionId: v.id('requisitions'),
    quoteId: v.id('quotes'),
    amountCents: v.number(),
    instanceId: v.optional(v.string()),
    correlationId: v.string()
  },
  handler: async (
    ctx,
    args
  ): Promise<
    | {denied: false; orderId: string}
    | {denied: true; reason: string; requiredScopes: string[]; correlationId: string}
  > => {
    const mode = authzMode();

    if (mode === 'attenuated') {
      if (!args.instanceId) throw new Error('instanceId required in attenuated mode');
      const requiredAction = `orders:place:${orderTier(args.amountCents)}`;
      const {decision} = await authorize(ctx, components.agentAuth, args.token, {
        instanceId: args.instanceId as never,
        action: requiredAction,
        enforceTokenScopes: true
      });
      if (!decision.allowed) {
        await ctx.runMutation(api.events.append, {
          orgCode: args.orgCode,
          runId: args.runId,
          kind: 'order.denied',
          payload: {
            subject: args.subject,
            reason: decision.reason,
            requiredScopes: decision.requiredScopes ?? [],
            correlationId: decision.correlationId,
            action: requiredAction
          }
        });
        return {
          denied: true,
          reason: decision.reason,
          requiredScopes: decision.requiredScopes ?? [],
          correlationId: decision.correlationId
        };
      }
    }

    const {orderId} = await ctx.runMutation(api.orders.place, {
      orgCode: args.orgCode,
      requisitionId: args.requisitionId,
      quoteId: args.quoteId,
      amountCents: args.amountCents,
      placedBySubject: args.subject,
      placedByAgent: 'ordering',
      status: 'placed',
      correlationId: args.correlationId
    });
    return {denied: false, orderId};
  }
});
