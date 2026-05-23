import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
    ignoreHTTPSErrors: true,
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
