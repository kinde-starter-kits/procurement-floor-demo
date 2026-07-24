import {ConvexError} from 'convex/values';

export type AuthzMode = 'broken' | 'attenuated';

/**
 * The authorization mode, read ONLY from the deployment environment. Nothing a
 * request can influence — no header, body, or query param — ever reaches this.
 * Defaults to `broken` for this phase. `attenuated` lands in P6.
 */
export function authzMode(): AuthzMode {
  return process.env.AUTHZ_MODE === 'attenuated' ? 'attenuated' : 'broken';
}

// Order-value tiers. $142,000 lands in t2.
//   t1: <= $50,000   t2: <= $250,000   t3: above
export function orderTier(amountCents: bigint | number): 't1' | 't2' | 't3' {
  const cents = typeof amountCents === 'bigint' ? amountCents : BigInt(Math.round(amountCents));
  if (cents <= 5_000_000n) return 't1';
  if (cents <= 25_000_000n) return 't2';
  return 't3';
}

export type Step = 'sourcing' | 'negotiation' | 'ordering';

/** The scopes a step needs to do its work in front of it. */
export function stepNeeds(step: Step, amountCents?: bigint | number): string[] {
  switch (step) {
    case 'sourcing':
      return ['procurement:read', 'quotes:request'];
    case 'negotiation':
      return ['quotes:negotiate'];
    case 'ordering':
      return [`orders:place:${orderTier(amountCents ?? 0)}`];
  }
}

/**
 * The scope set the next hop carries.
 *
 * BROKEN: authority is provisioned to fit the task — the parent's scopes PLUS
 * whatever the next step needs, with no intersection against the person who
 * asked. So the chain grows as it travels; a step can end up holding a scope the
 * original requester never had. This is the bug.
 *
 * ATTENUATED: not implemented until P6 (it will intersect, never grow).
 */
export function nextScopes(mode: AuthzMode, parentScopes: string[], need: string[]): string[] {
  if (mode === 'attenuated') {
    throw new ConvexError({code: 'not_implemented', message: 'attenuated mode lands in P6'});
  }
  const grown = new Set(parentScopes);
  for (const s of need) grown.add(s);
  return [...grown];
}
