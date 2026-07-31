# Deploy to Vercel

This guide covers the web app on Vercel. Read the caveat in the README first:
agent runs need a Trigger.dev worker, and that worker lives outside Vercel.

## Before you start

Push a production Convex deployment and set its env there. Set up Qdrant Cloud.
Have your Kinde web application credentials ready.

Set the Convex production deployment env with `npx convex env set NAME value
--prod`, or in the Convex dashboard:

- `KINDE_DOMAIN`
- `KINDE_AUDIENCE` — `procurement-floor-api`
- `DELEGATION_SIGNING_SECRET` — a fresh random string
- `MODE` — `live`
- `AUTHZ_MODE` — `attenuated`

## Vercel dashboard steps

1. Open the Vercel dashboard. Click **Add New**, then **Project**.
2. Import the Git repository.
3. Set the **Root Directory** to `apps/web`.
4. Vercel detects Next.js. Leave the build and output settings on their
   defaults.
5. Open **Settings**, then **Environment Variables**. Add every variable in the
   list below. Set each for the Production environment. Add them for Preview too
   if you want preview deploys to work.
6. Add a build-time Convex step. In **Settings**, then **Environment Variables**,
   add `CONVEX_DEPLOY_KEY` from your Convex production deployment. Then set the
   **Build Command** to `npx convex deploy --cmd 'npm run build'`. This deploys
   the Convex functions and builds the app with the right Convex URL.
7. Click **Deploy**.
8. After the first deploy, update the Kinde web application. Add
   `https://your-app.vercel.app/api/auth/kinde_callback` as an allowed callback
   and `https://your-app.vercel.app` as an allowed logout redirect. Update the
   three Kinde redirect variables in Vercel to the Vercel URL. Redeploy.

## Full environment variable list for Vercel

Set all of these in the Vercel project. These are the web app's variables:

- `NEXT_PUBLIC_CONVEX_URL` — from the Convex production deployment.
- `NEXT_PUBLIC_CONVEX_SITE_URL` — from the Convex production deployment.
- `CONVEX_DEPLOY_KEY` — from the Convex production deployment, for the build.
- `KINDE_CLIENT_ID` — from the Kinde web application.
- `KINDE_CLIENT_SECRET` — from the Kinde web application.
- `KINDE_ISSUER_URL` — `https://your-app.kinde.com`.
- `KINDE_SITE_URL` — `https://your-app.vercel.app`.
- `KINDE_POST_LOGIN_REDIRECT_URL` — `https://your-app.vercel.app`.
- `KINDE_POST_LOGOUT_REDIRECT_URL` — `https://your-app.vercel.app`.
- `QDRANT_URL` — the Qdrant Cloud URL.
- `QDRANT_API_KEY` — the Qdrant Cloud key.
- `FLOOR_BASE_URL` — `https://your-app.vercel.app`.
- `TRIGGER_SECRET_KEY` — from the Trigger.dev project, so the app can enqueue the
  run task.

Do not set `KINDE_AUDIENCE` on the web app. Kinde returns the user's permissions
from their role, and the human token never goes through the component. Setting
the audience makes Kinde reject the sign-in.

## The Convex deployment variables

These live on the Convex deployment, not on Vercel. Set them once, as listed in
the "Before you start" section: `KINDE_DOMAIN`, `KINDE_AUDIENCE`,
`DELEGATION_SIGNING_SECRET`, `MODE`, `AUTHZ_MODE`.

## The worker variables

The Trigger worker runs outside Vercel. It reads its own variables, whether you
run it locally or deploy the task to Trigger.dev. Set these where the worker
runs:

- `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF`, `TRIGGER_ACCESS_TOKEN`.
- `KINDE_DOMAIN`, `KINDE_AUDIENCE`.
- `SOURCING_CLIENT_ID`, `SOURCING_CLIENT_SECRET`.
- `NEGOTIATION_CLIENT_ID`, `NEGOTIATION_CLIENT_SECRET`.
- `ORDERING_CLIENT_ID`, `ORDERING_CLIENT_SECRET`.

To run full agent runs against the deployed app, deploy the task to Trigger.dev:

```
cd packages/agents && npx trigger.dev@4.5.7 deploy
```

Or run the worker locally against the deployed app with the same variables and
`FLOOR_BASE_URL` pointed at the Vercel URL:

```
cd packages/agents && npx trigger.dev@4.5.7 dev
```
