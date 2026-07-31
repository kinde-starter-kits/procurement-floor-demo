import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {embed} from '../lib/embeddings';
import {
  ensureSuppliersCollection,
  qdrantClient,
  SUPPLIERS_COLLECTION,
  type SupplierPayload
} from '../lib/qdrant';
import {SEED_ORGS} from './supplier-data';

// Load apps/web/.env.local (NEXT_PUBLIC_CONVEX_URL, QDRANT_URL, QDRANT_API_KEY).
process.loadEnvFile(fileURLToPath(new URL('../.env.local', import.meta.url)));

// apps/web dir — the Convex CLI runs from here (it reads CONVEX_DEPLOYMENT).
const WEB_DIR = fileURLToPath(new URL('..', import.meta.url));

/**
 * Run an internal Convex function through the CLI. The seed functions are
 * internal, so they are not on the public API; `convex run` authenticates as the
 * deployment admin. Returns the parsed JSON result.
 */
function convexRun<T>(fn: string, args: unknown): T {
  const out = execFileSync('npx', ['convex', 'run', fn, JSON.stringify(args)], {
    cwd: WEB_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit']
  });
  return JSON.parse(out.trim()) as T;
}

async function main() {
  const qdrant = qdrantClient();

  await ensureSuppliersCollection(qdrant);

  for (const org of SEED_ORGS) {
    // 1. Write suppliers to Convex (source of record) and get their ids back.
    const inserted = convexRun<Array<{name: string; supplierId: string}>>(
      'suppliers:seedReplaceOrg',
      {orgCode: org.orgCode, orgName: org.orgName, suppliers: org.suppliers}
    );
    const idByName = new Map(inserted.map((r) => [r.name, r.supplierId]));

    // 2. Clear this org's points in Qdrant, then upsert the exact same rows so
    //    the two stores stay in lockstep.
    await qdrant.delete(SUPPLIERS_COLLECTION, {
      wait: true,
      filter: {must: [{key: 'orgCode', match: {value: org.orgCode}}]}
    });

    const points = [];
    for (const s of org.suppliers) {
      const supplierId = idByName.get(s.name);
      if (!supplierId) throw new Error(`missing convex id for ${s.name}`);
      const vector = await embed(s.capabilities);
      const payload: SupplierPayload = {
        orgCode: org.orgCode,
        supplierId,
        name: s.name,
        region: s.region,
        certifications: s.certifications,
        capabilities: s.capabilities
      };
      points.push({id: randomUUID(), vector, payload});
    }
    await qdrant.upsert(SUPPLIERS_COLLECTION, {wait: true, points});

    console.log(
      `Seeded ${org.orgName} (${org.orgCode}): ${org.suppliers.length} suppliers -> Convex + Qdrant`
    );
  }

  // Report the totals from each store so agreement is visible.
  const collection = await qdrant.getCollection(SUPPLIERS_COLLECTION);
  console.log(`Qdrant "${SUPPLIERS_COLLECTION}" points: ${collection.points_count}`);
  for (const org of SEED_ORGS) {
    const rows = convexRun<unknown[]>('suppliers:listByOrg', {orgCode: org.orgCode});
    console.log(`Convex suppliers for ${org.orgCode}: ${rows.length}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
