import {createFloorClient, type FloorClient} from '@procurement-floor/api-client';
import {kindeConfig, nodeCredentials, type NodeName} from './config.js';

/** Mint a Kinde M2M access token from a node's own client credentials. */
async function mintToken(node: NodeName): Promise<string> {
  const {domain, audience} = kindeConfig();
  const {clientId, clientSecret} = nodeCredentials(node);
  const res = await fetch(`https://${domain}/oauth2/token`, {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience
    })
  });
  const data = (await res.json()) as {access_token?: string};
  if (!res.ok || !data.access_token) {
    throw new Error(`token mint failed for ${node}: ${res.status}`);
  }
  return data.access_token;
}

/** The `sub` (or `azp`) claim of a JWT, without verifying it. */
function subjectOf(token: string): string {
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')
  ) as {sub?: string; azp?: string};
  return payload.sub ?? payload.azp ?? 'unknown';
}

export interface NodeSession {
  client: FloorClient;
  subject: string;
}

/**
 * Build a node's FloorClient. The node mints its OWN token; the run delegation is
 * shared (it only carries the runId). Returns the client plus the token's subject
 * so the graph can prove three distinct identities acted in the run.
 */
export async function openSession(
  node: NodeName,
  delegation: string,
  baseUrl: string
): Promise<NodeSession> {
  const agentToken = await mintToken(node);
  return {
    client: createFloorClient({agentToken, delegation, baseUrl}),
    subject: subjectOf(agentToken)
  };
}
