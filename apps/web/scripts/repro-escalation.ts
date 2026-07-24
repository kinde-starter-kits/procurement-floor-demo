import {fileURLToPath} from 'node:url';
import {ConvexHttpClient} from 'convex/browser';
import {api} from '../convex/_generated/api';

// Load the agent credentials (agents/.env) and the app env (web/.env.local).
process.loadEnvFile(fileURLToPath(new URL('../../../packages/agents/.env', import.meta.url)));
process.loadEnvFile(fileURLToPath(new URL('../.env.local', import.meta.url)));

const BASE = process.env.FLOOR_BASE_URL ?? 'http://localhost:3000';
const CONVEX = process.env.NEXT_PUBLIC_CONVEX_URL!;
const ORG = 'org_d26a1b1345f3d';

// The requester is represented by a principal holding exactly the Requester
// role's scopes (procurement:read, quotes:request) and NO orders:place — it
// cannot approve a purchase of any size. The sourcing M2M app has those scopes.
async function mintRequesterToken(): Promise<string> {
  const res = await fetch(`https://${process.env.KINDE_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SOURCING_CLIENT_ID!,
      client_secret: process.env.SOURCING_CLIENT_SECRET!,
      audience: process.env.KINDE_AUDIENCE!
    })
  });
  const data = (await res.json()) as {access_token?: string};
  if (!data.access_token) throw new Error('failed to mint requester token');
  return data.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dollars = (cents: number) => '$' + (cents / 100).toLocaleString('en-US');

async function main() {
  const token = await mintRequesterToken();

  // Deterministic requisition: budget $200,000 → winner settles at $200,000 * 0.71
  // = $142,000, which is a tier-2 order.
  const res = await fetch(`${BASE}/api/runs/trigger`, {
    method: 'POST',
    headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
    body: JSON.stringify({
      title: 'Nationwide cold-chain vaccine distribution program',
      description:
        'We need a logistics partner to move temperature-sensitive vaccine shipments and keep them refrigerated in transit across our regional distribution network.',
      budgetCents: 20_000_000
    })
  });
  const started = (await res.json()) as {runId: string; requisitionId: string};
  if (!started.runId) throw new Error('trigger failed: ' + JSON.stringify(started));
  console.log(`Run started: ${started.runId}\n`);

  const convex = new ConvexHttpClient(CONVEX);
  const TERMINAL = ['run.completed', 'run.terminated'];
  let events: Array<{seq: number; kind: string; payload: Record<string, unknown>}> = [];
  for (let i = 0; i < 60; i++) {
    events = (await convex.query(api.events.listByRun, {orgCode: ORG, runId: started.runId})) as never;
    if (events.some((e) => TERMINAL.includes(e.kind))) break;
    await sleep(2000);
  }

  const delegations = (await convex.query(api.delegations.listByRun, {
    orgCode: ORG,
    runId: started.runId
  })) as Array<{hop: number; subject: string; scopes: string[]}>;

  const startedEvent = events.find((e) => e.kind === 'run.started');
  const mode = (startedEvent?.payload.mode as string) ?? 'unknown';
  const requesterScopes = (startedEvent?.payload.requesterScopes as string[]) ?? [];
  const orderEvent = events.find((e) => e.kind === 'ordering.order_placed');
  const deniedEvent = events.find((e) => e.kind === 'order.denied');

  console.log(`Mode: ${mode}`);
  console.log('Requester ceiling (the Buyer who asked):');
  console.log('  ' + requesterScopes.join(', ') + '   ← may approve t1, but NOT t2\n');

  const verb = mode === 'attenuated' ? 'intersected — only shrinks' : 'grows as it travels';
  console.log(`Delegation chain (${mode} mode — ${verb}):`);
  for (const d of delegations) {
    const beyond = d.scopes.filter((s) => !requesterScopes.includes(s));
    console.log(
      `  hop ${d.hop}  ${d.subject.padEnd(12)} [${d.scopes.join(', ')}]` +
        (beyond.length ? `   ⚠ +${beyond.join(', ')} (beyond the requester)` : '')
    );
  }

  if (orderEvent) {
    const p = orderEvent.payload as {supplier: string; amountCents: number};
    console.log(
      `\nORDER PLACED: ${p.supplier} @ ${dollars(p.amountCents)} — a tier-2 purchase, ` +
        `beyond the Buyer's t1 ceiling. (broken mode let authority grow to fit the task)`
    );
  } else if (deniedEvent) {
    const p = deniedEvent.payload as {reason: string; requiredScopes: string[]; correlationId: string};
    console.log(
      `\nORDER DENIED at hop 3: ${p.reason}\n` +
        `  requiredScopes: ${JSON.stringify(p.requiredScopes)}\n` +
        `  correlationId:  ${p.correlationId}\n` +
        `No order row was created. The chain never granted more than the Buyer's t1.`
    );
  } else {
    console.log('\nNo terminal order outcome found (see events).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
