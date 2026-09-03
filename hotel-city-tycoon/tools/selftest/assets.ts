/**
 * Headless tests for the asset pipeline.
 *
 * Pixi's loader needs a browser, so the tests here cover what does not: the
 * manifest's completeness and internal consistency, resolution selection, and
 * URL construction. Those are the parts that go wrong silently — a key nobody
 * generated a file for, or a @2x path that resolves to nothing on a phone.
 *
 * Run: node --experimental-strip-types tools/selftest/assets.ts
 */
import fs from 'node:fs';
import { loadSimData } from '../balance-sim/load-data.ts';

const manifest = JSON.parse(fs.readFileSync('public/assets/manifest.json', 'utf8'));
const data = loadSimData();

let passed = 0;
const failures: string[] = [];

/**
 * Awaits the check.
 *
 * The first version of this harness called `fn()` without awaiting. One check
 * was async, so its rejected promise floated off unhandled and the check
 * reported a pass having asserted nothing. Every check now returns a promise
 * and every call site awaits it.
 */
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

interface Entry { key: string; bundle: string; file: string; width: number; height: number; required: boolean }
const entries = manifest.entries as Entry[];

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — asset pipeline self-test');
console.log(line);

await check('every room declares art the manifest provides', () => {
  for (const room of data.rooms) {
    const key = `room.${room.id}.base`;
    assert(entries.some((e) => e.key === key), `no manifest entry for "${key}"`);
  }
});

await check('every decor item, staff role and guest type has art', () => {
  for (const item of data.decor) {
    assert(entries.some((e) => e.key === item.assetKey ||
      e.file === `decor/${item.id}.png`), `no manifest entry for decor "${item.id}"`);
  }
  for (const role of data.staffRoles) {
    assert(entries.some((e) => e.key === `staff.${role.id}.idle`), `no idle art for staff "${role.id}"`);
  }
  for (const guest of data.guestTypes) {
    assert(entries.some((e) => e.key === `guest.${guest.id}.idle`), `no idle art for guest "${guest.id}"`);
  }
});

await check('room art matches its block footprint exactly', () => {
  const { w: bw, h: bh } = manifest.blockSize;
  for (const room of data.rooms) {
    const entry = entries.find((e) => e.key === `room.${room.id}.base`);
    assert(entry, `no base art for "${room.id}"`);
    eq(entry.width, room.blocks.w * bw, `"${room.id}" art width does not match its footprint`);
    eq(entry.height, room.blocks.h * bh, `"${room.id}" art height does not match its footprint`);
  }
});

await check('block size agrees with the layout module', () => {
  // If these drift, every room sprite is subtly the wrong size.
  const layout = fs.readFileSync('src/render/layout.ts', 'utf8');
  const w = /BLOCK_W\s*=\s*(\d+)/.exec(layout)?.[1];
  const h = /BLOCK_H\s*=\s*(\d+)/.exec(layout)?.[1];
  eq(Number(w), manifest.blockSize.w, 'manifest block width disagrees with layout.ts');
  eq(Number(h), manifest.blockSize.h, 'manifest block height disagrees with layout.ts');
});

await check('every key is unique', () => {
  const seen = new Set<string>();
  for (const e of entries) {
    assert(!seen.has(e.key), `duplicate manifest key "${e.key}"`);
    seen.add(e.key);
  }
});

await check('every file path is unique', () => {
  const seen = new Set<string>();
  for (const e of entries) {
    assert(!seen.has(e.file), `two keys write to the same file "${e.file}"`);
    seen.add(e.file);
  }
});

await check('every entry belongs to a declared bundle', () => {
  const bundles = new Set(manifest.bundles as string[]);
  for (const e of entries) {
    assert(bundles.has(e.bundle), `entry "${e.key}" is in undeclared bundle "${e.bundle}"`);
  }
});

await check('every entry has positive dimensions', () => {
  for (const e of entries) {
    assert(e.width > 0 && e.height > 0, `entry "${e.key}" has no size`);
  }
});

await check('file paths are safe and predictable', () => {
  for (const e of entries) {
    assert(/^[a-z]+\/[a-zA-Z0-9_]+\.png$/.test(e.file), `unsafe or malformed path "${e.file}"`);
    assert(!e.file.includes('..'), `path traversal in "${e.file}"`);
  }
});

await check('the required set is small enough to launch with', () => {
  const required = entries.filter((e) => e.required);
  assert(required.length > 0, 'nothing is marked required');
  assert(required.length < entries.length * 0.4,
    `${required.length} of ${entries.length} marked required — the launch set should be a minority`);
  console.log(`      ${required.length} required of ${entries.length} total`);
});

await check('every required room is one the player meets early', () => {
  // A room whose art is required must be buildable; otherwise we are demanding
  // art for content nobody reaches.
  for (const e of entries.filter((x) => x.required && x.bundle === 'rooms')) {
    const id = e.key.split('.')[1]!;
    assert(data.rooms.some((r) => r.id === id), `required art for unknown room "${id}"`);
  }
});

await check('the required payload fits the 3MB initial budget', () => {
  // Rough estimate: PNG at roughly 0.6 bytes per pixel after compression.
  const bytes = entries.filter((e) => e.required)
    .reduce((n, e) => n + e.width * e.height * 0.6, 0);
  const mb = bytes / 1024 / 1024;
  assert(mb < 3, `estimated required payload is ${mb.toFixed(2)}MB, over the 3MB budget`);
  console.log(`      estimated required payload ~${mb.toFixed(2)}MB at @1x`);
});

// The tier rule from src/render/assets.ts, reimplemented against the same
// manifest it reads (the loader imports Pixi, which cannot load headlessly).
const tiers = [...(manifest.resolutions as number[])].sort((a, b) => a - b);
const pick = (dpr: number) => {
  let chosen = tiers[0] ?? 1;
  for (const t of tiers) if (dpr >= t) chosen = t;
  return chosen;
};
const tierPath = (tier: number, file: string) =>
  tier > 1 ? `public/assets/@${tier}x/${file}` : `public/assets/${file}`;

await check('every declared resolution tier has every file on disk', () => {
  // HC-P1-S2 / BL-016. The manifest declared [1, 2] while no @2x tree had ever
  // been drawn. The previous version of this suite asserted that a 2x screen
  // takes the 2x tier — it enshrined the bug. A tier is a promise; the promise
  // is checked here file by file, so the manifest can no longer send every
  // phone to 241 URLs that 404.
  assert(tiers.length > 0 && tiers[0] === 1, 'the 1x tier must always be declared first');
  for (const tier of tiers) {
    const absent = entries.filter((e) => !fs.existsSync(tierPath(tier, e.file)));
    assert(absent.length === 0,
      `tier @${tier}x is declared but ${absent.length} of ${entries.length} files are absent — ` +
      `first: ${absent.slice(0, 3).map((e) => e.file).join(', ')}`);
  }
  console.log(`      declared tiers ${JSON.stringify(tiers)}, all ${entries.length} files present at each`);
});

await check('a phone never resolves to a tier that is not shipped', () => {
  const highest = tiers[tiers.length - 1] ?? 1;
  eq(pick(1), 1, 'a 1x screen should take the 1x tier');
  eq(pick(0.75), 1, 'a sub-1x screen should still get something');
  eq(pick(2), highest, 'a 2x screen should take the highest tier actually shipped');
  eq(pick(3), highest, 'a 3x screen should cap at the highest tier actually shipped');
  assert(tiers.includes(pick(2)) && tiers.includes(pick(3)),
    'a device resolved to a tier the manifest does not declare');
});

await check('the loader falls back to 1x when a higher-tier file is absent', () => {
  // Belt to the manifest's braces: if a @2x tree is ever delivered in part,
  // the missing files must draw at 1x, not as placeholders. Structural check
  // on the source, since the loader cannot run headlessly.
  const loader = fs.readFileSync('src/render/assets.ts', 'utf8');
  assert(/urlFor\(entry,\s*1\)/.test(loader),
    'loadBundle never retries a failed entry at the 1x URL');
  assert(/if \(tier <= 1\) throw/.test(loader),
    'the fallback must only apply above 1x — a miss at 1x is a real miss');
});

await check('the art is served from a directory the bundler publishes', () => {
  // The art once lived in a sibling assets/ directory: present, validated, and
  // never served, because Vite only copies public/ into dist.
  assert(fs.existsSync('public/assets/manifest.json'),
    'manifest is not under public/ — the browser will 404 on every texture');
  const loader = fs.readFileSync('src/render/assets.ts', 'utf8');
  assert(loader.includes("public/assets/manifest.json"),
    'the loader imports a manifest from outside public/');
});

await check('something actually calls loadBundle', () => {
  // The loader was written, wired into RoomView, and never invoked. Every
  // texture lookup missed, every room fell back to a placeholder, and no
  // warning fired because nothing had tried to load anything.
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = `${dir}/${name}`;
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name) && full !== 'src/render/assets.ts' && full !== 'src/render/index.ts') {
        if (/loadBundle\s*\(/.test(fs.readFileSync(full, 'utf8'))) callers.push(full);
      }
    }
  };
  walk('src');
  assert(callers.length > 0,
    'loadBundle is defined but never called — the art would never reach the screen');
  console.log(`      loadBundle called from ${callers.join(', ')}`);
});

await check('walk sheets hold exactly the frames the renderer slices', () => {
  // The manifest once declared a walk sheet as 48 wide while its own note said
  // 288. The renderer slices six frames; if the file disagrees, characters
  // animate through empty space.
  const declared = entries.filter((e) => e.key.endsWith('.walk'));
  assert(declared.length > 0, 'no walk sheets are declared');

  const renderer = fs.readFileSync('src/render/characterView.ts', 'utf8');
  const frames = Number(/WALK_FRAMES\s*=\s*(\d+)/.exec(renderer)?.[1] ?? 0);
  const width = Number(/const CHAR_W\s*=\s*(\d+)/.exec(renderer)?.[1] ?? 0);
  assert(frames > 0 && width > 0, 'could not read the frame layout from the renderer');

  for (const entry of declared) {
    eq(entry.width, width * frames,
      `"${entry.key}" is declared ${entry.width}px wide but the renderer slices ${frames} frames of ${width}px`);
  }
  console.log(`      ${declared.length} sheets, ${frames} frames of ${width}x${declared[0]!.height}`);
});

await check('every walk sheet on disk matches its declared size', () => {
  for (const entry of entries.filter((e) => e.key.endsWith('.walk'))) {
    const path = `public/assets/${entry.file}`;
    if (!fs.existsSync(path)) continue;
    const buf = fs.readFileSync(path);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    eq(w, entry.width, `${entry.file} is ${w}px wide, declared ${entry.width}`);
    eq(h, entry.height, `${entry.file} is ${h}px tall, declared ${entry.height}`);
  }
});

await check('something animates the characters', () => {
  // Twenty sheets that nothing slices would be twenty dead files.
  const scene = fs.readFileSync('src/render/scene.ts', 'utf8');
  assert(/tickAnimation\s*\(/.test(scene), 'the scene never advances a walk cycle');
  const canvas = fs.readFileSync('src/ui/HotelCanvas.tsx', 'utf8');
  assert(/deltaMS/.test(canvas), 'the renderer never passes elapsed time to the scene');
});

await check('the six incident images are in the manifest with their keys', () => {
  const man = JSON.parse(fs.readFileSync('public/assets/manifest.json', 'utf8')) as {
    entries: Array<{ key: string; file: string }>;
  };
  const want = [
    ['event.pest.overlay', 'effects/pest.png'],
    ['event.fire.overlay', 'effects/fire.png'],
    ['event.inspection.icon', 'effects/inspection.png'],
    ['event.ghost.overlay', 'effects/ghost.png'],
    ['event.heatWave.icon', 'effects/heatWave.png'],
    ['event.coldSnap.icon', 'effects/coldSnap.png'],
  ] as const;
  for (const [key, path] of want) {
    const entry = man.entries.find((e) => e.key === key);
    assert(entry, `${key} is not in the manifest`);
    assert(entry.file.endsWith(path), `${key} points at ${entry.file}, expected ${path}`);
    assert(fs.existsSync(`public/assets/${entry.file}`), `${entry.file} is missing on disk`);
  }
});

await check('the incident art is drawn, not just shipped (5A)', () => {
  // Art that only sits in the manifest is a promise nobody kept. The room
  // view must reference the three overlay keys, and the phone sheet and the
  // climate banner must reference the icon files.
  const roomView = fs.readFileSync('src/render/roomView.ts', 'utf8');
  for (const key of ['event.pest.overlay', 'event.fire.overlay', 'event.ghost.overlay']) {
    assert(roomView.includes(key), `roomView does not draw ${key}`);
  }
  const phone = fs.readFileSync('src/ui/PhoneSheet.tsx', 'utf8');
  // Paths are relative to BASE_URL since the audit (D10), so no leading slash.
  assert(phone.includes('assets/effects/ghost.png'), 'the phone sheet does not show the ghost');
  assert(phone.includes('assets/effects/${view.climate.eventId}.png'.replace('${view.climate.eventId}', '')) || phone.includes('view.climate.eventId'),
    'the phone sheet does not show the active weather icon');
  const banner = fs.readFileSync('src/ui/ClimateBanner.tsx', 'utf8');
  assert(banner.includes('climate.eventId') && banner.includes('assets/effects/'),
    'the climate banner does not show the incident art');
});

await check('the decor art is drawn, not just shipped (HC-P1-S4)', () => {
  // The same rule the incident art is held to. Until S4 the decor sprites were
  // loaded into the bundle and never asked for: RoomView drew a labelled box
  // for every piece, so seventy-seven files shipped to every player and none
  // of them was ever put on screen.
  const roomView = fs.readFileSync('src/render/roomView.ts', 'utf8');
  assert(/texture\(piece\.assetKey\)/.test(roomView),
    'RoomView never asks for a decor piece’s texture');
  assert(/decorAnchorFor\(/.test(roomView),
    'RoomView pins every piece the same way instead of by category');
  assert(/orderDecor\(/.test(roomView),
    'RoomView does not use the footY draw order');

  // Characters and decor must shrink by the same factor, or a guest cannot sit
  // in a chair. Neither view is allowed its own literal.
  const layout = fs.readFileSync('src/render/layout.ts', 'utf8');
  assert(/export const ART_SCALE\b/.test(layout), 'ART_SCALE is not defined in layout');
  for (const file of ['src/render/roomView.ts', 'src/render/characterView.ts']) {
    const source = fs.readFileSync(file, 'utf8');
    assert(/ART_SCALE/.test(source), `${file} does not use the shared art scale`);
    assert(!/\*\s*0\.55\b/.test(source), `${file} still hard-codes a scale of its own`);
  }

  // The decor bundle has to be loaded for any of the above to resolve.
  const canvas = fs.readFileSync('src/ui/HotelCanvas.tsx', 'utf8');
  assert(/loadBundle\('decor'/.test(canvas), 'the decor bundle is never loaded');
  assert(/assetKey: p\.assetKey/.test(canvas), 'the decor asset key never reaches RoomView');
});

await check('placement and the manifest agree on how big a decor piece is', () => {
  // decorPlacement.ts (core) keeps its own copy of the slot-size table and the
  // block size, because core must not import the render layer or the manifest.
  // Copies drift; this is what stops them. If they disagree, placement believes
  // a piece is a size it is not drawn at, and DEC-010's "the piece is inside
  // the room" stops being true without any test noticing.
  const source = fs.readFileSync('src/core/systems/decorPlacement.ts', 'utf8');
  const table = source.match(/const SLOT_SIZE[^=]*=\s*\{([^}]*)\}/)?.[1] ?? '';
  const declared = new Map<string, string>();
  for (const [, slot, w, h] of table.matchAll(/(\w+):\s*\[(\d+),\s*(\d+)\]/g)) {
    declared.set(slot!, `${w}x${h}`);
  }
  assert(declared.size === 4, `expected four slot sizes, found ${declared.size}`);

  const bySlot = new Map<string, string>();
  for (const item of data.decor) {
    const entry = entries.find((e) => e.key === item.assetKey);
    if (entry) bySlot.set(item.slotType, `${entry.width}x${entry.height}`);
  }
  for (const [slot, size] of bySlot) {
    eq(declared.get(slot), size, `placement thinks a "${slot}" piece is ${declared.get(slot)}`);
  }

  // The same for the block size and the art scale.
  const layout = fs.readFileSync('src/render/layout.ts', 'utf8');
  eq(source.match(/const BLOCK_W = (\d+)/)?.[1], layout.match(/BLOCK_W = (\d+)/)?.[1],
    'decorPlacement and layout disagree on block width');
  eq(source.match(/const BLOCK_H = (\d+)/)?.[1], layout.match(/BLOCK_H = (\d+)/)?.[1],
    'decorPlacement and layout disagree on block height');
  assert(/ART_SCALE = DECOR_ART_SCALE/.test(layout),
    'layout keeps its own copy of the art scale instead of the placement one');
  console.log(`      slot sizes agree: ${[...declared].map(([k, v]) => `${k} ${v}`).join(', ')}`);
});

await check('a lookup made before its bundle lands does not poison the key for the session', () => {
  // AUDIT 2026-09-03 (D8). The scene draws once the rooms land while the other
  // bundles are still loading; recording those early misses permanently left
  // a fresh hotel's two staff as capsules on every boot. Structural, since
  // the loader cannot run headlessly; scratch experiment neg-cache.ts is the
  // behavioural proof.
  const loader = fs.readFileSync('src/render/assets.ts', 'utf8');
  assert(/loadedBundles\.has\(bundle\)/.test(loader),
    'texture() records a miss before the key\'s bundle has loaded');
  assert(/missing\.delete\(entry\.key\)/.test(loader),
    'loadBundle never clears an earlier miss once the file arrives');
  const characters = fs.readFileSync('src/render/characterView.ts', 'utf8');
  assert(/walkFramesGeneration/.test(characters),
    'a walk sheet that was not there yet is cached as absent for ever');
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach(f => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
