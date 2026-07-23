/**
 * @procurement-floor/api-client
 *
 * A thin, dependency-free client for the procurement floor API. The factory
 * takes every credential explicitly: there are no defaults, no environment
 * variable fallbacks, and no module-level token. Callers must supply the agent
 * token, the delegation grant, and the base URL on every construction.
 *
 * Methods are stubs until the API surface lands in a later phase. Each throws
 * a `NotImplementedError` so accidental use fails loudly rather than silently
 * returning undefined.
 */

export interface CreateFloorClientOptions {
  /** Bearer token identifying the calling agent. */
  agentToken: string;
  /** Delegation grant authorizing the agent to act on a principal's behalf. */
  delegation: string;
  /** Absolute base URL of the procurement floor API. */
  baseUrl: string;
}

export class NotImplementedError extends Error {
  readonly code = 'not_implemented';
  constructor(method: string) {
    super(`not_implemented: ${method}`);
    this.name = 'NotImplementedError';
  }
}

export interface FloorClient {
  /** List purchase orders visible to the delegated principal. */
  listOrders(): Promise<never>;
  /** Fetch a single purchase order by id. */
  getOrder(orderId: string): Promise<never>;
  /** Submit a new purchase order for approval. */
  createOrder(input: unknown): Promise<never>;
}

function required(value: string, name: keyof CreateFloorClientOptions): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`createFloorClient: "${name}" is required`);
  }
  return value;
}

export function createFloorClient(opts: CreateFloorClientOptions): FloorClient {
  // Validate up front — all three are mandatory, no defaults, no env fallback.
  const agentToken = required(opts.agentToken, 'agentToken');
  const delegation = required(opts.delegation, 'delegation');
  const baseUrl = required(opts.baseUrl, 'baseUrl');

  // Held in closure only; never assigned to module scope.
  void agentToken;
  void delegation;
  void baseUrl;

  return {
    async listOrders() {
      throw new NotImplementedError('listOrders');
    },
    async getOrder(_orderId: string) {
      throw new NotImplementedError('getOrder');
    },
    async createOrder(_input: unknown) {
      throw new NotImplementedError('createOrder');
    }
  };
}
