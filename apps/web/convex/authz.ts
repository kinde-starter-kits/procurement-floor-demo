export type AuthzMode = 'broken' | 'attenuated';
export type Step = 'sourcing' | 'negotiation' | 'ordering';

/**
 * The authorization mode, read ONLY from the deployment environment. Nothing a
 * request can influence — no header, body, or query param — ever reaches this.
 */
export function authzMode(): AuthzMode {
  return process.env.AUTHZ_MODE === 'attenuated' ? 'attenuated' : 'broken';
}

// The human requester at the root of every chain. A Buyer: may approve tier-1
// purchases, but nothing higher. Everything downstream must be a subset of this.
export const REQUESTER_SUBJECT = 'human:buyer-requester';
export const REQUESTER_SCOPES = [
  'procurement:read',
  'quotes:request',
  'quotes:negotiate',
  'orders:place:t1'
];

// Order-value tiers. $142,000 lands in t2 (above the Buyer's t1 ceiling).
//   t1: <= $50,000   t2: <= $250,000   t3: above
export function orderTier(amountCents: bigint | number): 't1' | 't2' | 't3' {
  const cents = typeof amountCents === 'bigint' ? amountCents : BigInt(Math.round(amountCents));
  if (cents <= 5_000_000n) return 't1';
  if (cents <= 25_000_000n) return 't2';
  return 't3';
}

/** The scopes a step needs to do the work in front of it (broken mode). */
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

export function intersect(a: readonly string[], b: readonly string[]): string[] {
  const bset = new Set(b);
  return [...new Set(a)].filter((s) => bset.has(s)).sort();
}

/**
 * BROKEN: authority is provisioned to fit the task — parent ∪ next-step needs,
 * with no intersection against the requester. The chain grows as it travels.
 */
export function brokenNextScopes(parentScopes: string[], need: string[]): string[] {
  return [...new Set([...parentScopes, ...need])];
}

/**
 * ATTENUATED: a hop carries only the intersection of the requester's ceiling and
 * what the acting agent itself holds (its token scopes). Authority only shrinks.
 * The component enforces the agent half at issue time; this pins the requester
 * half.
 */
export function attenuatedHopScopes(callerScopes: string[]): string[] {
  return intersect(REQUESTER_SCOPES, callerScopes);
}
