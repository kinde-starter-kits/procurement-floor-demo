/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents from "../agents.js";
import type * as audit from "../audit.js";
import type * as authz from "../authz.js";
import type * as delegations from "../delegations.js";
import type * as events from "../events.js";
import type * as hop from "../hop.js";
import type * as http from "../http.js";
import type * as negotiationRounds from "../negotiationRounds.js";
import type * as orders from "../orders.js";
import type * as quotes from "../quotes.js";
import type * as runs from "../runs.js";
import type * as suppliers from "../suppliers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  audit: typeof audit;
  authz: typeof authz;
  delegations: typeof delegations;
  events: typeof events;
  hop: typeof hop;
  http: typeof http;
  negotiationRounds: typeof negotiationRounds;
  orders: typeof orders;
  quotes: typeof quotes;
  runs: typeof runs;
  suppliers: typeof suppliers;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agentAuth: import("@kinde-oss/kinde-convex-agent-auth/_generated/component.js").ComponentApi<"agentAuth">;
};
