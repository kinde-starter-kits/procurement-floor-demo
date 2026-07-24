import {task} from '@trigger.dev/sdk/v3';
import {buildGraph, type Requisition} from '../graph.js';

export interface ProcurementRunPayload {
  runId: string;
  delegation: string;
  baseUrl: string;
  requisition: Requisition;
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
    const result = await graph.invoke({
      requisition: payload.requisition,
      runId: payload.runId,
      delegation: payload.delegation,
      baseUrl: payload.baseUrl
    });

    return {
      runId: payload.runId,
      order: result.order,
      subjects: result.subjects // { sourcing, negotiation, ordering } — distinct
    };
  }
});
