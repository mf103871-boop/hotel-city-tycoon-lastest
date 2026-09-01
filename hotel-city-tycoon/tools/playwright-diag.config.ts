import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './diag-spec',
  timeout: 45_000,
  use: {
    trace: 'off',
    screenshot: 'off',
    channel: 'chromium',
    launchOptions: {
      args: ['--disable-dev-shm-usage'],
    },
  },
});