import {defineConfig, configDefaults} from 'vitest/config';

// Default suite: fast, CI-safe (edge-runtime, convex-test). Integration tests
// that need local Qdrant + ONNX are excluded here and run via
// vitest.integration.config.ts.
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    server: {deps: {inline: ['convex-test']}},
    reporters: ['verbose'],
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts']
  }
});
