import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 5000);

/*
 * One launchOptions object, built from every guard that contributes to it.
 *
 * Each guard used to spread its own `launchOptions`, and a later spread
 * replaced the earlier one wholesale: setting PLAYWRIGHT_EXTRA_ARGS together
 * with PLAYWRIGHT_CHROMIUM_PATH dropped the executable path and Playwright
 * went looking for a browser it had never downloaded.
 */
const extraArgs = process.env.PLAYWRIGHT_EXTRA_ARGS?.split(' ').filter(Boolean) ?? [];
const args = [
  ...(process.env.PLAYWRIGHT_DISABLE_DEV_SHM === '1' || extraArgs.length > 0 ? ['--disable-dev-shm-usage'] : []),
  ...extraArgs,
];
const launchOptions = {
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
  ...(args.length > 0 ? { args } : {}),
};

/**
 * Two projects on purpose.
 *
 * Desktop Chromium catches wiring; a phone profile catches the things that
 * only break at 390px with touch input — which is the only viewport this game
 * is actually designed for.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PLAYWRIGHT_NO_CAPTURE === '1'
      ? { trace: 'off', screenshot: 'off', video: 'off' }
      : {}),
    ...(Object.keys(launchOptions).length > 0 ? { launchOptions } : {}),
    ...(process.env.PLAYWRIGHT_FULL_CHROMIUM === '1'
      ? { channel: 'chromium' }
      : {}),
    ...(process.env.PLAYWRIGHT_HEADED === '1'
      ? { headless: false }
      : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    /*
     * Loopback, and the test handle switched on at build time.
     *
     * `npm run dev` used to pass a fixed `--host 0.0.0.0` on the command line,
     * which overrides vite.config and ignored the HOST set here — so the
     * server listened somewhere Playwright was not looking and the browser
     * never started. The flag is gone; HOST is honoured.
     */
    command: 'npm run dev',
    env: { HOST: '127.0.0.1', PORT: String(PORT), VITE_E2E: '1' },
    url: `http://127.0.0.1:${PORT}`,
    // Never reuse: a server already running without VITE_E2E has no test
    // handle, and every assertion that reads state would fail for a reason
    // that has nothing to do with the game. (This said `true` under the same
    // comment for a while.)
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
