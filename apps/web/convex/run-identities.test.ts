import {describe, expect, test} from 'vitest';
import manifest from './fixtures/run-identities.json';

/**
 * The third CI gate: one run produces three distinct `sub` claims — one per
 * node (sourcing, negotiation, ordering). The fixture is captured verbatim from
 * a real deterministic run's `runEvents` (each event carries the acting agent's
 * verified subject). This runs in the default `npm test`, so it is enforced in CI
 * with no live credentials or services.
 */
describe('agent run identities', () => {
  test('the run is complete start to finish', () => {
    const kinds = manifest.events.map((e) => e.kind);
    expect(kinds[0]).toBe('run.started');
    expect(kinds).toContain('ordering.order_placed');
    expect(kinds.at(-1)).toBe('run.completed');
  });

  test('one run produces exactly three distinct sub claims', () => {
    const subjects = new Set(manifest.events.map((e) => e.subject).filter(Boolean));
    expect(subjects.size).toBe(3);
  });

  test('each node acted under its own distinct identity', () => {
    const {sourcing, negotiation, ordering} = manifest.phaseSubjects;
    for (const s of [sourcing, negotiation, ordering]) {
      expect(s, 'phase subject must be present').toBeTruthy();
    }
    expect(new Set([sourcing, negotiation, ordering]).size).toBe(3);

    // Every event belongs to the subject of its phase — no node borrowed another's.
    for (const e of manifest.events) {
      if (e.kind.startsWith('sourcing.')) expect(e.subject).toBe(sourcing);
      if (e.kind.startsWith('negotiation.')) expect(e.subject).toBe(negotiation);
      if (e.kind === 'ordering.order_placed') expect(e.subject).toBe(ordering);
    }
  });
});
