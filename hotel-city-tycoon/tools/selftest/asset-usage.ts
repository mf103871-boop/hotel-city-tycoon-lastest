/**
 * Does anything actually draw the art we ship?
 *
 * `assets.ts` proves the forward direction — every key the manifest declares
 * has a file, at both resolutions. Nothing proved the reverse, and
 * `tools/validate-data/integrity.mjs:387` has promised it in a comment since
 * the manifest was written: "the manifest must not promise files for keys
 * nobody references". It was never written, and the gap is the reason HC-P2's
 * gate clause «لا تبقى حالات رئيسية معرفة في CSS أو الأصول لكنها غير مستخدمة»
 * ("no major state defined in CSS or the assets but left unused") was failing
 * with 40 files — 8% of the shipped art — downloaded and decoded on every boot
 * and never reaching a pixel.
 *
 * The hard part is that a key reaches the screen two different ways, and the
 * manifest models only one of them:
 *
 *   1. Through Pixi: some code calls `texture(key)`. The key is almost never a
 *      literal — it is built by the bridge from a room's defId, or read from a
 *      data file's `assetKey` — so this cannot be a grep for the key's text.
 *      CONSUMERS below names every shape and the line that builds it.
 *   2. Through the DOM: `src/ui` renders `<img src=".../assets/effects/x.png">`
 *      by FILE PATH, never touching the manifest at all. Those files are used
 *      and the manifest key for them is not, which is why a key-only check
 *      would call them dead and a file-only check would call them alive.
 *
 * Anything neither reaches has to be named in PENDING with a ticket. That is
 * the point: shipped-but-undrawn art is allowed to exist while the menu that
 * will show it is still being built, and it is not allowed to be a surprise.
 *
 * Run: node --experimental-strip-types tools/selftest/asset-usage.ts
 */
import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

interface Entry { key: string; bundle: string; file: string; required?: boolean }
const manifest = JSON.parse(fs.readFileSync('public/assets/manifest.json', 'utf8')) as { entries: Entry[] };
const entries = manifest.entries;

/** Every .ts/.tsx under src/, as one string, for the call-site assertions. */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) sources(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}
const srcFiles = sources('src');
const src = srcFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

/**
 * How each family of manifest key reaches a `texture()` call.
 *
 * `proof` is a string that must still be present in the source — not to be
 * clever, but so that deleting the consumer makes this table wrong out loud
 * instead of leaving a family silently undrawn. A family with no row here is
 * treated as unconsumed, which is the safe direction.
 */
const CONSUMERS: Array<{ pattern: RegExp; via: string; proof: string }> = [
  {
    pattern: /^room\.[A-Za-z]+\.(base|night|dirty)$/,
    via: 'selectors.summariseRoom builds `room.${defId}.${variant}` -> RoomViewData.assetKey -> roomView texture()',
    proof: 'assetKey: `room.${room.defId}.${variant}`',
  },
  {
    pattern: /^room\.[A-Za-z]+\.pest$/,
    via: 'selectors.summariseRoom pestKey -> roomView.pestArt',
    proof: 'pestKey: room.hasPest ?',
  },
  {
    pattern: /^room\.[A-Za-z]+\.front$/,
    via: 'selectors.summariseRoom frontKey -> scene.roomFronts (BL-035)',
    proof: 'frontKey: `room.${room.defId}.front`',
  },
  {
    pattern: /^decor\.[\w.-]+$/,
    via: 'data/decor.json assetKey -> RoomViewDecorItem -> roomView / decorView texture()',
    proof: 'piece.assetKey ? texture(piece.assetKey)',
  },
  {
    pattern: /^(staff|guest)\.[\w-]+\.sheet$/,
    via: 'data/staff.json + data/guests.json assetKey -> characterView / anim/sheet.ts',
    proof: 'texture(data.assetKey)',
  },
  {
    pattern: /^event\.(fire|ghost|pest)\.overlay$/,
    via: 'roomView marks table — the only literal keys in the renderer',
    proof: "'event.fire.overlay'",
  },
];

/**
 * Shipped, declared, and drawn by nothing yet.
 *
 * Every row needs a ticket and an exact count. The count is what stops the
 * debt growing quietly: adding a new undrawn family, or one more file to an
 * existing one, fails here until somebody writes it down.
 */
const PENDING: Array<{ pattern: RegExp; count: number; ticket: string; why: string }> = [
  {
    pattern: /^room\.[A-Za-z]+\.thumb$/,
    count: 23,
    ticket: 'BL-043 / UI-CATALOG',
    why: 'the build menu is text-only; these are the icons it will show',
  },
  {
    pattern: /^(staff|guest)\.[\w-]+\.thumb$/,
    count: 9,
    ticket: 'BL-043 / UI-CATALOG',
    why: 'the staff and guest panels are text-only; these are the portraits',
  },
  {
    pattern: /^event\.inspection\.icon$/,
    count: 1,
    ticket: 'BL-043 / BL-039',
    why: 'the other two event icons are reached by the climate banner, but an '
      + 'inspection is not a hotel-wide climate event — it arrives as a guest who '
      + 'walks in on their own sheet, and nothing ever shows this badge',
  },
  {
    pattern: /^ui\.(currency|shift)\.[\w.]+$/,
    count: 7,
    ticket: 'BL-043 / UI-CATALOG',
    why: 'declared as assetKey in data/shifts.json and the currency table, but the HUD renders text — nothing calls texture() on a ui.* key',
  },
];

/**
 * Translated in both locales, looked up by nothing.
 *
 * Written down rather than deleted: most were generated alongside siblings
 * that ARE wired, so each one is a feature half-built rather than a typo, and
 * BL-046 is where the decision to finish or drop them belongs. The list is
 * exact so a fourteenth cannot appear quietly.
 */
const ORPHAN_KEYS: string[] = [
  'ui.allDone',
  'ui.cityHint',
  'ui.comeBackIn',
  'ui.confirmReset',
  'ui.day',
  'ui.expand',
  'ui.hotelClosed',
  'ui.roomOccupied',
  'ui.shopHint',
  'ui.slotsFree',
  'ui.slotTaken',
  'ui.staff',
  'ui.streakAtRisk',
];

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — is the shipped art actually drawn?');
console.log(line);

check('every consumer this file claims still exists in the source', () => {
  // The table above is only worth anything while it is true.
  for (const c of CONSUMERS) {
    assert(src.includes(c.proof),
      `no source line matches "${c.proof}" — the consumer for ${c.pattern} named as "${c.via}" is gone, `
      + 'so that whole family of art may now be shipped and never drawn');
  }
  console.log(`      ${CONSUMERS.length} consumer families, each still wired`);
});

/** Which effect icons the DOM can actually ask for, derived from the data. */
function climateEventIds(): string[] {
  const events = JSON.parse(fs.readFileSync('data/events.json', 'utf8')) as {
    events: Array<{ id: string; scope: string; trigger: { kind: string } }>;
  };
  // src/core/systems/events.ts: only a hotel-scope randomPerHour event becomes
  // `state.climate`, and ClimateBanner/PhoneSheet render that id as a filename.
  return events.events.filter((e) => e.scope === 'hotel' && e.trigger.kind === 'randomPerHour').map((e) => e.id);
}

check('the DOM asset paths resolve to files that exist', () => {
  // src/ui reaches past the manifest and names files directly. That is allowed
  // — an <img> is not a Pixi sprite — but it means these files have no manifest
  // consumer and must not be reported as dead.
  const climate = climateEventIds();
  assert(climate.length > 0, 'no hotel-wide event can become the climate, yet the banner renders one');
  const wanted = [...climate.map((id) => `effects/${id}.png`), 'effects/ghost.png'];
  for (const file of wanted) {
    assert(fs.existsSync(`public/assets/${file}`), `src/ui renders assets/${file} and it does not exist`);
  }
  assert(/assets\/effects\/\$\{[^}]*eventId\}\.png/.test(src),
    'nothing builds an effects path from an event id any more — this check is stale');
  console.log(`      ${wanted.length} files reached by <img> path: ${wanted.map((f) => f.split('/')[1]).join(', ')}`);
});

check('every manifest key is drawn, or written down as not yet drawn', () => {
  const climate = new Set(climateEventIds());
  const undrawn: Entry[] = [];
  for (const entry of entries) {
    if (CONSUMERS.some((c) => c.pattern.test(entry.key))) continue;
    // The DOM path: an effects icon whose file the banner can name.
    const m = /^event\.([A-Za-z]+)\.icon$/.exec(entry.key);
    if (m && climate.has(m[1]!)) continue;
    undrawn.push(entry);
  }
  const unexplained = undrawn.filter((e) => !PENDING.some((p) => p.pattern.test(e.key)));
  assert(unexplained.length === 0,
    `${unexplained.length} manifest key(s) are shipped, downloaded on every boot, and drawn by nothing, `
    + 'and are not written down in PENDING:\n      '
    + unexplained.map((e) => `${e.key} (${e.file})`).join('\n      ')
    + '\n      Either wire it up, or add it to PENDING with a ticket saying when it will be.');
  console.log(`      ${entries.length} keys · ${entries.length - undrawn.length} drawn · ${undrawn.length} pending, all accounted for`);
});

check('the undrawn art is not quietly growing', () => {
  let bytes = 0;
  for (const p of PENDING) {
    const hits = entries.filter((e) => p.pattern.test(e.key));
    eq(hits.length, p.count,
      `PENDING says ${p.count} keys for ${p.ticket} (${p.why}) but the manifest has ${hits.length} — `
      + 'update the count deliberately, so the debt cannot grow by accident');
    for (const h of hits) {
      const f = `public/assets/${h.file}`;
      if (fs.existsSync(f)) bytes += fs.statSync(f).size;
      const f2 = `public/assets/@2x/${h.file}`;
      if (fs.existsSync(f2)) bytes += fs.statSync(f2).size;
    }
  }
  const total = PENDING.reduce((n, p) => n + p.count, 0);
  console.log(`      ${total} keys awaiting a consumer, ${(bytes / 1024).toFixed(0)}KB across both tiers`);
});

check('nothing ships a file the manifest never mentions', () => {
  // The other direction of the same question: a file on disk that no entry
  // names is shipped by the build and cannot be reached by anything at all.
  const declared = new Set(entries.map((e) => e.file));
  const stray: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      // `@2x/` is the second resolution of the same declared files, not a
      // directory of its own art — `assets.ts` already holds the two tiers in
      // step, and walking it here would report every file in the game twice.
      if (name.startsWith('@')) continue;
      if (fs.statSync(full).isDirectory()) { walk(full, `${prefix}${name}/`); continue; }
      if (!/\.(png|webp|jpg)$/.test(name)) continue;
      if (!declared.has(`${prefix}${name}`)) stray.push(`${prefix}${name}`);
    }
  };
  walk('public/assets', '');
  assert(stray.length === 0, `shipped but in no manifest entry:\n      ${stray.join('\n      ')}`);
  console.log(`      ${declared.size} declared files, no strays`);
});

check('no internal identifier is handed to the renderer as text', () => {
  // HC-P2's gate asks for «تنظيف أسماء الواجهة من المعرّفات الداخلية» — the
  // interface's names cleaned of internal identifiers. Every React panel goes
  // through i18n, but the canvas had one hole: the snapshot was handed each
  // room's `defId` as its label and drew it across the floor whenever the art
  // had not loaded, so during the boot window an Arabic player read
  // "staffRoom" and "luxurySuite" in Latin script.
  //
  // The renderer cannot translate — it has no locale and no business having
  // one — so the rule is simply that it is never given an id to draw.
  const snapshot = fs.readFileSync('src/ui/HotelCanvas.tsx', 'utf8');
  const block = /rooms:\s*summariseRooms\(state\)\.map\(\(r\) => \(\{[\s\S]*?\n {4}\}\)\)/.exec(snapshot);
  assert(block, 'the room snapshot mapping was not found — this check is stale');
  assert(!/\bdefId\b/.test(block[0]),
    'the scene snapshot carries a room defId. Nothing in the renderer can translate it, '
    + 'so whatever draws it puts an internal id in front of the player.');

  // And the renderer draws no text it was handed from the simulation at all.
  const roomView = fs.readFileSync('src/render/roomView.ts', 'utf8');
  assert(!/\.text = .*data\./.test(roomView),
    'roomView draws a string that came from the snapshot — see above');
});

check('every translated string is looked up by something', () => {
  // The same question as the manifest one, asked of the other thing this
  // project ships for the player: a key translated into both locales that no
  // component ever calls is a state defined and left unused, and it is how
  // thirteen of them accumulated unnoticed. integrity.mjs checks that every
  // key the DATA references exists; nothing checked that every key that exists
  // is referenced.
  const en = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
  // Keys are reached three ways: t('literal') in a component, nameKey/descKey
  // fields in data, and a handful built from a value at runtime.
  const consumers = [
    ...srcFiles.map((f) => fs.readFileSync(f, 'utf8')),
    ...fs.readdirSync('data').filter((f) => f.endsWith('.json')).map((f) => fs.readFileSync(`data/${f}`, 'utf8')),
    ...fs.readdirSync('data/animations').map((f) => fs.readFileSync(`data/animations/${f}`, 'utf8')),
  ].join('\n');
  // A key built by template — `reject.${reason}`, `room.${id}.name` — is
  // reachable if its prefix is interpolated anywhere.
  const dynamicPrefixes = [...consumers.matchAll(/`([a-z][\w.]*?)\.\$\{/g)].map((m) => m[1]!);
  const orphans = Object.keys(en).filter((key) => {
    if (consumers.includes(`'${key}'`) || consumers.includes(`"${key}"`) || consumers.includes(`\`${key}\``)) return false;
    return !dynamicPrefixes.some((p) => key.startsWith(`${p}.`));
  });
  assert(orphans.length <= ORPHAN_KEYS.length,
    `${orphans.length} translated strings are looked up by nothing:\n      ${orphans.join('\n      ')}`);
  for (const o of orphans) {
    assert(ORPHAN_KEYS.includes(o),
      `"${o}" is translated in both locales and looked up by nothing, and is not in ORPHAN_KEYS — `
      + 'either wire it up or write it down');
  }
  console.log(`      ${Object.keys(en).length} keys · ${orphans.length} orphaned, all written down`);
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
