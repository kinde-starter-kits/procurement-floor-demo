import {defineConfig} from 'vitest/config';

// convex-test runs Convex functions in an edge-runtime VM and must not be
// pre-bundled, so it is inlined.
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    server: {deps: {inline: ['convex-test']}},
    // Print individual test names on every run (including CI).
    reporters: ['verbose']
  }
});
