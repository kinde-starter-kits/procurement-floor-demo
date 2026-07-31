/**
 * End-to-end narrative assertion. Runs the whole story through the REAL trigger
 * route + Trigger.dev worker, reads the resulting runEvents, and asserts the
 * actual sequence — not a mock. One command, deterministic, nonzero exit on the
 * first failed assertion. Always restores attenuated mode before exiting.
 *
 * Needs the app and the (pinned) worker running:
 *   Terminal 1:  npm run dev
 *   Terminal 2:  cd packages/agents && npx trigger.dev@4.5.7 dev
 * Then:          npm run e2e
 *
 * Not part of `npm test` — it needs the live worker and Convex.
 */
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ConvexHttpClient} from 'convex/browser';
import {api} from '../convex/_generated/api';

// apps/web dir — for loading env and running the convex CLI in the right place.
const WEB_DIR = fileURLToPath(new URL('..', import.meta.url));
process.loadEnvFile(fileURLToPath(new URL('../.env.local', import.meta.url)));

const BASE = process.env.FLOOR_BASE_URL ?? 'http://localhost:3000';
const CONVEX = process.env.NEXT_PUBLIC_CONVEX_URL!;
const ORG = 'org_d26a1b1345f3d';
const convex = new ConvexHttpClient(CONVEX);

// The one requisition every stage uses. Budget $200,000 → deterministic winner at
// $200,000 * 0.71 = $142,000, a tier-2 order.
const REQUISITION = {
  title: 'Nationwide cold-chain vaccine distribution program',
  description:
    'We need a logistics partner to move temperature-sensitive vaccine shipments and keep them refrigerated in transit across our regional distribution network.',
  budgetCents: 20_000_000
};
const EXPECTED_WINNER_CENTS = 14_200_000; // $142,000

type Role = 'requester' | 'buyer' | 'director';
type Mode = 'attenuated' | 'broken';
interface Ev {
  seq: number;
  kind: string;
  payload: Record<string, unknown>;
}
interface Hop {
  hop: number;
  subject: string;
  scopes: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dollars = (c: number) => '$' + (c / 100).toLocaleString('en-US');
const subset = (a: string[], b: string[]) => a.every((x) => b.includes(x));

// ---- assertion harness ---------------------------------------------------

class AssertionError extends Error {}
let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) {
    console.log(`    ✓ ${label}`);
  } else {
    failures++;
    console.log(`    ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    throw new AssertionError(label);
  }
};

// ---- deployment mode (server-side env, via the convex CLI) ----------------

function setMode(mode: Mode): void {
  execFileSync('npx', ['convex', 'env', 'set', 'AUTHZ_MODE', mode], {
    cwd: WEB_DIR,
    stdio: 'ignore'
  });
}

async function waitForMode(mode: Mode): Promise<void> {
  for (let i = 0; i < 15; i++) {
    const res = (await convex.query(api.config.mode, {})) as {mode: Mode};
    if (res.mode === mode) return;
    await sleep(1000);
  }
  throw new Error(`mode did not settle to ${mode}`);
}

// ---- run a stage through the real route + worker --------------------------

async function guestCookie(role: Role): Promise<string> {
  const res = await fetch(`${BASE}/api/guest/switch`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({role})
  });
  if (!res.ok) throw new Error(`guest switch failed for ${role}: ${res.status}`);
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const jar = setCookie.map((c) => c.split(';')[0]).join('; ');
  if (!jar) throw new Error('no session cookie returned from guest switch');
  return jar;
}

async function startRun(cookie: string): Promise<string> {
  const res = await fetch(`${BASE}/api/runs/trigger`, {
    method: 'POST',
    headers: {'content-type': 'application/json', cookie},
    body: JSON.stringify(REQUISITION)
  });
  const body = (await res.json().catch(() => ({}))) as {runId?: string; error?: string};
  if (!body.runId) throw new Error(`trigger failed: ${JSON.stringify(body)}`);
  return body.runId;
}

const TERMINAL = ['run.completed', 'run.terminated', 'run.failed'];

async function waitForRun(runId: string): Promise<Ev[]> {
  let sawProgress = false;
  for (let i = 0; i < 90; i++) {
    const events = (await convex.query(api.events.listByRun, {orgCode: ORG, runId})) as Ev[];
    if (events.some((e) => e.kind !== 'run.started')) sawProgress = true;
    if (events.some((e) => TERMINAL.includes(e.kind))) return events;
    // ~30s in and still nothing past run.started → the worker isn't processing.
    if (i === 15 && !sawProgress) {
      throw new Error(
        'Run never progressed past run.started — the Trigger.dev worker is not ' +
          'processing tasks. Start it (pinned):\n' +
          '    cd packages/agents && npx trigger.dev@4.5.7 dev'
      );
    }
    await sleep(2000);
  }
  throw new Error(`run ${runId} did not reach a terminal event in time`);
}

async function runStage(mode: Mode, role: Role): Promise<{events: Ev[]; chain: Hop[]; runId: string}> {
  const cookie = await guestCookie(role);
  const runId = await startRun(cookie);
  const events = await waitForRun(runId);
  const chain = (await convex.query(api.delegations.listByRun, {orgCode: ORG, runId})) as Hop[];
  return {events, chain, runId};
}

function printChain(chain: Hop[], requesterScopes: string[]): void {
  for (const d of chain) {
    const beyond = d.scopes.filter((s) => !requesterScopes.includes(s));
    console.log(
      `      hop ${d.hop} ${d.subject.padEnd(12)} [${d.scopes.join(', ')}]` +
        (beyond.length ? `  ⚠ +${beyond.join(', ')}` : '')
    );
  }
}

// ---- reachability preflight ----------------------------------------------

async function preflight(): Promise<void> {
  try {
    const res = await fetch(`${BASE}/api/session`, {method: 'GET'});
    if (!res.ok && res.status >= 500) throw new Error(`status ${res.status}`);
  } catch {
    throw new Error(
      `The app is not reachable at ${BASE}. Start it and the worker (pinned):\n` +
        '    Terminal 1:  npm run dev\n' +
        '    Terminal 2:  cd packages/agents && npx trigger.dev@4.5.7 dev'
    );
  }
}

// ---- stages ---------------------------------------------------------------

async function stage1AttenuatedBuyerDenied(): Promise<void> {
  console.log('\nStage 1 — attenuated · Buyer · $142,000 → DENIED');
  setMode('attenuated');
  await waitForMode('attenuated');
  const {events, chain, runId} = await runStage('attenuated', 'buyer');

  const started = events.find((e) => e.kind === 'run.started');
  const requesterScopes = (started?.payload.requesterScopes as string[]) ?? [];
  printChain(chain, requesterScopes);

  check('mode recorded is attenuated', started?.payload.mode === 'attenuated');
  check('chain has 3 hops', chain.length === 3, `got ${chain.length}`);
  check(
    'every hop stays within the Buyer (chain only shrinks)',
    chain.every((h) => subset(h.scopes, requesterScopes))
  );
  const ordering = chain.find((h) => h.subject === 'ordering');
  check(
    'ordering hop is capped at t1 (no t2/t3)',
    !!ordering &&
      ordering.scopes.includes('orders:place:t1') &&
      !ordering.scopes.includes('orders:place:t2') &&
      !ordering.scopes.includes('orders:place:t3')
  );

  const denied = events.find((e) => e.kind === 'order.denied');
  check('order was denied', !!denied);
  check('reason is insufficient_scope', denied?.payload.reason === 'insufficient_scope', String(denied?.payload.reason));
  check(
    'requiredScopes is exactly ["orders:place:t2"]',
    JSON.stringify(denied?.payload.requiredScopes) === JSON.stringify(['orders:place:t2']),
    JSON.stringify(denied?.payload.requiredScopes)
  );
  check('no ordering.order_placed event', !events.some((e) => e.kind === 'ordering.order_placed'));

  const orders = (await convex.query(api.orders.listByRun, {orgCode: ORG, runId})) as unknown[];
  check('no order row was created', orders.length === 0, `found ${orders.length}`);
  check('run terminated cleanly', events.at(-1)?.kind === 'run.terminated', events.at(-1)?.kind);
}

async function stage2AttenuatedDirectorPlaced(): Promise<void> {
  console.log('\nStage 2 — attenuated · Director · $142,000 → PLACED');
  // Mode already attenuated, but set explicitly so the stage is self-contained.
  setMode('attenuated');
  await waitForMode('attenuated');
  const {events, chain, runId} = await runStage('attenuated', 'director');

  const started = events.find((e) => e.kind === 'run.started');
  printChain(chain, (started?.payload.requesterScopes as string[]) ?? []);

  const placed = events.find((e) => e.kind === 'ordering.order_placed');
  check('order was placed', !!placed);
  check(
    `order placed at ${dollars(EXPECTED_WINNER_CENTS)}`,
    placed?.payload.amountCents === EXPECTED_WINNER_CENTS,
    dollars(Number(placed?.payload.amountCents ?? 0))
  );
  const orders = (await convex.query(api.orders.listByRun, {orgCode: ORG, runId})) as Array<{
    amountCents: number;
  }>;
  check('one order row exists', orders.length === 1, `found ${orders.length}`);
  check('order row amount is $142,000', orders[0]?.amountCents === EXPECTED_WINNER_CENTS);
  check('run completed', events.at(-1)?.kind === 'run.completed', events.at(-1)?.kind);
}

async function stage3BrokenRequesterEscalation(): Promise<void> {
  console.log('\nStage 3 — broken · Requester · $142,000 → PLACED (escalation)');
  setMode('broken');
  await waitForMode('broken');
  const {events, chain, runId} = await runStage('broken', 'requester');

  const started = events.find((e) => e.kind === 'run.started');
  const requesterScopes = (started?.payload.requesterScopes as string[]) ?? [];
  printChain(chain, requesterScopes);

  check('mode recorded is broken', started?.payload.mode === 'broken');
  check(
    'requester holds no ordering authority',
    !requesterScopes.some((s) => s.startsWith('orders:place:'))
  );
  const ordering = chain.find((h) => h.subject === 'ordering');
  check(
    'chain grew past the requester (ordering hop gained orders:place:t2)',
    !!ordering &&
      ordering.scopes.includes('orders:place:t2') &&
      !requesterScopes.includes('orders:place:t2')
  );

  const placed = events.find((e) => e.kind === 'ordering.order_placed');
  check('order was placed anyway', !!placed);
  check(
    `order placed at ${dollars(EXPECTED_WINNER_CENTS)}`,
    placed?.payload.amountCents === EXPECTED_WINNER_CENTS,
    dollars(Number(placed?.payload.amountCents ?? 0))
  );
  const orders = (await convex.query(api.orders.listByRun, {orgCode: ORG, runId})) as unknown[];
  check('one order row exists', orders.length === 1, `found ${orders.length}`);
  check('run completed', events.at(-1)?.kind === 'run.completed', events.at(-1)?.kind);
}

// ---- main -----------------------------------------------------------------

async function main() {
  console.log('Procurement Floor — end-to-end narrative');
  console.log('========================================');
  await preflight();

  const stages: Array<[string, () => Promise<void>]> = [
    ['Stage 1 (attenuated · Buyer · denied)', stage1AttenuatedBuyerDenied],
    ['Stage 2 (attenuated · Director · placed)', stage2AttenuatedDirectorPlaced],
    ['Stage 3 (broken · Requester · escalation)', stage3BrokenRequesterEscalation]
  ];

  const results: Array<[string, boolean]> = [];
  let stopped = false;
  for (const [name, fn] of stages) {
    if (stopped) break;
    try {
      await fn();
      results.push([name, true]);
    } catch (err) {
      results.push([name, false]);
      stopped = true;
      if (err instanceof AssertionError) {
        console.log(`\n  Stage failed on assertion: ${err.message}`);
      } else {
        console.log(`\n  Stage errored: ${(err as Error).message}`);
      }
    }
  }

  console.log('\n----------------------------------------');
  console.log('Summary');
  for (const [name, ok] of results) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  const notRun = stages.length - results.length;
  if (notRun > 0) console.log(`  (${notRun} stage(s) not run)`);
  const allPassed = results.length === stages.length && results.every(([, ok]) => ok);
  console.log(allPassed ? '\nAll stages passed.' : '\nFAILED.');
  return allPassed;
}

// Always restore attenuated before exit, even on failure.
main()
  .then(async (allPassed) => {
    try {
      setMode('attenuated');
      await waitForMode('attenuated');
      console.log('Restored AUTHZ_MODE=attenuated.');
    } catch (e) {
      console.log(`WARNING: could not restore attenuated mode: ${(e as Error).message}`);
    }
    process.exit(allPassed ? 0 : 1);
  })
  .catch(async (err) => {
    console.error(`\nFatal: ${err.message}`);
    try {
      setMode('attenuated');
      await waitForMode('attenuated');
      console.log('Restored AUTHZ_MODE=attenuated.');
    } catch {
      console.log('WARNING: could not restore attenuated mode.');
    }
    process.exit(1);
  });
