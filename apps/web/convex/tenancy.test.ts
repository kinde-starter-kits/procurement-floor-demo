/// <reference types="vite/client" />
import {convexTest} from 'convex-test';
import {describe, expect, test} from 'vitest';
import schema from './schema';
import type {DataModel} from './_generated/dataModel';
import type {GenericDatabaseWriter} from 'convex/server';
import type {Id} from './_generated/dataModel';

type Ctx = {db: GenericDatabaseWriter<DataModel>};

// In a workspace, node_modules is hoisted to the repo root, so convex-test
// cannot auto-locate the convex dir; hand it the module map explicitly. The
// glob must include the _generated files so it can find the modules root. These
// are only evaluated lazily when a named function is called (this test uses
// only `ctx.db`, so convex.config.ts is never imported).
const modules = import.meta.glob('./**/*.*s');

const ORG_A = 'org-a';
const ORG_B = 'org-b';

// Both orgs share a run id on purpose: it forces the run-scoped indexes
// (by_run_hop, by_run_seq) to prove they isolate on orgCode, not just runId.
const SHARED_RUN = 'run-shared';
const AT = 1_700_000_000_000;

// The seven tenant-scoped tables (everything except `organizations`, which is
// the tenant boundary itself).
const SCOPED_TABLES = [
  'suppliers',
  'requisitions',
  'quotes',
  'negotiationRounds',
  'orders',
  'delegations',
  'runEvents'
] as const;

// Seed a full procurement graph for one org across all seven scoped tables.
async function seedOrg(
  ctx: Ctx,
  orgCode: string
): Promise<{requisitionId: Id<'requisitions'>}> {
  await ctx.db.insert('organizations', {orgCode, name: `Org ${orgCode}`});

  const supplierId = await ctx.db.insert('suppliers', {
    orgCode,
    name: `${orgCode} supplier`,
    capabilities: 'welding, casting, assembly',
    region: 'us-east',
    certifications: ['ISO-9001', 'AS9100']
  });

  const requisitionId = await ctx.db.insert('requisitions', {
    orgCode,
    title: `${orgCode} requisition`,
    description: 'Need 500 widgets by Q3.',
    budgetCents: 500000n,
    requestedBySubject: `subject-${orgCode}`,
    status: 'open'
  });

  const quoteId = await ctx.db.insert('quotes', {
    orgCode,
    requisitionId,
    supplierId,
    amountCents: 480000n,
    terms: 'net-30',
    round: 1,
    status: 'submitted'
  });

  await ctx.db.insert('negotiationRounds', {
    orgCode,
    requisitionId,
    round: 1,
    summary: 'Opening round.',
    startedAt: AT
  });

  await ctx.db.insert('orders', {
    orgCode,
    requisitionId,
    quoteId,
    amountCents: 480000n,
    placedBySubject: `subject-${orgCode}`,
    placedByAgent: `agent-${orgCode}`,
    status: 'placed',
    correlationId: `corr-${orgCode}`
  });

  await ctx.db.insert('delegations', {
    orgCode,
    runId: SHARED_RUN,
    hop: 0,
    subject: `subject-${orgCode}`,
    scopes: ['requisitions:read', 'quotes:write'],
    issuedAt: AT
  });

  await ctx.db.insert('runEvents', {
    orgCode,
    runId: SHARED_RUN,
    seq: 0,
    kind: 'run.started',
    payload: {orgCode},
    at: AT
  });

  return {requisitionId};
}

describe('org tenancy isolation', () => {
  test('by_org reads never leak across orgs — all seven tenant-scoped tables', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx: Ctx) => {
      await seedOrg(ctx, ORG_A);
      await seedOrg(ctx, ORG_B);
    });

    for (const table of SCOPED_TABLES) {
      // Reads MUST go through the by_org index. If the index is missing this
      // throws; if the org filter is dropped, org B rows leak into `aRows` and
      // the assertions below fail.
      const aRows = await t.run((ctx: Ctx) =>
        ctx.db
          .query(table)
          .withIndex('by_org', (q) => q.eq('orgCode', ORG_A))
          .collect()
      );
      const bRows = await t.run((ctx: Ctx) =>
        ctx.db
          .query(table)
          .withIndex('by_org', (q) => q.eq('orgCode', ORG_B))
          .collect()
      );
      const all = await t.run((ctx: Ctx) => ctx.db.query(table).collect());

      // Isolation is only meaningful if both orgs actually hold rows here.
      expect(aRows.length, `${table}: org A rows`).toBeGreaterThan(0);
      expect(bRows.length, `${table}: org B rows`).toBeGreaterThan(0);
      expect(all.length, `${table}: total`).toBe(aRows.length + bRows.length);

      // Org A's filtered read contains only org A rows, none of org B's.
      expect(
        aRows.every((r) => r.orgCode === ORG_A),
        `${table}: org A read leaked a non-A row`
      ).toBe(true);
      expect(
        aRows.some((r) => r.orgCode === ORG_B),
        `${table}: org A read contained an org B row`
      ).toBe(false);
    }
  });

  test('composite indexes isolate on org — by_org_requisition, by_run_seq, by_run_hop', async () => {
    const t = convexTest(schema, modules);
    const {requisitionId: reqA} = await t.run((ctx: Ctx) => seedOrg(ctx, ORG_A));
    const {requisitionId: reqB} = await t.run((ctx: Ctx) => seedOrg(ctx, ORG_B));

    // by_org_requisition: org A + org B's requisition id must return nothing,
    // even though such a requisition exists (under org B).
    for (const table of ['quotes', 'negotiationRounds', 'orders'] as const) {
      const own = await t.run((ctx: Ctx) =>
        ctx.db
          .query(table)
          .withIndex('by_org_requisition', (q) =>
            q.eq('orgCode', ORG_A).eq('requisitionId', reqA)
          )
          .collect()
      );
      const crossTenant = await t.run((ctx: Ctx) =>
        ctx.db
          .query(table)
          .withIndex('by_org_requisition', (q) =>
            q.eq('orgCode', ORG_A).eq('requisitionId', reqB)
          )
          .collect()
      );
      expect(own.length, `${table}: org A own requisition`).toBeGreaterThan(0);
      expect(own.every((r) => r.orgCode === ORG_A)).toBe(true);
      expect(crossTenant, `${table}: org A must not see org B's requisition`).toHaveLength(0);
    }

    // by_run_seq / by_run_hop: both orgs share SHARED_RUN, so the org prefix is
    // the only thing keeping the reads apart.
    const eventsA = await t.run((ctx: Ctx) =>
      ctx.db
        .query('runEvents')
        .withIndex('by_run_seq', (q) => q.eq('orgCode', ORG_A).eq('runId', SHARED_RUN))
        .collect()
    );
    expect(eventsA.length).toBeGreaterThan(0);
    expect(eventsA.every((r) => r.orgCode === ORG_A)).toBe(true);

    const delegationsA = await t.run((ctx: Ctx) =>
      ctx.db
        .query('delegations')
        .withIndex('by_run_hop', (q) => q.eq('orgCode', ORG_A).eq('runId', SHARED_RUN))
        .collect()
    );
    expect(delegationsA.length).toBeGreaterThan(0);
    expect(delegationsA.every((r) => r.orgCode === ORG_A)).toBe(true);
  });
});
