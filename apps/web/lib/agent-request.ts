import {NextResponse} from 'next/server';
import {ConvexHttpClient} from 'convex/browser';
import {api} from '@/convex/_generated/api';

export interface VerifiedAgent {
  orgCode: string;
  subject: string;
  agentId: string | null;
  scopes: string[];
}

export class AgentRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>
  ) {
    super(`agent_request_error_${status}`);
    this.name = 'AgentRequestError';
  }
}

/** Map any thrown error to a JSON response (AgentRequestError keeps its status). */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AgentRequestError) {
    return NextResponse.json(error.body, {status: error.status});
  }
  return NextResponse.json(
    {error: 'internal_error', message: error instanceof Error ? error.message : String(error)},
    {status: 500}
  );
}

export function convexClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new AgentRequestError(500, {error: 'server_misconfigured'});
  return new ConvexHttpClient(url);
}

/**
 * Verify the caller's bearer token through the component and return its org and
 * subject. Nothing here comes from the request body.
 */
export async function verifyAgent(req: Request): Promise<VerifiedAgent> {
  const authorization = req.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    throw new AgentRequestError(401, {error: 'missing_bearer_token'});
  }
  const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!site) throw new AgentRequestError(500, {error: 'server_misconfigured'});

  const res = await fetch(`${site}/agent/verify`, {method: 'POST', headers: {authorization}});
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new AgentRequestError(res.status, {error: 'token_verification_failed', detail});
  }
  const v = (await res.json()) as VerifiedAgent & {orgCode?: string | null};
  if (!v.orgCode) throw new AgentRequestError(403, {error: 'org_code_required'});
  return {orgCode: v.orgCode, subject: v.subject, agentId: v.agentId, scopes: v.scopes};
}

/**
 * Resolve the run delegation (X-Floor-Delegation header) to its runId through
 * the component. The runId is taken from the verified delegation, never the body.
 */
export async function resolveRunId(req: Request): Promise<string> {
  const delegation = req.headers.get('x-floor-delegation');
  if (!delegation) throw new AgentRequestError(401, {error: 'missing_delegation'});
  const resolved = await convexClient().query(api.runs.resolveDelegation, {
    delegationId: delegation
  });
  if (!resolved) throw new AgentRequestError(403, {error: 'invalid_delegation'});
  return resolved.runId;
}
