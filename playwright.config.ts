import { defineConfig } from '@playwright/test';

const e2eDatabaseUrl = process.env.E2E_DATABASE_URL;
const e2eSessionSecret = process.env.E2E_SESSION_HMAC_SECRET;
const apiWebServer =
  e2eDatabaseUrl && e2eSessionSecret
    ? {
        command: 'npx --yes node@22.12.0 node_modules/tsx/dist/cli.mjs apps/api/src/server.ts',
        url: 'http://127.0.0.1:3000/health',
        reuseExistingServer: !process.env.CI,
        env: {
          DATABASE_URL: e2eDatabaseUrl,
          SESSION_HMAC_SECRET: e2eSessionSecret,
          NODE_ENV: 'development',
          API_HOST: '127.0.0.1',
          API_PORT: '3000',
          CORS_ORIGIN: 'http://127.0.0.1:4173',
        },
      }
    : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'chrome',
  },
  webServer: [
    ...(apiWebServer ? [apiWebServer] : []),
    {
      command:
        'npx --yes node@22.12.0 node_modules/vite/bin/vite.js apps/web --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
