# Build log

## P0 — Workspace scaffold, vendored auth component, CI boundary gate

### What was built

- **Root workspace** — npm workspaces (`apps/*`, `packages/*`), no extra monorepo
  tooling. Root scripts: `dev`, `typecheck`, `lint`, `check:boundary`.
- **apps/web** — Next.js 15 (App Router, TypeScript) + `convex/`. Installed
  `convex` and `@kinde-oss/kinde-auth-nextjs`. No auth wiring, no schema.
- **packages/agents** — package.json only. Deps: `@langchain/langgraph`,
  `@trigger.dev/sdk`. Does **not** list `convex` or any `apps/web` path.
- **packages/api-client** — single `createFloorClient({ agentToken, delegation,
  baseUrl })` factory. All three required (runtime-validated), no defaults, no
  env fallback, no module-level token. Stub methods throw `not_implemented`.
  Depends on nothing in the workspace.
- **Vendored component** — `npm pack` of `@kinde-oss/kinde-convex-agent-auth`
  (v0.1.0) from the local `feat/agent-auth-component` branch, committed to
  `vendor/` and installed into `apps/web` by `file:` path. Mounted in
  `apps/web/convex/convex.config.ts` via its `./convex.config` export.
  README notes the future swap to the published `@kinde-oss` npm package.
- **scripts/check-boundary.ts** — fails the build if `packages/agents`
  (a) lists `convex`/an `apps/web` path in any dependency field, or (b) has any
  source file importing `convex`, `convex/_generated`, or reaching into `apps/`.
  The P4 gate (three distinct `sub` claims per run) is intentionally **not**
  implemented — it needs real agents.
- **.github/workflows/ci.yml** — on every PR: install → typecheck → lint →
  `check:boundary`.
- Deleted `README_template_generator.md`, `README_template_non-generator.md`,
  `_NEW_REPO_CHECKLIST_.md`. Kept CODEOWNERS, LICENSE, CHANGELOG.

### What was verified (STOP gate)

- `npm install` clean from root — OK.
- `npm run typecheck` clean across all workspaces — OK.
- `npm run check:boundary` passes — OK.
- Boundary gate proof: added `convex` to `packages/agents/package.json` →
  `check:boundary` failed with exit 1 and named the violation → reverted →
  passed again.
- `npx convex dev` connects — provisioned dev deployment
  `ideal-chickadee-758`, installed component `agentAuth`, "Convex functions
  ready", exit 0.
- `npm run dev` serves the Next.js app — HTTP 200, page renders.

### Surprises / decisions worth flagging

- **Component path.** The component lives in the nested repo
  `~/Downloads/kinde-oss-convex/kinde-convex-agent-auth` (already on
  `feat/agent-auth-component`), not the container dir `kinde-oss-convex` itself.
- **Stale dist, no prepack.** The component ships only `dist` + `src` and has no
  `prepack` hook, and its `dist` was older than several source files. Ran
  `npm run build:clean` (codegen + tsc) in the component before `npm pack` so the
  tarball reflects the branch.
- **Mounting requires env.** Mounting the component makes the Convex push require
  `KINDE_DOMAIN` and `DELEGATION_SIGNING_SECRET`; the first push failed until they
  were set. Set **placeholder** dev values plus `MODE=test` (which relaxes the
  external Kinde calls) on the dev deployment purely to demonstrate a clean push.
  These are throwaway dev values, not real secrets, and live only on the Convex
  deployment (not in the repo).
- **.gitignore anchoring.** `convex/_generated/` (mid-pattern slash) anchors to
  the repo root and would not have ignored `apps/web/convex/_generated/`; changed
  to `**/convex/_generated/`. `.env.local` and `_generated` are both confirmed
  ignored.
- **Registry is ahead of the pin.** As of the build the registry had Next 16 and
  TypeScript 7; the workspace is deliberately pinned to the Next 15 line (Next
  ^15.5, TS ^5.9, ESLint ^9, eslint-config-next ^15.5) per the P0 spec.

## P1 — Schema and org tenancy test

### What was built

- **`apps/web/convex/schema.ts`** — 8 tables. Every table carries `orgCode` and
  has a `by_org` index. Money is integer cents stored as `v.int64()` (BigInt) so
  no float can appear; ordinal counts (`round`, `hop`, `seq`) and timestamps
  (ms) are plain numbers. Composite indexes: `by_org_requisition` on `quotes`,
  `negotiationRounds`, `orders`; `by_run_seq` on `runEvents`; `by_run_hop` on
  `delegations`. Nothing writes yet.
- **Test harness** — `convex-test` + `vitest` in `apps/web` (edge-runtime
  environment, `convex-test` inlined, verbose reporter so test names always
  print). `"test": "vitest run"` on the web workspace, wired into root
  `npm test` (`npm run test --workspaces --if-present`).
- **`apps/web/convex/tenancy.test.ts`** — real isolation test over all seven
  tenant-scoped tables (everything except `organizations`). Seeds two orgs with a
  full procurement graph each, then asserts every `by_org` read for org A returns
  only org A rows and that `all == A + B` (so a dropped filter is caught). A
  second test exercises the composite indexes: querying org A with org B's
  requisition id returns nothing, and — because both orgs deliberately share one
  `runId` — `by_run_seq`/`by_run_hop` prove they isolate on the `orgCode` prefix.

### What was verified (STOP gate)

- `npm run typecheck` — clean (exit 0).
- `npm test` — 2 passed, names printed.
- `npx convex dev --once` — pushed the schema, "Convex functions ready", exit 0;
  all 8 tables confirmed present via `npx convex data`.
- `npm run check:boundary` — still passes.
- Negative check (not required, done for confidence): a throwaway copy of the
  test with the `by_org` filter dropped **fails** (`total: expected 2 to be 3`),
  confirming the test catches a forgotten org filter. A missing index is caught
  by the same `.withIndex('by_org', …)` call, which throws when the index is absent.

### Decisions / surprises

- **Run-scoped indexes lead with `orgCode`.** To honor the invariant "no table is
  queryable without an org filter," `by_run_seq` = `[orgCode, runId, seq]` and
  `by_run_hop` = `[orgCode, runId, hop]` (the names describe the run ordering; the
  org prefix is what enforces tenancy). The tenancy test uses a shared `runId`
  across orgs specifically to prove this.
- **Field modeling.** `certifications` and `scopes` are `v.array(v.string())`;
  `capabilities`/`description` are free-text `v.string()`; `runEvents.payload` is
  `v.any()`; `parentDelegationId` is an optional self-referential id.
- **convex-test in a workspace.** node_modules is hoisted to the repo root, so
  convex-test can't auto-locate the convex dir — it needs the modules map via
  `import.meta.glob('./**/*.*s')` as the second argument (the `!(*.*.*)` glob from
  the docs excluded the `_generated/*.d.ts` files it needs).
- **`import.meta.glob` typing.** That Vite API isn't in the default TS lib; added
  `/// <reference types="vite/client" />` to the test so `tsc --noEmit` stays clean.
- **CI typecheck fix (PR #3).** P0 gitignored `**/convex/_generated/`, but CI has
  no deploy key and never runs the Convex CLI, so a fresh checkout had no
  generated types and `tsc` failed with `Cannot find module './_generated/…'`.
  Fix: stopped ignoring `convex/_generated` and committed it. **Reminder for the
  next schema change: `convex/_generated` is committed — after editing
  `schema.ts`, run `npx convex codegen` and commit the regenerated
  `_generated` alongside it, or CI typecheck will drift/break.**

## P2 — Kinde human auth and three agent identities

This phase establishes identity only. Nothing enforces authority yet.

### What was built

- **Human auth** (`apps/web`):
  - `app/api/auth/[kindeAuth]/route.ts` — Kinde `handleAuth()` (login / logout /
    register / callback).
  - `lib/kinde-session.ts` — `getActingUser()` returns `{subject, orgCode,
    permissions}` read **only** from `getKindeServerSession()` (verified session);
    no header/query/body input. Fails closed: throws if unauthenticated or if any
    of subject / orgCode / permissions is missing.
  - `app/api/me/route.ts` — returns the helper output, 401 on fail-closed.
  - `app/page.tsx` — sign-in/out links and a session panel.
- **Agent identities** (`apps/web/convex/agents.ts`):
  - `register` (internalAction) wraps the component's admin-only
    `agents.register`, mapping each agent to its Kinde M2M `client_id` + scopes.
    Registered org-less on purpose (M2M `client_credentials` tokens are org-less;
    an org-bound agent would reject them with `org_code_required_for_org_agent`).
  - `verify` (internalAction) calls the component's `verifyCaller` seam.
  - Three agents registered: sourcing (`procurement:read`, `quotes:request`),
    negotiation (`procurement:read`, `quotes:negotiate`), ordering
    (`procurement:read`, `orders:place:t1`).

### Secrets handling

- Deployment env only: `KINDE_DOMAIN=devrelstudio.kinde.com`,
  `KINDE_AUDIENCE=procurement-floor-api`, a fresh random `DELEGATION_SIGNING_SECRET`
  (replaced the P0/P1 placeholder), and `MODE=live` (flipped off `test`).
- Web-app client id/secret + issuer/site URLs in `apps/web/.env.local` (gitignored).
- M2M client secrets never touched the repo — used transiently to mint tokens.

### What was verified (STOP gate)

- **Three agent tokens through `verifyCaller` (live mode), distinct subjects:**
  each real `client_credentials` token resolved to its own subject (the M2M
  `azp`/client id), its own `agentId`, and its granted scopes — sourcing,
  negotiation, ordering all distinct.
- **`MODE` is `live`** on the deployment (`npx convex env get MODE` → `live`).
- **Human wiring proven:** unauthenticated `GET /api/me` → 401 `not_authenticated`
  (fail-closed); `GET /api/auth/login` → 307 to
  `devrelstudio.kinde.com/oauth2/auth` with the correct `client_id`,
  `redirect_uri`, and `audience`.
- `npm run typecheck`, `npm test` (2 passed), `npm run check:boundary` — all green.
- `npx convex dev --once` — pushed, "Convex functions ready", exit 0.
- **Live per-role signed-in sessions — CONFIRMED.** The owner completed the three
  passwordless (email-code) sign-ins; `GET /api/me` returned the correct verified
  identity for each, three distinct subjects, all in `org_d26a1b1345f3d`:
  - Requester (`kp_c13368…`) → `procurement:read`, `quotes:request`
  - Buyer (`kp_60c416…`) → `+ quotes:negotiate`, `orders:place:t1`
  - Director (`kp_1af9e0e…`) → `+ orders:place:t2`, `orders:place:t3`
  Permissions came through on the role-based token with no custom audience
  requested, confirming the audience-whitelist fix below.

### Note

- The component build (v0.1.0) exposes registration as `agents.register`; there is
  no export literally named `provisionAgent`.
- **Web app must not request the API audience unless whitelisted.** Setting
  `KINDE_AUDIENCE` on the web app made the SDK add `audience=procurement-floor-api`
  to the auth request, which Kinde rejected (`Requested audience … has not been
  whitelisted by the OAuth 2.0 Client`). The human session doesn't need that
  audience — permissions come from the user's roles and the human token never
  goes through `verifyCaller` — so `KINDE_AUDIENCE` was removed from
  `apps/web/.env.local`. (The Convex deployment keeps its own `KINDE_AUDIENCE`
  for M2M token verification.) If a future need requires audience-bound human
  tokens, whitelist the Web app for the API in the Kinde dashboard instead.

## P3 — Qdrant supplier search

Semantic supplier search: a buyer's plain-language requisition is matched against
supplier capability text.

### What was built

- **Qdrant** (`apps/web/lib/qdrant.ts`) — a single `suppliers` collection (384-d,
  cosine) with `orgCode` as an indexed payload key. Never one collection per org.
  The client is built from `QDRANT_URL` + `QDRANT_API_KEY` only, so local Docker →
  Qdrant Cloud is a two-value change with no code change (api key optional for a
  bare local instance).
- **Embeddings** (`apps/web/lib/embeddings.ts`) — Transformers.js
  `Xenova/all-MiniLM-L6-v2`, 384-d, normalized. Runs in the Node app layer only;
  no embedding code in Convex (ONNX can't run there).
- **Search route** (`apps/web/app/api/suppliers/search/route.ts`, `runtime =
  'nodejs'`) — (1) verifies the caller's agent token via the component's
  `POST /agent/verify` (mounted in `convex/http.ts`), (2) takes `orgCode` from the
  verified token, never the body, (3) embeds the query, (4) searches Qdrant with
  the org filter always applied. A caller can't reach another org's suppliers
  because it never names the org.
- **Seed** (`apps/web/scripts/seed-suppliers.ts` + `supplier-data.ts`) — two orgs,
  13 realistic suppliers each (fabrication, logistics/cold-chain, industrial
  chemicals, IT hardware, facilities, professional services, etc.) with regions
  and certifications. One script writes Convex (via `suppliers.seedReplaceOrg`,
  which returns the ids) and Qdrant, so the two stores can't drift.
- **Tests** (`apps/web/lib/supplier-search.integration.test.ts`) — self-contained
  against a bare local Qdrant (fresh collection, torn down after).

### What was verified (STOP gate)

- **Seed** populated both orgs in both stores and reported agreement: Qdrant 26
  points; Convex 13 + 13.
- **Real free-text search** through the route with a live sourcing-agent token:
  query "…move temperature-sensitive vaccine shipments and keep them cold in
  transit." → ranked, scored results, top hit **Polar Route Freight Systems**
  (0.3578) — a cold-chain vendor whose text contains none of "vaccine/cold/move",
  so a keyword filter would have missed it.
- **Cross-org isolation** (integration test, local Qdrant): an Org X search never
  returns Org Y's near-identical cold-chain vendor even though it's the strong
  global match; every result carries `orgCode === ORG_X`. Plus a semantic test
  asserting the free-text match is unreachable by keyword. Both pass.
- `npm run typecheck`, `npm test` (2 tenancy tests), `npm run check:boundary` —
  green. `npx convex dev --once` — pushed, exit 0.

### Decisions

- **Integration tests are separated from `npm test`.** The default suite stays
  edge-runtime/CI-safe; Qdrant+ONNX tests live in `*.integration.test.ts` and run
  via `npm run test:integration` (a second vitest config, Node runtime, long
  timeout). CI has no Docker Qdrant or model, so they must not be in the default run.
- **Org B is synthetic.** Org A is the real Kinde org (`org_d26a1b1345f3d`) the M2M
  agents belong to, so an agent search resolves to its suppliers. Org B
  (`org_7c4a9e2f1b60`) exists only to prove isolation.
- **`suppliers.seedReplaceOrg` is a public mutation** so the Node seed script can
  call it via `ConvexHttpClient` (internal functions aren't client-callable). It is
  a dev/demo seed entry point on a dev deployment.
- Local Qdrant runs in Docker as container `qdrant-p3` (`docker rm -f qdrant-p3`
  to remove). Deployed demo would set `QDRANT_URL`/`QDRANT_API_KEY` to Qdrant Cloud.

## P4 — Agent graph in a Trigger.dev task

Three agents (sourcing → negotiation → ordering) run as a LangGraph graph inside
one Trigger.dev task. This phase records handoffs; nothing enforces scopes yet.

### What was built

- **`packages/agents`** — LangGraph `StateGraph` with three nodes and real
  handoffs, wrapped in the `procurement-run` Trigger.dev task. Negotiation rounds
  are separate retryable steps (`retry.onThrow`). Each node calls `openSession`,
  which mints that node's OWN Kinde M2M token from its OWN client credentials and
  returns a `createFloorClient`. **No node imports the Convex client, no node
  reuses another's token, no ambient credentials.** `check:boundary` confirms the
  package is clean of `convex`/`apps`.
- **`packages/api-client`** — real `createFloorClient`: dependency-free, fetch
  only; sends the node token (`Authorization: Bearer`) and the run delegation
  (`X-Floor-Delegation`) on every call.
- **App routes** (Node runtime): `/api/runs/trigger` (verifies the starter token,
  creates the requisition, issues the run delegation, triggers the task, returns
  immediately), `/api/events`, `/api/quotes`, `/api/negotiation-rounds`,
  `/api/orders`. Every route derives `orgCode` from the verified token and (for
  events) `runId` from the verified delegation — never from the body. Each event
  is stamped with the acting agent's verified subject.
- **runId in a verified credential**: `runs.start` issues a component delegation
  whose `resources` carries `run:<runId>`; `runs.resolveDelegation` verifies the
  HMAC and reads the runId back out. The delegation is issued with empty scopes
  (P4 doesn't enforce; it only needs to carry the runId, and empty scopes are
  always a valid subset of the issuer's grants — avoids `scopes_exceed_agent`).
- **Two paths**: deterministic negotiation by default (fixed ~4%/round concession,
  no model, always works). Optional BYOK path (`NEGOTIATION_STRATEGY=byok` +
  `BYOK_*`) asks a real OpenAI-compatible model and falls back to deterministic on
  any error, so a run never depends on it. Only the deterministic path is exercised.

### What was verified (STOP gate)

- **One full deterministic run, end to end, produced an order.** Requisition
  "Cold-chain vaccine distribution" → sourcing shortlisted Polar Route / Continental
  Bulk / Summit → negotiation ran rounds 1–3 → ranked Continental Bulk Logistics
  ($41,472) → ordering placed the order (`status: placed`, correlationId = runId).
- **runEvents sequence readable start to finish** (11 events, seq 0–10): run.started
  → sourcing.searching/shortlisted/handoff → negotiation.quotes_requested/round×2/
  ranked/handoff → ordering.order_placed → run.completed. Each event carries the
  acting subject.
- **Three distinct `sub` claims in that run**: sourcing `250c9a46…`, negotiation
  `4d8469ba…`, ordering `20a4f1b1…`. Proven by the new test
  (`apps/web/convex/run-identities.test.ts`) over a fixture captured verbatim from
  the run's `runEvents`. It runs in `npm test`, and `npm test` is now a CI step —
  so the third gate is enforced in CI (with no live credentials).
- `npm run typecheck`, `npm test` (5 passed), `npm run check:boundary` — green.
  `npx convex dev --once` — pushed, exit 0.

### Notes

- **Trigger.dev auth**: the app enqueues with the project secret key
  (`TRIGGER_SECRET_KEY`); the local worker (`trigger.dev dev`) authenticates with a
  Personal Access Token (`TRIGGER_ACCESS_TOKEN`). Both live in gitignored env
  (`packages/agents/.env`, `apps/web/.env.local`); never the repo. The
  project ref (not a secret) is in `trigger.config.ts`.
- **CI test step added**: `ci.yml` now runs `npm test` (previously it didn't), so
  the tenancy tests (P1) and the identity gate (P4) are both enforced in CI.
- The identity fixture is real captured output; re-running the demo and
  re-capturing keeps it honest as the graph evolves.

## P5 — Broken mode and the escalation repro

Reproduces the authority-escalation bug: at each handoff the app mints the next
delegation with the scopes the *task* needs, instead of inheriting from the
person who asked. The chain grows as it travels. Builds `broken` only.

### What was built

- **Mode switch** (`apps/web/convex/authz.ts`): `authzMode()` reads `AUTHZ_MODE`
  from the deployment env ONLY — never a header, body, or query param. `broken`
  grows scopes (`nextScopes` = parent ∪ next-step needs, no intersection);
  `attenuated` throws `not_implemented` (P6).
- **Broken chain** (`convex/runs.ts`, `convex/handoffs.ts`): replaced P4's single
  empty-scope stopgap. `runs.start` records the requester's ceiling and mints
  hop 1 (sourcing). `handoffs.mint` mints each subsequent hop with grown scopes;
  the ordering hop's scope (`orders:place:tN`) is derived from the winning amount
  (`orderTier`: $142,000 → t2). **Every `delegations` row records its effective
  scopes** with a `parentDelegationId` link, so the chain reads back afterward.
- **Handoff seam**: new `/api/handoff` route + `FloorClient.handoff` — nodes mint
  the next hop at each handoff. org/runId come from the verified token+delegation;
  `toStep`/`amountCents` are work data; the MODE is never from the request.
- **Deterministic pricing** (`packages/agents`): suppliers ranked by search score
  settle to per-rank target fractions of budget; the winner = `round(budget*0.71)`.
  Budget $200,000 → winner exactly **$142,000** (tier 2), same every run.

### What was verified (STOP gate)

- **Repro, one command** (`npm run repro`): started by a requester holding only
  `procurement:read, quotes:request`, it places a **$142,000** order (Polar Route
  Freight Systems) — a tier-2 purchase the requester could never authorize.
- **runEvents show the growth** (scope set at each hop, side by side):
  - hop 1 sourcing: `[procurement:read, quotes:request]`
  - hop 2 negotiation: `[…, quotes:negotiate]`
  - hop 3 ordering: `[…, quotes:negotiate, orders:place:t2]`  ← `orders:place:t2`
    appears from nowhere (`delegation.minted` at seq 10, `tier=t2`).
- **delegations rows** show the chain growing with `parentDelegationId` links and
  effective scopes per hop.
- **Test** (`convex/escalation.test.ts`, default suite → CI): asserts broken mode,
  the requester holds no `orders:place:*`, the chain grows, and the $142,000
  tier-2 order is placed above the ceiling. P6 flips this same test to a denial.
- **Mode cannot be set from a request**: injecting `attenuated` via header + query
  + body while the deployment was `broken` was ignored (`run.started mode=broken`);
  flipping the DEPLOYMENT env to `attenuated` made the same request refuse with
  `not_implemented`. Reverted to `broken`.
- `npm run typecheck`, `npm test` (9 passed), `npm run check:boundary` — green.
  `npx convex dev --once` — pushed, exit 0.

### Notes

- The requester's ceiling is represented by a principal holding exactly the
  Requester role's scopes (`procurement:read, quotes:request`) — the sourcing M2M
  app — so the repro is one deterministic command with no human login. The
  essential property (root authority cannot approve any purchase) holds.
- The component HMAC delegation still only carries the runId (its scopes are
  capped at the issuing agent's grant, so it cannot represent an over-provisioned
  chain). The effective (broken) scope chain is the app's `delegations` table,
  which is exactly what P6's attenuated mode will enforce against.
- `AUTHZ_MODE=broken` is set on the dev deployment (env only, not the repo).

## P6 — Attenuated mode

The fix for P5's escalation. `AUTHZ_MODE=attenuated`: authority only ever shrinks,
enforced by the component's own delegation + `authz.can` machinery.

### What was built

- **Attenuated chain** (`convex/authz.ts`, `convex/hop.ts`): each node mints its
  own hop with `intersect(REQUESTER_SCOPES, agent scopes)` — never more than the
  requester (a Buyer, capped at tier 1) holds and never more than the agent holds.
  The hop is issued through the COMPONENT's `delegations.issue` (rooted at the
  human requester, `issuerKind:'user'`); the component refuses any scope the agent
  does not itself hold. The ordering hop also starts a component `instance`.
- **Enforcement at the order** (`convex/orders.ts` `submit` action, mode read from
  the deployment env): in attenuated mode it calls the component's `authorize`
  (`verifyCaller` + `authz.can`) for `orders:place:t{tier}` before placing. The
  ordering agent's effective scopes — `agent.scopes ∩ delegation.scopes ∩
  tokenScopes` — cap at `orders:place:t1`, so a t2 order is refused with
  `insufficient_scope`. The graph reads the denial and terminates cleanly.
- Per-node hop minting replaced P5's handoff-mints-next (`/api/handoff` →
  `/api/hop`), so each node's own agentId is available to root its component
  delegation. Broken mode still grows (both modes share the same seed/graph).

### What was verified (STOP gate)

- **Same repro command, attenuated mode → denied at hop 3** (`npm run repro`):
  requester (Buyer) `procurement:read, quotes:request, quotes:negotiate,
  orders:place:t1`; chain shrinks — hop1 `[read, request]`, hop2 `[read,
  negotiate]`, hop3 `[read, orders:place:t1]`; the $142,000 (t2) order is DENIED,
  `insufficient_scope`, `requiredScopes: ["orders:place:t2"]`, with a correlationId.
- **runEvents for the denied run** read start to finish: scopes shrinking per hop
  (`delegation.minted` seq 1/5/11), then `order.denied` (seq 12) with the reason +
  requiredScopes + correlationId, then `run.terminated` — no crash.
- **No order row** was created (`npx convex data orders` → 0 rows for the runId).
- **Component's real delegation chain**: the ordering agent's component delegation
  is `issuerSubject: human:buyer-requester`, `scopes: [orders:place:t1,
  procurement:read]` — the intersection, `orders:place:t2` never mintable. The
  component **audit trail** records the `authz.decision` deny:
  `effectiveScopes:[orders:place:t1, procurement:read]`, `action:orders:place:t2`,
  `reason:insufficient_scope`.
- **Both modes tested, same seed** (`convex/escalation.test.ts`): BROKEN → chain
  grows past the requester, $142,000 order placed; ATTENUATED → chain only shrinks,
  no order, denial naming `orders:place:t2`. Fixtures captured verbatim from each run.
- `npm run typecheck`, `npm test` (8 passed), `npm run check:boundary` — green.
  `npx convex dev --once` — pushed, exit 0.

### Notes

- The requester is represented as a **Buyer** (holds `orders:place:t1`, not t2) —
  the scenario where attenuation's nuance shows: a t1 holder blocked from a t2
  purchase, `requiredScopes` naming exactly the missing tier. (P5's requester held
  no `orders:place`; P6 raises the ceiling to t1 so hop 3 visibly carries t1.)
- The intersection is done by the component (`scopes_exceed_agent` at issue,
  `intersectScopes` in `authz.can`) — the app pins only the requester half and lets
  the component do the rest, exactly as intended.
- `AUTHZ_MODE=attenuated` is the deployment's resting state (the fix is active);
  flip the env to `broken` to see the escalation again. Mode is env-only.
