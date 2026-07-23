import {defineSchema, defineTable} from 'convex/server';
import {v} from 'convex/values';

/**
 * Every table carries `orgCode` and is indexed by it (`by_org`). The tenancy
 * invariant is: no table is queryable without an org filter, so every index on
 * every table leads with `orgCode` — including the run-scoped indexes.
 *
 * Money is integer cents everywhere, stored as `v.int64()` (BigInt) so no float
 * can ever creep in. Ordinal counts (round, hop, seq) and timestamps (ms) are
 * plain numbers. Nothing writes yet — queries and mutations land in later phases.
 */
export default defineSchema({
  organizations: defineTable({
    orgCode: v.string(),
    name: v.string()
  }).index('by_org', ['orgCode']),

  suppliers: defineTable({
    orgCode: v.string(),
    name: v.string(),
    capabilities: v.string(),
    region: v.string(),
    certifications: v.array(v.string())
  }).index('by_org', ['orgCode']),

  requisitions: defineTable({
    orgCode: v.string(),
    title: v.string(),
    description: v.string(),
    budgetCents: v.int64(),
    requestedBySubject: v.string(),
    status: v.string()
  }).index('by_org', ['orgCode']),

  quotes: defineTable({
    orgCode: v.string(),
    requisitionId: v.id('requisitions'),
    supplierId: v.id('suppliers'),
    amountCents: v.int64(),
    terms: v.string(),
    round: v.number(),
    status: v.string()
  })
    .index('by_org', ['orgCode'])
    .index('by_org_requisition', ['orgCode', 'requisitionId']),

  negotiationRounds: defineTable({
    orgCode: v.string(),
    requisitionId: v.id('requisitions'),
    round: v.number(),
    summary: v.string(),
    startedAt: v.number()
  })
    .index('by_org', ['orgCode'])
    .index('by_org_requisition', ['orgCode', 'requisitionId']),

  orders: defineTable({
    orgCode: v.string(),
    requisitionId: v.id('requisitions'),
    quoteId: v.id('quotes'),
    amountCents: v.int64(),
    placedBySubject: v.string(),
    placedByAgent: v.string(),
    status: v.string(),
    correlationId: v.string()
  })
    .index('by_org', ['orgCode'])
    .index('by_org_requisition', ['orgCode', 'requisitionId']),

  delegations: defineTable({
    orgCode: v.string(),
    runId: v.string(),
    hop: v.number(),
    parentDelegationId: v.optional(v.id('delegations')),
    subject: v.string(),
    scopes: v.array(v.string()),
    issuedAt: v.number()
  })
    .index('by_org', ['orgCode'])
    .index('by_run_hop', ['orgCode', 'runId', 'hop']),

  runEvents: defineTable({
    orgCode: v.string(),
    runId: v.string(),
    seq: v.number(),
    kind: v.string(),
    payload: v.any(),
    at: v.number()
  })
    .index('by_org', ['orgCode'])
    .index('by_run_seq', ['orgCode', 'runId', 'seq'])
});
