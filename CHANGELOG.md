# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — First release

First working demo of agent-to-agent delegation with authority attenuation.

### Added

- Convex schema for the procurement floor. Every table carries an org code and
  an org index, so no query runs without an org filter.
- Kinde human sign-in and three agent identities, one Kinde M2M application per
  agent, verified through the agent-auth component.
- Supplier search over capability text with Qdrant, filtered by org, embedded
  with Transformers.js.
- The agent graph in langgraph.js: sourcing, negotiation, ordering, run inside
  one Trigger.dev task. Each agent mints its own token and calls the app through
  the api-client package.
- Two authorization modes read from `AUTHZ_MODE` on the server. Attenuated
  narrows scopes down the chain and denies the over-budget order. Broken grants
  scopes to fit the task and lets the order escalate.
- The product UI: guest role switch over three real users, the live delegation
  chain drawn as dollar ceilings, and the run timeline.
- A CI boundary gate. The agents package cannot import Convex or reach into the
  web app. One run produces three distinct `sub` claims.
- Scripts: `npm run seed`, `npm run repro`, and `npm run e2e`, the end-to-end
  assertion of both modes.

### Security

- The seed mutation is internal, so a public deployment cannot wipe the supplier
  data. The seed script runs it through the Convex admin CLI.
- Every secret stays out of the repo. The mode, the Kinde audience, and the
  signing secret live on the Convex deployment.

### Notes

- The agent-auth component ships as a vendored tarball under `vendor/`. Swap it
  for the published `@kinde-oss` package once that package lands.
