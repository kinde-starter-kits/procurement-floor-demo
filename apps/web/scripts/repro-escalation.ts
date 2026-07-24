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
  let events: Array<{seq: number; kind: string; payload: Record<string, unknown>}> = [];
  for (let i = 0; i < 60; i++) {
    events = (await convex.query(api.events.listByRun, {orgCode: ORG, runId: started.runId})) as never;
    if (events.some((e) => e.kind === 'run.completed')) break;
    if (events.some((e) => (e.payload as {error?: unknown})?.error)) break;
    await sleep(2000);
  }

  const delegations = (await convex.query(api.delegations.listByRun, {
    orgCode: ORG,
    runId: started.runId
  })) as Array<{hop: number; subject: string; scopes: string[]}>;

  const requesterScopes =
    (events.find((e) => e.kind === 'run.started')?.payload.requesterScopes as string[]) ?? [];
  const orderEvent = events.find((e) => e.kind === 'ordering.order_placed');

  console.log('Requester ceiling (the person who asked):');
  console.log('  ' + requesterScopes.join(', ') + '   ← cannot place any order\n');

  console.log('Delegation chain (broken mode — grows as it travels):');
  for (const d of delegations) {
    const grew = d.scopes.filter((s) => !requesterScopes.includes(s));
    console.log(
      `  hop ${d.hop}  ${d.subject.padEnd(12)} [${d.scopes.join(', ')}]` +
        (grew.length ? `   +${grew.join(', ')}` : '')
    );
  }

  if (orderEvent) {
    const p = orderEvent.payload as {supplier: string; amountCents: number};
    console.log(
      `\nORDER PLACED: ${p.supplier} @ ${dollars(p.amountCents)} — a tier-2 purchase, ` +
        `authorized by a requester who holds none of orders:place:*.`
    );
  } else {
    console.log('\nNo order was placed (see events).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
