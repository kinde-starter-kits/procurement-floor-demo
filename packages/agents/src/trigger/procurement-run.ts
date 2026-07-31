import {task} from '@trigger.dev/sdk/v3';
import {buildGraph, type Requisition} from '../graph.js';
import type {ByokConfig} from '../negotiation-strategy.js';

export interface ProcurementRunPayload {
  runId: string;
  orgCode: string;
  delegation: string;
  baseUrl: string;
  requisition: Requisition;
  byok?: ByokConfig;
}

/**
 * Report a terminal failure back to the app so the UI shows a clear error rather
 * than freezing at run.started. Authenticated by the run delegation only (no
 * Kinde token), so it works even when token minting is what failed. Best-effort:
 * a raw fetch, swallowing its own errors.
 */
async function reportFailure(payload: ProcurementRunPayload, reason: string): Promise<void> {
  try {
    await fetch(`${payload.baseUrl.replace(/\/$/, '')}/api/runs/fail`, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'x-floor-delegation': payload.delegation},
      body: JSON.stringify({orgCode: payload.orgCode, runId: payload.runId, reason})
    });
  } catch {
    // nothing more we can do from here
  }
}

/**
 * The whole agent graph runs inside this single Trigger.dev task. Negotiation
 * rounds are separate retryable steps (see graph.ts), which is why this is a task
 * and not a route handler.
 */
export const procurementRun = task({
  id: 'procurement-run',
  run: async (payload: ProcurementRunPayload) => {
    const graph = buildGraph();
    try {
      const result = await graph.invoke({
        requisition: payload.requisition,
        runId: payload.runId,
        delegation: payload.delegation,
        baseUrl: payload.baseUrl,
        byok: payload.byok
      });
      return {
        runId: payload.runId,
        order: result.order,
        subjects: result.subjects // { sourcing, negotiation, ordering } — distinct
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await reportFailure(payload, reason);
      throw err;
    }
  }
});
