import { defineConfig, devices } from '@playwright/test';

const PORT = 3300;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, locale: 'ar' },
  webServer: { command: `npx next start -p ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 60_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
