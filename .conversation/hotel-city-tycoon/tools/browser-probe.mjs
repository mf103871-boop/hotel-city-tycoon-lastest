import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const probeShotsDir = path.join(projectRoot, 'docs', 'probe-shots');
const channel = process.env.PROBE_CHANNEL || '';
const headed = process.env.PROBE_HEADED === '1';
const gpuOff = process.env.PROBE_GPU_OFF === '1';
const url = process.env.PROBE_URL || 'about:blank';
const isAppProof = /^https?:\/\/127\.0\.0\.1:5000(?:\/|$)/.test(url);
const combination = [
  channel || 'headless-shell',
  headed ? 'headed' : 'headless',
  gpuOff ? 'gpu-off' : 'gpu-default',
].join('-');
const screenshotPath = isAppProof
  ? path.join(probeShotsDir, 'proof-app.png')
  : path.join(probeShotsDir, `${combination}.png`);

const args = ['--disable-dev-shm-usage'];
if (gpuOff) args.push('--disable-gpu');

const launchOptions = {
  args,
  headless: !headed,
  ...(channel ? { channel } : {}),
};

let browser;
let context;
let page;
let failed = false;

function describeError(error) {
  return error?.stack || String(error);
}

function ok(stage, detail = '') {
  console.log(`[probe] ${stage}: OK${detail ? ` — ${detail}` : ''}`);
}

function error(stage, value) {
  failed = true;
  console.error(`[probe] ${stage}: ERROR`);
  console.error(describeError(value));
}

function skipped(stage, reason) {
  failed = true;
  console.error(`[probe] ${stage}: SKIP — ${reason}`);
}

console.log(`[probe] combination: ${combination}`);
console.log(`[probe] url: ${url}`);
console.log(`[probe] launch options: ${JSON.stringify(launchOptions)}`);

try {
  try {
    browser = await chromium.launch(launchOptions);
    ok('launch');
  } catch (value) {
    error('launch', value);
  }

  if (browser) {
    try {
      context = await browser.newContext();
      ok('context');
    } catch (value) {
      error('context', value);
    }
  } else {
    skipped('context', 'launch failed');
  }

  if (context) {
    try {
      page = await context.newPage();
      ok('page');
    } catch (value) {
      error('page', value);
    }
  } else {
    skipped('page', 'context failed');
  }

  if (page) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
      ok('goto', url);
    } catch (value) {
      error('goto', value);
    }
  } else {
    skipped('goto', 'page failed');
  }

  if (page) {
    try {
      await mkdir(probeShotsDir, { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true });
      ok('screenshot', path.relative(projectRoot, screenshotPath));
    } catch (value) {
      error('screenshot', value);
    }
  } else {
    skipped('screenshot', 'page failed');
  }
} finally {
  if (context) {
    try {
      await context.close();
      ok('context.close');
    } catch (value) {
      error('context.close', value);
    }
  } else {
    skipped('context.close', 'context was not created');
  }

  if (browser) {
    try {
      await browser.close();
      ok('browser.close');
    } catch (value) {
      error('browser.close', value);
    }
  } else {
    skipped('browser.close', 'browser was not launched');
  }
}

process.exitCode = failed ? 1 : 0;