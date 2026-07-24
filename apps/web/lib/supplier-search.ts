import {qdrantClient, SUPPLIERS_COLLECTION, type SupplierPayload} from './qdrant';

export interface SupplierMatch extends SupplierPayload {
  score: number;
}

/**
 * Semantic supplier search scoped to a single org.
 *
 * The org filter is ALWAYS applied and its value comes from the caller (the
 * verified token's org_code) — never from user input. A caller can only ever
 * see its own org's suppliers because it never gets to name the org.
 */
export async function searchSuppliers(
  orgCode: string,
  vector: number[],
  opts: {limit?: number; collection?: string} = {}
): Promise<SupplierMatch[]> {
  const client = qdrantClient();
  const results = await client.search(opts.collection ?? SUPPLIERS_COLLECTION, {
    vector,
    limit: opts.limit ?? 5,
    filter: {must: [{key: 'orgCode', match: {value: orgCode}}]},
    with_payload: true
  });
  return results.map((r) => ({...(r.payload as SupplierPayload), score: r.score}));
}
