import {QdrantClient} from '@qdrant/js-client-rest';
import {EMBEDDING_DIM} from './embeddings';

// One collection for all orgs. `orgCode` is an indexed payload key and every
// query filters on it — never one collection per org.
export const SUPPLIERS_COLLECTION = 'suppliers';

/**
 * Build a Qdrant client from env. Moving between local Docker and Qdrant Cloud
 * is exactly these two values — QDRANT_URL and QDRANT_API_KEY — with no code
 * change. A bare local instance has no API key.
 */
export function qdrantClient(): QdrantClient {
  const url = process.env.QDRANT_URL;
  if (!url) throw new Error('QDRANT_URL is not set');
  return new QdrantClient({url, apiKey: process.env.QDRANT_API_KEY || undefined});
}

export interface SupplierPayload {
  orgCode: string;
  supplierId: string;
  name: string;
  region: string;
  certifications: string[];
  capabilities: string;
  [key: string]: unknown;
}

/**
 * Ensure the collection exists with the right vector params and an indexed
 * `orgCode` payload key. Idempotent.
 */
export async function ensureSuppliersCollection(
  client: QdrantClient,
  collection: string = SUPPLIERS_COLLECTION
): Promise<void> {
  const {collections} = await client.getCollections();
  if (!collections.some((c) => c.name === collection)) {
    await client.createCollection(collection, {
      vectors: {size: EMBEDDING_DIM, distance: 'Cosine'}
    });
  }
  // orgCode must be indexed so the mandatory org filter is efficient.
  await client
    .createPayloadIndex(collection, {field_name: 'orgCode', field_schema: 'keyword'})
    .catch(() => {
      /* index already exists */
    });
}
