import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.CANNON_E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Set `CANNON_CHROMIUM_PATH` when Chromium is already provisioned by the
 * environment (a sandbox or a prebuilt CI image) instead of by
 * `playwright install`.
 */
const executablePath = process.env.CANNON_CHROMIUM_PATH || undefined;

/**
 * E2E runs against a real production build with no provider keys, so the
 * simulated model drives deterministic tool calls. Everything else — routing,
 * auth, retrieval, tool execution, persistence — is the production path.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { executablePath },
      },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: `${BASE_URL}/signin`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NODE_ENV: 'production', CANNON_AUTH_SECRET: 'cannon-e2e-secret' },
  },
});
