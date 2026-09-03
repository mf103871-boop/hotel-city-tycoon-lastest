/**
 * Stamp the service worker with this build's identity.
 *
 * The worker serves art cache-first under a cache named after `VERSION`, and
 * old caches are deleted only when a worker with a different VERSION
 * activates. `public/sw.js` carried a hand-written constant that nothing ever
 * changed, so a room PNG replaced under the same name — exactly what ART-1
 * and ART-2 deliver — would have stayed the old picture on every installed
 * PWA until somebody remembered to edit the file.
 *
 * VERSION now names two things that change independently: the JavaScript
 * bundle (its hashed filename) and the art (a digest of every shipped asset
 * file). Either changing produces a new worker, new caches, and a clean
 * activate.
 *
 * Runs after `vite build`, before the budget and cheat checks. Fails the
 * build when the placeholder is not found exactly once.
 *
 * Run: node tools/stamp-sw.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIST = 'dist';
const WORKER = path.join(DIST, 'sw.js');
const PLACEHOLDER = /const VERSION = 'hct-dev';/g;
const ART_PLACEHOLDER = /const ART_VERSION = 'art-dev';/g;
const ART_DIRS = ['rooms', 'characters', 'decor', 'effects', 'ui', 'audio'];

function fail(message) {
  console.error(`  ✗ ${message}`);
  process.exit(1);
}

const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const bundle = /assets\/index-([A-Za-z0-9_-]+)\.js/.exec(html)?.[1];
if (!bundle) fail('dist/index.html names no hashed index bundle');

// Every art and audio file, in a fixed order, so the digest is reproducible.
const hash = crypto.createHash('sha256');
let files = 0;
for (const dir of ART_DIRS) {
  const root = path.join(DIST, 'assets', dir);
  if (!fs.existsSync(root)) continue;
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      hash.update(path.relative(DIST, full));
      hash.update(fs.readFileSync(full));
      files++;
    }
  };
  walk(root);
}
const manifest = path.join(DIST, 'assets', 'manifest.json');
if (fs.existsSync(manifest)) { hash.update('manifest.json'); hash.update(fs.readFileSync(manifest)); }
if (files === 0) fail('no art or audio found under dist/assets — nothing to version');
const art = hash.digest('hex').slice(0, 8);

const version = `hct-${bundle}`;
const artVersion = `art-${art}`;
const source = fs.readFileSync(WORKER, 'utf8');
for (const [pattern, name] of [[PLACEHOLDER, 'VERSION'], [ART_PLACEHOLDER, 'ART_VERSION']]) {
  const matches = source.match(pattern)?.length ?? 0;
  if (matches !== 1) fail(`expected the ${name} placeholder exactly once in ${WORKER}, found ${matches}`);
}
fs.writeFileSync(WORKER, source
  .replace(PLACEHOLDER, `const VERSION = '${version}';`)
  .replace(ART_PLACEHOLDER, `const ART_VERSION = '${artVersion}';`));

console.log('  Hotel City Tycoon — service worker stamp');
console.log(`  ✓ ${WORKER}: VERSION = ${version}, ART_VERSION = ${artVersion} (${files} asset files digested)`);
