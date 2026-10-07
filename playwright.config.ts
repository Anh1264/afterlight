import { defineConfig, devices } from '@playwright/test';

// E2E_BASE_URL: run against an already-deployed site (e.g. production) and start no server.
// Otherwise build the client and boot the real server on a dedicated port.
const remote = process.env.E2E_BASE_URL;
const port = Number(process.env.E2E_PORT ?? 3101);
const baseURL = remote ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'e2e/out/results',
  reporter: [['list'], ['html', { outputFolder: 'e2e/out/report', open: 'never' }]],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: remote ? undefined : {
    command: 'npm run build && npm start',
    url: `${baseURL}/health`,
    env: { PORT: String(port) },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
