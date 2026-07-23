# procurement-floor-demo

A demo of an agentic procurement floor built on Next.js, Convex, Kinde, LangGraph,
and Trigger.dev.

## Workspaces

npm workspaces, no extra monorepo tooling.

| Workspace              | Purpose                                                        |
| ---------------------- | ------------------------------------------------------------- |
| `apps/web`             | Next.js 15 (App Router, TypeScript) app + `convex/` backend.  |
| `packages/agents`      | LangGraph + Trigger.dev agents. Lands in P4. No source yet.   |
| `packages/api-client`  | Dependency-free `createFloorClient` factory.                  |

## Scripts (root)

- `npm run dev` — serve the Next.js app.
- `npm run typecheck` — typecheck every workspace.
- `npm run lint` — lint every workspace.
- `npm run check:boundary` — fail if `packages/agents` depends on Convex or reaches into `apps/`.

## Agent-auth component

The agent-auth Convex component is currently **vendored** as a tarball under
`vendor/` and installed into `apps/web` by file path. Swap this for the
published `@kinde-oss` npm package once it is released.
