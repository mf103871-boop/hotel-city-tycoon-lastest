/* global URL, fetch, indexedDB */

import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const ROOT = new URL('../', import.meta.url).pathname;
const BASE_URL = 'http://127.0.0.1:5173';
const OUTPUT_DIR = new URL('../docs/baseline-screens/', import.meta.url).pathname;
const SERVER_TIMEOUT_MS = 120_000;
const VIEWPORT = { width: 1280, height: 720 };

const shots = [
  {
    name: '01-main.png',
    viewport: VIEWPORT,
    step: async () => Promise.resolve(),
  },
  {
    name: '02-build.png',
    viewport: VIEWPORT,
    step: async (page) => {
      await page.getByRole('button', { name: /\+ build/i }).click();
      await page.getByRole('heading', { name: /build/i }).waitFor({ state: 'visible' });
    },
  },
  {
    name: '03-decor.png',
    viewport: VIEWPORT,
    step: async (page) => {
      await page.getByRole('button', { name: /^shop$/i }).click();
      await page.getByRole('heading', { name: /^shop$/i }).waitFor({ state: 'visible' });
    },
  },
  {
    name: '04-manage.png',
    viewport: VIEWPORT,
    step: async (page) => {
      await page.getByTestId('open-manage').click();
      await page.getByTestId('manage-tab-plot').waitFor({ state: 'visible' });
    },
  },
  {
    name: '05-phone.png',
    viewport: { width: 412, height: 915 },
    step: async () => Promise.resolve(),
  },
];

const failures = [];
let server;
let browser;

function errorMessage(error) {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

function recordFailure(name, reason) {
  failures.push({ name, reason });
  console.error(`[baseline] ${name}: ERROR\n${reason}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = errorMessage(error);
    }
    await wait(500);
  }
  throw new Error(`server was not ready within ${SERVER_TIMEOUT_MS}ms: ${lastError}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (server.exitCode === null) server.kill('SIGKILL');
      resolve();
    }, 5_000);
    server.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    server.kill('SIGTERM');
  });
}

async function bootPage(context) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    void indexedDB.deleteDatabase('hotel-city-tycoon');
  });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByRole('button', { name: /open hotel/i }).waitFor({
    state: 'visible',
    timeout: 20_000,
  });
  try {
    const collect = page.getByRole('button', { name: /^collect$|^اجمع/i }).first();
    await collect.waitFor({ state: 'visible', timeout: 3_000 });
    await collect.click();
    await page.locator('div.z-40').first().waitFor({ state: 'hidden', timeout: 5_000 });
  } catch {
    // The daily gift is optional during baseline capture.
  }
  return page;
}

async function captureShot(shot) {
  let context;
  try {
    context = await browser.newContext({ viewport: shot.viewport });
    const page = await bootPage(context);
    await shot.step(page);
    const path = new URL(`../docs/baseline-screens/${shot.name}`, import.meta.url).pathname;
    await page.screenshot({ path });
    console.log(`[baseline] ${shot.name}: OK`);
  } catch (error) {
    recordFailure(shot.name, errorMessage(error));
  } finally {
    await context?.close().catch((error) => {
      console.error(`[baseline] ${shot.name}: context cleanup ERROR\n${errorMessage(error)}`);
    });
  }
}

try {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  server = spawn('npm', ['run', 'dev'], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '5173',
      VITE_E2E: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  server.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
  server.once('error', (error) => console.error(`[server] ERROR\n${errorMessage(error)}`));

  await waitForServer();
  const channel = process.env.CHROMIUM_CHANNEL;
  browser = await chromium.launch(channel ? { channel } : {});

  for (const shot of shots) {
    await captureShot(shot);
  }
} catch (error) {
  const reason = errorMessage(error);
  console.error(`[baseline] fatal ERROR\n${reason}`);
  for (const shot of shots) {
    if (!failures.some((failure) => failure.name === shot.name)) {
      recordFailure(shot.name, reason);
    }
  }
} finally {
  await browser?.close().catch((error) => {
    console.error(`[baseline] browser cleanup ERROR\n${errorMessage(error)}`);
  });
  await stopServer();
}

if (failures.length > 0) {
  console.error(`[baseline] ${failures.length}/${shots.length} shots failed`);
  process.exitCode = 1;
} else {
  console.log(`[baseline] completed ${shots.length}/${shots.length} shots`);
}