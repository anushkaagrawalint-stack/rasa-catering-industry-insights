import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

// Runs against an isolated local stack: embedded PGlite DB + local blob folder under .data/e2e (wiped first).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${PORT}`, ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
  webServer: {
    command: process.env.E2E_PROD ? `npx next build && npx next start -p ${PORT}` : `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      PGLITE_DIR: '.data/e2e/pglite',
      LOCAL_BLOB_DIR: '.data/e2e/blob',
      DATABASE_URL: '',
      BLOB_READ_WRITE_TOKEN: '',
      APP_USERS: JSON.stringify([
        { email: 'admin@e2e.test', password: 'e2e-admin-password', role: 'admin' },
        { email: 'viewer@e2e.test', password: 'e2e-viewer-password', role: 'viewer' },
      ]),
      SESSION_SECRET: 'e2e-session-secret-0123456789abcdef0123456789',
    },
  },
});
