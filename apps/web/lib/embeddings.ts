import {pipeline, type FeatureExtractionPipeline} from '@xenova/transformers';

// Transformers.js sentence embeddings. ONNX runs in the Node app layer only —
// never inside Convex functions.
const MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIM = 384;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  extractorPromise ??= pipeline('feature-extraction', MODEL);
  return extractorPromise;
}

/** Embed a single string into a normalized 384-d vector (cosine-ready). */
export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, {pooling: 'mean', normalize: true});
  return Array.from(output.data as Float32Array);
}
