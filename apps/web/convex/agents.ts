import {v} from 'convex/values';
import {internalAction} from './_generated/server';
import {components} from './_generated/api';
import {AgentAuth, verifyCaller} from '@kinde-oss/kinde-convex-agent-auth';

const agentAuth = new AgentAuth(components.agentAuth);

/**
 * Register one agent against its Kinde M2M `client_id`.
 *
 * INTERNAL ONLY. `agents.register` is an admin operation — it is never exposed
 * to clients. We invoke this from the CLI (`npx convex run`) during setup.
 *
 * `orgCode` is intentionally omitted: M2M `client_credentials` tokens are
 * org-less, and the component rejects an org-less token for an org-bound agent
 * (`org_code_required_for_org_agent`). This phase establishes identity only.
 */
export const register = internalAction({
  args: {
    name: v.string(),
    slug: v.string(),
    kindeClientId: v.string(),
    scopes: v.array(v.string())
  },
  handler: async (ctx, args): Promise<string> => {
    return await agentAuth.registerAgent(ctx, {
      name: args.name,
      slug: args.slug,
      kindeClientId: args.kindeClientId,
      scopes: args.scopes,
      kind: 'autonomous',
      ownerKind: 'platform',
      allowedTools: []
    });
  }
});

/**
 * Verify a Kinde M2M access token through the component's stable `verifyCaller`
 * seam and return the resolved identity. INTERNAL ONLY — used to prove, from the
 * CLI, that each agent's real token resolves to a distinct subject and scopes.
 * In live mode the component enforces `aud === KINDE_AUDIENCE` and the issuer.
 */
export const verify = internalAction({
  args: {token: v.string()},
  handler: async (ctx, {token}) => {
    const verified = await verifyCaller(ctx, components.agentAuth, token);
    return {
      subject: verified.subject,
      agentId: verified.agentId,
      orgCode: verified.orgCode,
      scopes: verified.scopes
    };
  }
});
