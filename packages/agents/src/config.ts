// Per-node identity configuration, read from the environment. Each node has its
// OWN Kinde M2M client credentials — no node reuses another's, no ambient creds.

export type NodeName = 'sourcing' | 'negotiation' | 'ordering';

export interface NodeCredentials {
  clientId: string;
  clientSecret: string;
}

export interface KindeConfig {
  domain: string;
  audience: string;
}

function req(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function kindeConfig(): KindeConfig {
  return {domain: req('KINDE_DOMAIN'), audience: req('KINDE_AUDIENCE')};
}

const ENV_PREFIX: Record<NodeName, string> = {
  sourcing: 'SOURCING',
  negotiation: 'NEGOTIATION',
  ordering: 'ORDERING'
};

export function nodeCredentials(node: NodeName): NodeCredentials {
  const prefix = ENV_PREFIX[node];
  return {
    clientId: req(`${prefix}_CLIENT_ID`),
    clientSecret: req(`${prefix}_CLIENT_SECRET`)
  };
}
