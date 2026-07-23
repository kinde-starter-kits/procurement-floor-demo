import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const nextConfig: NextConfig = {
  // This app lives in a workspace; pin the tracing root to the repo so Next
  // does not infer it from an unrelated lockfile elsewhere on the machine.
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url))
};

export default nextConfig;
