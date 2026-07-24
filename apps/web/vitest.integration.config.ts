import {defineConfig} from 'vitest/config';

// Integration suite: Node runtime, hits a local Qdrant and runs ONNX embeddings.
// Not part of `npm test` (no Docker/model in CI). Run with `npm run test:integration`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.integration.test.ts'],
    reporters: ['verbose'],
    testTimeout: 180_000,
    hookTimeout: 180_000
  }
});
