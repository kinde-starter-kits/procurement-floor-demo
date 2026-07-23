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
