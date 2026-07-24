import {describe, expect, test} from 'vitest';
import manifest from './fixtures/escalation.json';

/**
 * Broken mode lets authority escalate: a run started by a Requester (who holds
 * only `procurement:read` and `quotes:request`, and cannot approve any purchase)
 * ends in a placed order well above that ceiling, because each handoff mints the
 * next hop's scopes to fit the task instead of inheriting from the requester.
 *
 * The fixture is captured verbatim from the deterministic repro run. In P6 this
 * SAME assertion flips: attenuated mode must deny the order.
 */
describe('broken-mode escalation', () => {
  const requester = manifest.requesterScopes;
  const finalHop = manifest.chain.at(-1)!;

  test('the run is in broken mode', () => {
    expect(manifest.mode).toBe('broken');
  });

  test('the requester cannot place an order of any size', () => {
    expect(requester).toContain('procurement:read');
    expect(requester).toContain('quotes:request');
    expect(requester.some((s) => s.startsWith('orders:place:'))).toBe(false);
  });

  test('the delegation chain grows as it travels', () => {
    const [h1, h2, h3] = manifest.chain;
    expect(h1.scopes.length).toBeLessThan(h2.scopes.length);
    expect(h2.scopes.length).toBeLessThan(h3.scopes.length);
    // every parent scope is carried forward, plus new ones
    for (const s of h1.scopes) expect(h2.scopes).toContain(s);
    for (const s of h2.scopes) expect(h3.scopes).toContain(s);
  });

  test('escalation SUCCEEDS: a $142,000 tier-2 order is placed above the requester ceiling', () => {
    // authority the requester never held, minted for the ordering hop
    expect(finalHop.scopes).toContain('orders:place:t2');
    expect(requester).not.toContain('orders:place:t2');

    expect(manifest.order).not.toBeNull();
    expect(manifest.order!.amountCents).toBe(14_200_000); // $142,000
  });
});
