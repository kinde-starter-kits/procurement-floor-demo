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
  placedByAgent: string;
  status: string;
  correlationId: string;
}

export interface HandoffResult {
  hop: number;
  scopes: string[];
  added: string[];
}

export interface FloorClient {
  searchSuppliers(query: string, limit?: number): Promise<SupplierMatch[]>;
  createQuote(input: CreateQuoteInput): Promise<{quoteId: string}>;
  recordNegotiationRound(input: NegotiationRoundInput): Promise<void>;
  placeOrder(input: PlaceOrderInput): Promise<{orderId: string}>;
  /** Mint the next hop's delegation at a handoff. */
  handoff(input: {toStep: 'negotiation' | 'ordering'; amountCents?: number}): Promise<HandoffResult>;
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
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${agentToken}`,
        'x-floor-delegation': delegation
      },
      body: JSON.stringify(body)
    });
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
      return post<{orderId: string}>('/api/orders', input);
    },
    handoff(input) {
      return post<HandoffResult>('/api/handoff', input);
    },
    writeEvent(kind, payload) {
      return post<{seq: number}>('/api/events', {kind, payload});
    }
  };
}
