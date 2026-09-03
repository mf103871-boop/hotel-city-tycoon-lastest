/**
 * The build must not ship the test handle.
 *
 * It was gated on `?e2e=1` — a query parameter anyone could type, in a bundle
 * that carried the code regardless. It is now gated on a build-time flag, so
 * a production build should contain no trace of it. This proves that rather
 * than trusting it: a dead-code elimination that silently stops working is
 * exactly the kind of thing nobody notices until it is being exploited.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = 'dist';
// The third is the error boundary's test-only trip wire, gated the same way.
const FORBIDDEN = ['__hct', 'VITE_E2E', 'hct-force-error'];

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first');
  process.exit(1);
}

const hits = [];
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { walk(full); continue; }
    // Every text file, not a chosen few. A source map is neither .js nor
    // .html and is exactly where the test handle would survive minification.
    if (/\.(png|jpe?g|webp|avif|gif|svg|woff2?|ttf|mp3|ogg|wav|ico)$/i.test(name)) continue;
    let text;
    try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
    if (text.includes('\u0000')) continue;
    for (const needle of FORBIDDEN) {
      if (text.includes(needle)) hits.push(`${full}: contains "${needle}"`);
    }
  }
};
/*
 * Source maps do not ship.
 *
 * They are generated 'hidden' so an error tracker can still be fed from the
 * build output, and then removed here so nothing carrying the original source
 * reaches a player. Deleting them before the scan is also what makes the scan
 * meaningful — otherwise every run would report the whole codebase.
 */
const maps = [];
const collectMaps = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { collectMaps(full); continue; }
    if (name.endsWith('.map')) maps.push(full);
  }
};
collectMaps(DIST);
for (const m of maps) fs.rmSync(m);

walk(DIST);

const line = '─'.repeat(62);
console.log(line);
console.log('  Hotel City Tycoon — no test handles in the build');
console.log(line);
if (hits.length === 0) {
  console.log(`  ✓ ${maps.length} source map(s) removed from the build`);
  console.log('  ✓ the bundle carries no test handle');
  console.log(line);
} else {
  for (const h of hits) console.log(`  ✗ ${h}`);
  console.log(line);
  console.log(`  ${hits.length} leak(s) — the e2e handle reached a shipped build`);
  process.exit(1);
}
