/**
 * @procurement-floor/api-client
 *
 * The ONLY channel an agent node uses to reach the app. It is dependency-free
 * (global fetch) and knows nothing about Convex, Qdrant, or the web app's
 * internals. Every call carries the node's own Kinde M2M token and the run
 * delegation; the server derives org and run from those verified credentials,
 * never from the request body.
 */

export interface CreateFloorClientOptions {
  /** The calling node's own Kinde M2M access token. */
  agentToken: string;
  /** The run delegation id (carries the runId, verified server-side). */
  delegation: string;
  /** Base URL of the app, e.g. http://localhost:3000. */
  baseUrl: string;
}

export interface SupplierMatch {
  supplierId: string;
  name: string;
  region: string;
  certifications: string[];
  capabilities: string;
  score: number;
}

export interface CreateQuoteInput {
  requisitionId: string;
  supplierId: string;
  amountCents: number;
  terms: string;
  round: number;
  status: string;
}

export interface NegotiationRoundInput {
  requisitionId: string;
  round: number;
  summary: string;
  startedAt: number;
}

export interface PlaceOrderInput {
  requisitionId: string;
  quoteId: string;
  amountCents: number;
  correlationId: string;
  /** The component instance to authorize against (attenuated mode). */
  instanceId?: string;
}

export type PlaceOrderResult =
  | {denied: false; orderId: string}
  | {denied: true; reason: string; requiredScopes: string[]; correlationId: string};

export interface BeginHopResult {
  hop: number;
  scopes: string[];
  /** The component instance id (attenuated ordering hop), else null. */
  instanceId: string | null;
}

export interface FloorClient {
  searchSuppliers(query: string, limit?: number): Promise<SupplierMatch[]>;
  createQuote(input: CreateQuoteInput): Promise<{quoteId: string}>;
  recordNegotiationRound(input: NegotiationRoundInput): Promise<void>;
  /** Submit an order. May be denied (attenuated mode) — a normal outcome. */
  placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult>;
  /** Mint this node's hop of the delegation chain at the start of its work. */
  beginHop(input: {
    step: 'sourcing' | 'negotiation' | 'ordering';
    amountCents?: number;
  }): Promise<BeginHopResult>;
  /** Append a runEvents row. org/run come from the verified credentials. */
  writeEvent(kind: string, payload: Record<string, unknown>): Promise<{seq: number}>;
}

export class FloorClientError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly detail: unknown
  ) {
    super(`floor_client_error ${status} ${path}`);
    this.name = 'FloorClientError';
  }
}

function required(value: string, name: keyof CreateFloorClientOptions): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`createFloorClient: "${name}" is required`);
  }
  return value;
}

export function createFloorClient(opts: CreateFloorClientOptions): FloorClient {
  const agentToken = required(opts.agentToken, 'agentToken');
  const delegation = required(opts.delegation, 'delegation');
  const baseUrl = required(opts.baseUrl, 'baseUrl').replace(/\/$/, '');

  async function post<T>(path: string, body: unknown): Promise<T> {
    // Retry transient network failures (a dropped connection throws
    // `TypeError: fetch failed`). A non-OK HTTP response is a real answer and is
    // not retried — it surfaces as a FloorClientError.
    let res: Response | undefined;
    let lastError: unknown;
    for (let i = 0; i < 4; i++) {
      try {
        res = await fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${agentToken}`,
            'x-floor-delegation': delegation
          },
          body: JSON.stringify(body)
        });
        break;
      } catch (err) {
        lastError = err;
        if (i < 3) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    if (!res) throw new FloorClientError(0, path, {error: 'network_error', cause: String(lastError)});
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new FloorClientError(res.status, path, data);
    }
    return data as T;
  }

  return {
    async searchSuppliers(query, limit = 5) {
      const {results} = await post<{results: SupplierMatch[]}>('/api/suppliers/search', {
        query,
        limit
      });
      return results;
    },
    createQuote(input) {
      return post<{quoteId: string}>('/api/quotes', input);
    },
    async recordNegotiationRound(input) {
      await post<unknown>('/api/negotiation-rounds', input);
    },
    placeOrder(input) {
      return post<PlaceOrderResult>('/api/orders', input);
    },
    beginHop(input) {
      return post<BeginHopResult>('/api/hop', input);
    },
    writeEvent(kind, payload) {
      return post<{seq: number}>('/api/events', {kind, payload});
    }
  };
}
