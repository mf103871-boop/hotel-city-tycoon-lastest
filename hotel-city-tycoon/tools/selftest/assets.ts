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
import zlib from 'node:zlib';
import { loadSimData } from '../balance-sim/load-data.ts';

/**
 * A minimal PNG reader, because nothing here has ever read a shipped pixel.
 *
 * Every test in this file until now checked the manifest — that a key has a
 * file and a path resolves. None of them opened one. That is how a night wash
 * that clipped every pale blue to #0000FF shipped through a green suite: the
 * only thing that would have caught it is looking at the pixels.
 *
 * Handles the 8-bit RGB/RGBA/indexed, non-interlaced files the art pipeline
 * produces — `save_png` quantises anything under 256 colours, so the pest
 * overlays arrive palettised — and refuses anything else rather than guessing.
 */
interface Png { width: number; height: number; channels: number; data: Buffer }

function readPng(path: string): Png {
  const file = fs.readFileSync(path);
  if (file.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path} is not a PNG`);
  let pos = 8;
  let width = 0; let height = 0; let depth = 0; let colour = 0; let interlace = 0;
  const idat: Buffer[] = [];
  let palette: Buffer | null = null;
  let alphas: Buffer | null = null;
  while (pos < file.length) {
    const len = file.readUInt32BE(pos);
    const type = file.toString('ascii', pos + 4, pos + 8);
    const body = file.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      depth = body[8]!; colour = body[9]!; interlace = body[12]!;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') alphas = body;
    else if (type === 'IEND') break;
  }
  if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6 && colour !== 3)) {
    throw new Error(`${path}: unsupported PNG (depth ${depth}, colour ${colour}, interlace ${interlace})`);
  }
  if (colour === 3 && !palette) throw new Error(`${path}: indexed PNG with no palette`);
  const channels = colour === 6 ? 4 : colour === 3 ? 1 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  let read = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[read++]!;
    const line = Buffer.from(raw.subarray(read, read + stride));
    read += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels]! : 0;
      const b = prev[x]!;
      const c = x >= channels ? prev[x - channels]! : 0;
      if (filter === 1) line[x] = (line[x]! + a) & 0xff;
      else if (filter === 2) line[x] = (line[x]! + b) & 0xff;
      else if (filter === 3) line[x] = (line[x]! + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        line[x] = (line[x]! + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
    }
    line.copy(out, y * stride);
    prev = line;
  }
  if (colour !== 3) return { width, height, channels, data: out };

  // Expand the palette so every caller sees RGBA and none of them has to know
  // which of the three encodings a given file happens to use.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const idx = out[i]!;
    rgba[i * 4] = palette![idx * 3]!;
    rgba[i * 4 + 1] = palette![idx * 3 + 1]!;
    rgba[i * 4 + 2] = palette![idx * 3 + 2]!;
    rgba[i * 4 + 3] = alphas && idx < alphas.length ? alphas[idx]! : 255;
  }
  return { width, height, channels: 4, data: rgba };
}

/** Every shipped room PNG, both tiers. */
function roomFiles(): string[] {
  const out: string[] = [];
  for (const dir of ['public/assets/rooms', 'public/assets/@2x/rooms']) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) if (name.endsWith('.png')) out.push(`${dir}/${name}`);
  }
  return out;
}

/** The most common fully-opaque colour, as [r, g, b]. */
function dominant(png: Png): [number, number, number] {
  const seen = new Map<number, number>();
  for (let i = 0; i < png.data.length; i += png.channels) {
    if (png.channels === 4 && png.data[i + 3]! <= 200) continue;
    const key = (png.data[i]! << 16) | (png.data[i + 1]! << 8) | png.data[i + 2]!;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  let best = 0; let count = -1;
  for (const [k, v] of seen) if (v > count) { count = v; best = k; }
  return [(best >> 16) & 0xff, (best >> 8) & 0xff, best & 0xff];
}

function luminance([r, g, b]: [number, number, number]): number {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

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

await check('the night, dirty and pest variants are drawn, not merely shipped', () => {
  // 92 of the 115 room files are variants. Until the selector learned to ask
  // for them the renderer only ever requested `.base`, so every one of them
  // was generated, shipped, and never seen — and a room the player had to
  // clean looked exactly like one they did not.
  const selectors = fs.readFileSync('src/bridge/selectors.ts', 'utf8');
  assert(/roomArtVariant/.test(selectors), 'nothing chooses a room variant');
  for (const variant of ['night', 'dirty']) {
    assert(selectors.includes(`'${variant}'`), `the selector never returns "${variant}"`);
  }
  assert(/room\.\$\{room\.defId\}\.pest/.test(selectors), 'the pest layer is never asked for');
  const roomView = fs.readFileSync('src/render/roomView.ts', 'utf8');
  assert(/pestKey/.test(roomView) && /pestArt/.test(roomView),
    'the room view never composites the pest layer');

  // And every key those two can produce has to exist.
  for (const room of data.rooms) {
    for (const variant of ['base', 'night', 'dirty', 'pest']) {
      const key = `room.${room.id}.${variant}`;
      const entry = entries.find((e) => e.key === key);
      assert(entry, `no manifest entry for "${key}"`);
      assert(fs.existsSync(`public/assets/${entry.file}`), `${entry.file} is missing on disk`);
    }
  }
  console.log(`      ${data.rooms.length} rooms x 4 states, all present`);
});


await check('no shipped asset uses pure black, which ART-0 §6 forbids', () => {
  // "الخط الخارجي داكن مائل إلى الكحلي، وليس أسود نقيًا" — outlines are deep
  // navy, never pure black. Nothing has ever checked a pixel for it.
  const offenders: string[] = [];
  for (const file of roomFiles()) {
    const png = readPng(file);
    for (let i = 0; i < png.data.length; i += png.channels) {
      if (png.channels === 4 && png.data[i + 3]! <= 200) continue;
      if (png.data[i] === 0 && png.data[i + 1] === 0 && png.data[i + 2] === 0) {
        offenders.push(file);
        break;
      }
    }
  }
  if (offenders.length > 0) throw new Error(`pure black in ${offenders.length}: ${offenders.slice(0, 4).join(', ')}`);
});

await check('every night room is actually darker than the room it is the night of', () => {
  // The wash that shipped scaled blue by 0.84 and added 54, which reaches 255
  // from an input of 240: every pale blue surface pinned to pure blue and the
  // hotel came out brighter and more electric after dark than before it. The
  // LUT parity test in render.ts guards the numbers; this guards the pixels,
  // which is what a player sees and what a regenerate could change on its own.
  const problems: string[] = [];
  for (const night of roomFiles().filter((f) => f.includes('_night'))) {
    const base = night.replace('_night', '_base');
    if (!fs.existsSync(base)) continue;
    const dn = luminance(dominant(readPng(night)));
    const db = luminance(dominant(readPng(base)));
    if (dn >= db) problems.push(`${night} ${dn.toFixed(3)} >= ${db.toFixed(3)}`);
  }
  if (problems.length > 0) throw new Error(`night is not darker: ${problems.join(', ')}`);
});

await check('the night wash never drives a channel to its ceiling', () => {
  // The clip itself, measured rather than inferred: an image whose blue is
  // pinned at 255 over a wide area has lost every highlight it had.
  const problems: string[] = [];
  for (const night of roomFiles().filter((f) => f.includes('_night'))) {
    const png = readPng(night);
    let pinned = 0; let opaque = 0;
    for (let i = 0; i < png.data.length; i += png.channels) {
      if (png.channels === 4 && png.data[i + 3]! <= 200) continue;
      opaque++;
      if (png.data[i + 2] === 255) pinned++;
    }
    if (opaque > 0 && pinned / opaque > 0.02) {
      problems.push(`${night} ${(100 * pinned / opaque).toFixed(1)}% of pixels at blue 255`);
    }
  }
  if (problems.length > 0) throw new Error(`night wash is clipping: ${problems.join(', ')}`);
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach(f => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
