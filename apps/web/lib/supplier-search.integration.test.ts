import {randomUUID} from 'node:crypto';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {QdrantClient} from '@qdrant/js-client-rest';
import {embed} from './embeddings';
import {ensureSuppliersCollection} from './qdrant';
import {searchSuppliers} from './supplier-search';

// Runs against a BARE local Qdrant (default localhost:6333). The test creates
// its own fresh collection, seeds two orgs, asserts semantic + isolation
// behaviour, and tears the collection down.
// Default to a bare local Qdrant; keep it in the env so searchSuppliers (which
// builds its client from QDRANT_URL) targets the same instance.
process.env.QDRANT_URL ??= 'http://localhost:6333';
const QDRANT_URL = process.env.QDRANT_URL;
const COLLECTION = `suppliers_it_${randomUUID().slice(0, 8)}`;

const ORG_X = 'org_alpha_test';
const ORG_Y = 'org_beta_test';

// Cold-chain vendor copy that deliberately avoids the query's keywords.
const COLD_CHAIN_TEXT =
  'Refrigerated and reefer trucking with pharmaceutical-grade cold-chain handling, continuous thermal monitoring, and last-mile reefer delivery for perishable and biologic cargo.';

interface Sup {
  orgCode: string;
  name: string;
  capabilities: string;
  region: string;
  certifications: string[];
}

const SUPPLIERS: Sup[] = [
  {orgCode: ORG_X, name: 'Polar Route Freight Systems', capabilities: COLD_CHAIN_TEXT, region: 'US-Midwest', certifications: ['GDP', 'FSMA']},
  {orgCode: ORG_X, name: 'Ironclad Structural Fabrication', capabilities: 'Heavy structural steel fabrication, plate girder welding, and CNC plasma cutting.', region: 'US-Midwest', certifications: ['AWS D1.1']},
  {orgCode: ORG_X, name: 'Redwood IT Infrastructure', capabilities: 'Enterprise servers, network switching, and data-center structured cabling.', region: 'US-West', certifications: ['ISO 27001']},
  // Org Y holds a near-identical cold-chain vendor: it is the strong GLOBAL match
  // for the query, so if it ever appears in an Org X search the filter has failed.
  {orgCode: ORG_Y, name: 'Frostline Cold Chain', capabilities: COLD_CHAIN_TEXT, region: 'US-West', certifications: ['GDP', 'FSMA']},
  {orgCode: ORG_Y, name: 'Titan Metalworks', capabilities: 'Structural steel and plate fabrication with heavy weldments.', region: 'US-West', certifications: ['AWS D1.1']},
  {orgCode: ORG_Y, name: 'Nimbus Cloud & Hardware', capabilities: 'Rack servers, storage arrays, and network switching.', region: 'US-West', certifications: ['ISO 27001']}
];

// A plain-language requisition. None of these distinctive words appear in the
// cold-chain vendor copy, so a keyword filter could not reach the right vendor.
const QUERY =
  'We need a carrier to move vaccine shipments that must stay frozen between our regional warehouses.';
const KEYWORDS_ABSENT_FROM_MATCH = ['vaccine', 'frozen', 'warehouse', 'carrier'];

const client = new QdrantClient({
  url: QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY || undefined
});

beforeAll(async () => {
  await ensureSuppliersCollection(client, COLLECTION);
  const points = [];
  for (const s of SUPPLIERS) {
    points.push({
      id: randomUUID(),
      vector: await embed(s.capabilities),
      payload: {...s, supplierId: `conv_${s.name}`}
    });
  }
  await client.upsert(COLLECTION, {wait: true, points});
}, 180_000);

afterAll(async () => {
  await client.deleteCollection(COLLECTION).catch(() => {});
});

describe('supplier semantic search', () => {
  test('free-text requisition returns the right vendor a keyword filter would miss', async () => {
    const vector = await embed(QUERY);
    const results = await searchSuppliers(ORG_X, vector, {limit: 3, collection: COLLECTION});

    expect(results.length).toBeGreaterThan(0);
    // Semantic top hit is the cold-chain vendor, despite sharing no keywords.
    expect(results[0].name).toBe('Polar Route Freight Systems');
    expect(results[0].score).toBeGreaterThan(0);

    // Prove a keyword filter could not reach it: none of the query's distinctive
    // words appear in ANY Org X supplier's capability text.
    const orgXCorpus = SUPPLIERS.filter((s) => s.orgCode === ORG_X);
    for (const kw of KEYWORDS_ABSENT_FROM_MATCH) {
      const keywordHit = orgXCorpus.some((s) =>
        s.capabilities.toLowerCase().includes(kw)
      );
      expect(keywordHit, `keyword "${kw}" unexpectedly present`).toBe(false);
    }
  });

  test('cross-org isolation: an Org X search never returns an Org Y supplier', async () => {
    const vector = await embed(QUERY);

    // Org Y genuinely holds the strong global match — confirm it exists there.
    const yResults = await searchSuppliers(ORG_Y, vector, {limit: 3, collection: COLLECTION});
    expect(yResults[0].name).toBe('Frostline Cold Chain');

    // The Org X search must never surface Org Y's rows, even though Frostline is
    // an equally-good match globally. The filter is the only thing separating them.
    const xResults = await searchSuppliers(ORG_X, vector, {limit: 10, collection: COLLECTION});
    expect(xResults.length).toBeGreaterThan(0);
    expect(xResults.every((r) => r.orgCode === ORG_X)).toBe(true);
    expect(xResults.some((r) => r.name === 'Frostline Cold Chain')).toBe(false);
  });
});
