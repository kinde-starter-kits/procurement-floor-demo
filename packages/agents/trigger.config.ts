import {defineConfig} from '@trigger.dev/sdk/v3';

// The project ref is not a secret (it identifies the Trigger.dev project, like a
// project id). The secret key lives in .env (gitignored).
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_xpfmpbeiknoduksuohtv',
  runtime: 'node',
  dirs: ['./src/trigger'],
  maxDuration: 300
});
