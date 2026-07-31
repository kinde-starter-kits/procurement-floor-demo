import {v} from 'convex/values';
import {internalMutation, internalQuery} from './_generated/server';

const supplierInput = v.object({
  name: v.string(),
  capabilities: v.string(),
  region: v.string(),
  certifications: v.array(v.string())
});

/**
 * Seed entry point (dev/demo). Upserts the organization row and REPLACES all
 * suppliers for one org, returning the new ids so the seed script can mirror the
 * exact same rows into Qdrant in the same run, so the two stores cannot drift.
 *
 * INTERNAL. This wipes and rewrites an org's suppliers, so it is never exposed on
 * the public API. The seed script runs it through `npx convex run`, which
 * authenticates as the deployment admin.
 */
export const seedReplaceOrg = internalMutation({
  args: {
    orgCode: v.string(),
    orgName: v.string(),
    suppliers: v.array(supplierInput)
  },
  handler: async (ctx, {orgCode, orgName, suppliers}) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_org', (q) => q.eq('orgCode', orgCode))
      .unique();
    if (org) {
      await ctx.db.patch(org._id, {name: orgName});
    } else {
      await ctx.db.insert('organizations', {orgCode, name: orgName});
    }

    const existing = await ctx.db
      .query('suppliers')
      .withIndex('by_org', (q) => q.eq('orgCode', orgCode))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    const inserted: Array<{name: string; supplierId: string}> = [];
    for (const s of suppliers) {
      const supplierId = await ctx.db.insert('suppliers', {orgCode, ...s});
      inserted.push({name: s.name, supplierId});
    }
    return inserted;
  }
});

/** Suppliers for one org. INTERNAL — only the seed script reads it, to confirm
 *  Convex and Qdrant agree. */
export const listByOrg = internalQuery({
  args: {orgCode: v.string()},
  handler: async (ctx, {orgCode}) =>
    ctx.db
      .query('suppliers')
      .withIndex('by_org', (q) => q.eq('orgCode', orgCode))
      .collect()
});
