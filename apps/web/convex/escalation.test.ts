import {describe, expect, test} from 'vitest';
import broken from './fixtures/escalation-broken.json';
import attenuated from './fixtures/escalation-attenuated.json';

/**
 * Same seed, same requisition, same $142,000 winning quote — only AUTHZ_MODE
 * differs. The requester is a Buyer: may approve tier-1 purchases, nothing
 * higher. Both fixtures are captured verbatim from the repro run in each mode.
 */
const isT2Plus = (s: string) => s === 'orders:place:t2' || s === 'orders:place:t3';

describe('authority escalation vs attenuation ($142,000 tier-2 order)', () => {
  test('the requester (Buyer) may approve t1 but not t2', () => {
    for (const fx of [broken, attenuated]) {
      expect(fx.requesterScopes).toContain('orders:place:t1');
      expect(fx.requesterScopes.some(isT2Plus)).toBe(false);
    }
  });

  test('BROKEN: the chain grows past the requester and the order is placed', () => {
    const finalHop = broken.chain.at(-1)!;
    // authority the requester never held, minted to fit the task
    expect(finalHop.scopes).toContain('orders:place:t2');
    expect(broken.requesterScopes).not.toContain('orders:place:t2');
    // order placed at $142,000
    expect(broken.order).not.toBeNull();
    expect(broken.order!.amountCents).toBe(14_200_000);
    expect(broken.denial).toBeNull();
  });

  test('ATTENUATED: the chain only shrinks and the order is DENIED', () => {
    // every hop is a subset of the requester's ceiling — authority never grows
    for (const hop of attenuated.chain) {
      for (const s of hop.scopes) expect(attenuated.requesterScopes).toContain(s);
      expect(hop.scopes.some(isT2Plus)).toBe(false);
    }
    // hop three carries orders:place:t1 at most
    const finalHop = attenuated.chain.at(-1)!;
    expect(finalHop.scopes).toContain('orders:place:t1');
    expect(finalHop.scopes).not.toContain('orders:place:t2');

    // no order row; a denial naming the missing tier
    expect(attenuated.order).toBeNull();
    expect(attenuated.denial).not.toBeNull();
    expect(attenuated.denial!.reason).toBe('insufficient_scope');
    expect(attenuated.denial!.requiredScopes).toEqual(['orders:place:t2']);
    expect(attenuated.denial!.correlationId).toBeTruthy();
  });
});
