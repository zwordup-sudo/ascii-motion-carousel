import { defineConfig, devices } from '@playwright/test';

const production = process.env.E2E_PREVIEW === '1';
const port = production ? 4173 : 5173;
const basePath = production ? '/ascii-motion-carousel/' : '/';
const url = `http://127.0.0.1:${port}${basePath}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: { baseURL: url, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 1000 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js ${production ? 'preview' : ''} --host 127.0.0.1 --port ${port} --strictPort`,
    url,
    reuseExistingServer: !process.env.CI,
  },
});
