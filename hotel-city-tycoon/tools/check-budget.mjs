#!/usr/bin/env node
/**
 * Performance budgets.
 *
 * The architecture document set numbers in P0 and nothing has checked them
 * since. A budget nobody enforces is a wish.
 *
 * Run after a build: node tools/check-budget.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BUDGETS = {
  // The architecture document committed to 350. This was quietly raised to
  // 400 at some point with no reason recorded, which is how a budget stops
  // being a budget. Back to what was agreed.
  jsGzipKB: 350,        // the app shell a phone downloads before anything moves
  cssGzipKB: 60,
  initialAssetsKB: 3072,  // room art, effects and ui — what loads at boot
  audioKB: 400,
  totalAssetsKB: 8192,
};

const line = '─'.repeat(62);
const errors = [];
const rows = [];

function dirSize(dir, filter = () => true) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) total += dirSize(full, filter);
    else if (filter(full)) total += stat.size;
  }
  return total;
}

function gzipSize(dir, ext) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { total += gzipSize(full, ext); continue; }
    if (!full.endsWith(ext)) continue;
    total += zlib.gzipSync(fs.readFileSync(full)).length;
  }
  return total;
}

function measure(label, bytes, limitKB) {
  const kb = bytes / 1024;
  const ok = kb <= limitKB;
  if (!ok) errors.push(`${label}: ${kb.toFixed(0)}KB exceeds the ${limitKB}KB budget`);
  rows.push([label, kb, limitKB, ok]);
}

const dist = 'dist';
const built = fs.existsSync(dist);

if (built) {
  measure('js (gzip)', gzipSize(path.join(dist, 'assets'), '.js'), BUDGETS.jsGzipKB);
  measure('css (gzip)', gzipSize(path.join(dist, 'assets'), '.css'), BUDGETS.cssGzipKB);
}

// Art and audio are measured from source: they are copied verbatim.
const assets = built ? path.join(dist, 'assets') : 'public/assets';
const roomsDir = path.join(assets, 'rooms');
const initial = dirSize(roomsDir, (f) => f.endsWith('_base.png'))
  + dirSize(path.join(assets, 'effects'))
  + dirSize(path.join(assets, 'ui'));
measure('initial art', initial, BUDGETS.initialAssetsKB);
measure('audio', dirSize(path.join(assets, 'audio')), BUDGETS.audioKB);
/*
 * Art and audio only.
 *
 * After a build this reads `dist/assets`, which holds the copied art AND the
 * JavaScript bundles, the stylesheet, and — by far the largest item — the
 * source maps. The 842KB entry chunk alone ships a 3.3MB map. So the check
 * reported 8433KB against an 8192KB budget and failed, while the art it was
 * meant to be guarding is 3804KB.
 *
 * Two of those three were already measured, gzipped, in their own budgets a
 * few lines above, so they were being counted twice — once compressed against
 * a real limit and once raw against this one. Source maps are a development
 * artefact no player downloads.
 *
 * The budget number is unchanged. What is fixed is that it now measures the
 * thing it names.
 */
const isCode = (f) => f.endsWith('.js') || f.endsWith('.css') || f.endsWith('.map');
measure('art and audio', dirSize(assets, (f) => !isCode(f)), BUDGETS.totalAssetsKB);

// ---- did the build actually ship the art? -------------------------------
//
// A .gitignore rule left over from when public/assets held build output meant
// every deployment through git silently shipped without the art. The rooms
// survived by accident and the walk sheets did not, which looked for two
// verification rounds like a rendering bug.
if (built) {
  const manifestPath = path.join(dist, 'assets', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    errors.push('dist/assets/manifest.json is missing — the build shipped no art');
  } else {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const absent = manifest.entries.filter(
      (e) => !fs.existsSync(path.join(dist, 'assets', e.file)),
    );
    if (absent.length > 0) {
      errors.push(
        `${absent.length} of ${manifest.entries.length} declared assets are not in dist/ ` +
        `(first: ${absent.slice(0, 3).map((e) => e.file).join(', ')})`,
      );
    }
    rows.push(['assets shipped', manifest.entries.length - absent.length, manifest.entries.length,
      absent.length === 0]);
  }
}

console.log(line);
console.log('  Hotel City Tycoon — performance budgets');
console.log(line);
if (!built) {
  console.log('  ! dist/ not found — run `npm run build` to check the JS budget');
}
for (const [label, value, limit, ok] of rows) {
  const unit = label === 'assets shipped' ? '' : 'KB';
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(14)} ${value.toFixed(0).padStart(6)}${unit} / ${String(limit).padStart(5)}${unit}`);
}
console.log(line);
if (errors.length === 0) {
  console.log('  every budget met');
} else {
  for (const e of errors) console.log(`  ✗ ${e}`);
}
console.log(line);
process.exit(errors.length ? 1 : 0);
