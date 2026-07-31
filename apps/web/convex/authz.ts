export type AuthzMode = 'broken' | 'attenuated';
export type Step = 'sourcing' | 'negotiation' | 'ordering';
export type Role = 'requester' | 'buyer' | 'director';

/**
 * The authorization mode, read ONLY from the deployment environment. Nothing a
 * request can influence — no header, body, or query param — ever reaches this.
 */
export function authzMode(): AuthzMode {
  return process.env.AUTHZ_MODE === 'attenuated' ? 'attenuated' : 'broken';
}

/**
 * The three real, pre-provisioned Kinde users. The guest role switch roots a run
 * in the SELECTED HUMAN's real subject and role scopes — not an M2M stand-in.
 */
export interface Human {
  subject: string;
  scopes: string[];
}
export const ROLES: Record<Role, Human> = {
  requester: {
    subject: 'kp_c13368027c334341ba992f22d691f313',
    scopes: ['procurement:read', 'quotes:request']
  },
  buyer: {
    subject: 'kp_60c416f42f81427ea17710d39f75fc7c',
    scopes: ['procurement:read', 'quotes:request', 'quotes:negotiate', 'orders:place:t1']
  },
  director: {
    subject: 'kp_1af9e0e99b704b45a5f2d1e15ac48c15',
    scopes: [
      'procurement:read',
      'quotes:request',
      'quotes:negotiate',
      'orders:place:t1',
      'orders:place:t2',
      'orders:place:t3'
    ]
  }
};

export function isRole(x: unknown): x is Role {
  return x === 'requester' || x === 'buyer' || x === 'director';
}

// The sourcing agent id — used only to carry the runId on a component delegation.
export const RUNID_CARRIER_AGENT_ID = 'j57ax8r00zcqnh6hvakddyvya98b2g8q';

// Each agent's registered capability (mirrors its component registration). The
// ordering agent is capable of every tier; the HUMAN's delegation is what caps a
// given run. Kinde M2M token scopes prove identity, not the tier ceiling.
export const AGENT_SCOPES: Record<Step, string[]> = {
  sourcing: ['procurement:read', 'quotes:request'],
  negotiation: ['procurement:read', 'quotes:negotiate'],
  ordering: ['procurement:read', 'orders:place:t1', 'orders:place:t2', 'orders:place:t3']
};

// Order-value tiers → the dollar ceiling of holding that tier.
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

/** BROKEN: parent ∪ next-step needs — grows, no intersection with the requester. */
export function brokenNextScopes(parentScopes: string[], need: string[]): string[] {
  return [...new Set([...parentScopes, ...need])];
}

/** ATTENUATED: requester ceiling ∩ this agent's registered capability — only shrinks. */
export function attenuatedHopScopes(requesterScopes: string[], step: Step): string[] {
  return intersect(requesterScopes, AGENT_SCOPES[step]);
}
