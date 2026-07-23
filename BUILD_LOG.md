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
