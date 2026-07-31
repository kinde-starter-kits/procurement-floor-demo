# Procurement Floor

Procurement Floor is a demo app that shows what happens to authority when one agent hands work to another. A person starts a run. Agents act for that person: one sources suppliers, one negotiates quotes, one places the order. Each handoff passes a slice of authority down a chain. The demo shows that chain holding, or leaking.

The story turns on one number. A run settles on a winning quote of $142,000. That
order needs tier-2 approval. The person who started the run is a Buyer, and a
Buyer can approve up to $50,000. So the order should not go through. Whether it
does depends on how each hop gets its scopes.

## Two modes

The app runs in one of two modes. It reads the mode from `AUTHZ_MODE` on the
server. A request cannot set it, so the caller cannot pick the rules it runs
under.

In attenuated mode, each hop gets the scopes of the person who asked, narrowed to
what the agent itself holds. Authority can only shrink down the chain. The
ordering agent never gains tier-2 approval, so the $142,000 order is denied with
`insufficient_scope` and a required scope of `orders:place:t2`. No order row is
written. The run ends with a denial, not a crash.

In broken mode, each hop gets the scopes its own task needs, granted fresh. The
chain grows as it travels. The ordering agent gains tier-2 approval because the
order needs it, and the order goes through. A Buyer, or even a Requester who can
approve nothing, ends up placing a $142,000 order that no one with the authority
signed off on. That is the bug the demo makes visible.

Attenuated is the fix. Broken is the failure it fixes.

## How Kinde fits

Kinde issues and verifies identity and scopes at each hop. Every agent has its
own Kinde M2M application and mints its own JWT. The app verifies that token
through the agent-auth component and reads the caller's org and scopes from the
verified claims, never from the request body.

The attenuation chain itself lives in the agent-auth component, not in Kinde's
core product. The component issues each hop's delegation, refuses to grant a
scope the issuer does not hold, and decides each action through one `authorize()`
call. Kinde gives you verified identity and scopes at every hop. The component
turns that into a delegation chain that only narrows. Do not read this as Kinde
shipping chain attenuation on its own.

The agent-auth component ships here as a vendored tarball under `vendor/`. The
app installs it by file path. Swap it for the published `@kinde-oss` package once
that package lands.

## Stack

- Next.js for the web app and the API routes.
- Convex for the database, the run records, and the server functions.
- Kinde for human sign-in and agent identity, through the agent-auth component.
- langgraph.js for the agent graph, run inside one task.
- Qdrant for supplier search over capability text.
- Trigger.dev for the task that runs the whole graph.

## What you need first

Install Node 22 and Docker. Create a Convex account, a Kinde account, and a
Trigger.dev account.

In Kinde, create these objects:

- One API. Set its audience to `procurement-floor-api`. This audience is the
  `KINDE_AUDIENCE` value.
- One back-end web application for human sign-in. Add
  `http://localhost:3000/api/auth/kinde_callback` as an allowed callback and
  `http://localhost:3000` as an allowed logout redirect.
- Three M2M applications, one per agent: sourcing, negotiation, ordering.
  Authorize each to the API.
- Six permissions: `procurement:read`, `quotes:request`, `quotes:negotiate`,
  `orders:place:t1`, `orders:place:t2`, `orders:place:t3`.
- Three roles. Requester holds `procurement:read` and `quotes:request`. Buyer
  adds `quotes:negotiate` and `orders:place:t1`. Director adds `orders:place:t2`
  and `orders:place:t3`.
- Three test users, one per role. The public demo does not need their passwords.
  The guest role switch maps to their scopes.

## Environment variables

The variables split across three places. Keep every secret out of the repo. The
mode, the Kinde audience, and the signing secret belong on the Convex deployment,
not in a committed file.

Set these on the Convex deployment with `npx convex env set NAME value`:

- `KINDE_DOMAIN`, for example `your-app.kinde.com`.
- `KINDE_AUDIENCE`, the API audience, `procurement-floor-api`.
- `DELEGATION_SIGNING_SECRET`, a fresh random string the component uses to sign
  delegations.
- `MODE`, set to `live` so the component verifies real Kinde tokens.
- `AUTHZ_MODE`, set to `attenuated` or `broken`.

Set these in `apps/web/.env.local` for the web app:

- `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL`, from Convex.
- `CONVEX_DEPLOYMENT`, from Convex, for the CLI.
- `KINDE_CLIENT_ID` and `KINDE_CLIENT_SECRET`, from the web application.
- `KINDE_ISSUER_URL`, `https://your-app.kinde.com`.
- `KINDE_SITE_URL`, `KINDE_POST_LOGIN_REDIRECT_URL`,
  `KINDE_POST_LOGOUT_REDIRECT_URL`, all `http://localhost:3000` for local work.
- `QDRANT_URL` and `QDRANT_API_KEY`.
- `FLOOR_BASE_URL`, `http://localhost:3000` for local work.
- `TRIGGER_SECRET_KEY`, so the app can enqueue the run task.

Set these in `packages/agents/.env` for the Trigger worker:

- `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF`, `TRIGGER_ACCESS_TOKEN`.
- `KINDE_DOMAIN` and `KINDE_AUDIENCE`.
- `SOURCING_CLIENT_ID` and `SOURCING_CLIENT_SECRET`.
- `NEGOTIATION_CLIENT_ID` and `NEGOTIATION_CLIENT_SECRET`.
- `ORDERING_CLIENT_ID` and `ORDERING_CLIENT_SECRET`.

The web app does not request the API audience during human sign-in. Kinde returns
the user's permissions from their role, and the human token never goes through
the component. Leave `KINDE_AUDIENCE` off the web app so Kinde does not reject the
sign-in.

## Qdrant

For local work, run Qdrant in Docker:

```
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant:latest
```

Set `QDRANT_URL` to `http://localhost:6333` and leave `QDRANT_API_KEY` empty.

To move to Qdrant Cloud, change those two values. Set `QDRANT_URL` to the cloud
URL and `QDRANT_API_KEY` to the cloud key. No code changes.

## Run it locally

Install once from the repo root:

```
npm install
```

Start Convex and leave it running. It connects and writes the generated types:

```
cd apps/web && npx convex dev
```

Seed the suppliers into both Convex and Qdrant from one script:

```
npm run seed --workspace apps/web
```

Start the web app:

```
npm run dev
```

Start the Trigger worker in a second terminal. Pin it to the SDK version, since a
newer CLI refuses to run against it:

```
cd packages/agents && npx trigger.dev@4.5.7 dev
```

Open `http://localhost:3000`. Pick a role, keep the default requisition, and
start a run. Watch the chain draw hop by hop and the timeline fill in. Switch
`AUTHZ_MODE` on the Convex deployment to see the other mode.

## Run the checks

The unit tests cover the schema, tenancy, and the run identity trail. They need
no live services:

```
npm test
```

The integration tests run supplier search against a local Qdrant:

```
npm run test:integration --workspace apps/web
```

The repro script starts one run and prints the delegation chain and the outcome:

```
npm run repro --workspace apps/web
```

The end-to-end script runs the whole story and asserts it: attenuated denies a
Buyer, attenuated places a Director's order, broken lets a Requester escalate. It
needs the app and the worker running. It restores attenuated mode at the end:

```
npm run e2e
```

## Deploy

Deploy the web app to Vercel. The public path is the deterministic demo with the
guest role switch. It needs no model key.

One caveat matters. Agent runs do not complete on Vercel on their own. The graph
runs inside a Trigger.dev task, and that task needs a worker. Vercel runs the web
app, not a long-running worker. So a deployed Vercel app can start a run, but the
run stalls at `run.started` until a worker picks it up.

You have two ways to run the worker. Run it locally against the deployed app with
`npx trigger.dev@4.5.7 dev`. Or deploy the task to Trigger.dev with
`npx trigger.dev@4.5.7 deploy`, which runs it in Trigger.dev's cloud. Either way,
the worker lives outside Vercel.

So the deployed Vercel demo shows the sign-in, the guest role switch, the
requisition form, the live mode read from the server, and the chain and timeline
views. To watch a full run finish, run the worker too, or run the whole thing
locally.

See `DEPLOY.md` for the exact Vercel dashboard steps and the full variable list.
