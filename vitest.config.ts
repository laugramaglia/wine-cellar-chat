import { defineConfig } from 'vitest/config';

// The unit suite exercises the storage contract and the engine as plain modules, with
// no Workers runtime in the way. The end-to-end suite is scripts/smoke.ts, which drives
// the real MCP protocol over HTTP against wrangler dev and against production.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
