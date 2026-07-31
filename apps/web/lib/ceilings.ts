// Rendering authority as money. A scope like `orders:place:t2` means nothing to a
// visitor; "can approve up to $250,000" does. These helpers turn the scope sets on
// the delegation chain into dollar ceilings.

export const ORDER_TIER_CEILING_CENTS: Record<string, number | null> = {
  t1: 5_000_000, //  $50,000
  t2: 25_000_000, // $250,000
  t3: null //        no ceiling
};

export function dollars(cents: number | null): string {
  if (cents === null) return 'no ceiling';
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

/**
 * The largest order this scope set can approve.
 *   number  → a dollar ceiling
 *   null    → no ceiling (holds t3)
 *   0       → holds no ordering authority at all
 */
export function approvalCeilingCents(scopes: string[]): number | null {
  if (scopes.includes('orders:place:t3')) return null;
  if (scopes.includes('orders:place:t2')) return ORDER_TIER_CEILING_CENTS.t2;
  if (scopes.includes('orders:place:t1')) return ORDER_TIER_CEILING_CENTS.t1;
  return 0;
}

/** Can this scope set approve an order of `amountCents`? */
export function canApprove(scopes: string[], amountCents: number): boolean {
  const ceiling = approvalCeilingCents(scopes);
  if (ceiling === null) return true; // t3, unlimited
  return amountCents <= ceiling;
}

/**
 * The approval ceiling as a label, read from the highest `orders:place:tN` tier
 * in the scope set. A set with no ordering tier is NOT a $0 ceiling — it has no
 * approval authority at all.
 */
export function ceilingLabel(scopes: string[]): string {
  if (scopes.includes('orders:place:t3')) return 'no ceiling';
  if (scopes.includes('orders:place:t2')) return 'up to $250,000';
  if (scopes.includes('orders:place:t1')) return 'up to $50,000';
  return 'no approval authority';
}

export interface ScopeChip {
  raw: string;
  label: string;
  kind: 'read' | 'quote' | 'order';
}

// Friendly, plain-language chip for a scope — orders rendered as their ceiling.
export function scopeChip(scope: string): ScopeChip {
  if (scope.startsWith('orders:place:')) {
    const tier = scope.slice('orders:place:'.length);
    const c = ORDER_TIER_CEILING_CENTS[tier];
    return {raw: scope, label: `approve up to ${dollars(c ?? null)}`, kind: 'order'};
  }
  const map: Record<string, string> = {
    'procurement:read': 'read procurement',
    'quotes:request': 'request quotes',
    'quotes:negotiate': 'negotiate quotes'
  };
  return {raw: scope, label: map[scope] ?? scope, kind: scope.startsWith('quotes') ? 'quote' : 'read'};
}
