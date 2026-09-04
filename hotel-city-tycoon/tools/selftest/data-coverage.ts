/**
 * Dead data sweep.
 *
 * Every field in `data/*.json` is a promise: the player pays for it, or plans
 * around it, or reads it in a tooltip. A field nothing reads is a promise the
 * game does not keep.
 *
 * This check exists because the manual version of it kept finding real bugs.
 * `incomePerCustomer` sat unread while eight room types costing up to 190,000
 * coins earned nothing. `usingAmenity` was a state with no code path into it.
 * Those were found by grepping on a hunch; this does it every run.
 *
 * Run: node --experimental-strip-types tools/selftest/data-coverage.ts
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

/**
 * Every source file that could plausibly read game data.
 *
 * Comments and schema declarations are stripped. `efficiency` passed this
 * sweep for two phases because the word appeared in a comment about something
 * else and in the Zod schema that describes the field — neither of which is a
 * reader. A mention is not a use.
 */
/**
 * Removes `interface`/`type` declarations from a source file.
 *
 * Known limit: this matches on word boundaries in the remaining source, so a
 * data field name appearing inside a STRING — an error message, a log line —
 * counts as a read. `invariants.ts` tripped this by saying "the formula says"
 * in a failure message. Stripping string literals too would be worse: fields
 * genuinely read by bracket access (`state.ledger['starBonus']`) would then
 * look dead. Word the messages around the field names.
 *
 * A field named in an interface is described, not consumed. `sellable` is
 * declared on `DecorDef` and read by nothing, and the sweep counted the
 * declaration itself as the reader — the exact blind spot that let `efficiency`
 * pass for two phases.
 */
function stripDeclarations(text: string): string {
  let out = '';
  let i = 0;
  const decl = /\b(?:export\s+)?(?:interface|type)\s+\w+/g;
  let m: RegExpExecArray | null;
  while ((m = decl.exec(text)) !== null) {
    out += text.slice(i, m.index);
    // Walk to the end of the declaration: past the first `{` to its match, or
    // to the terminating `;` for a non-braced type alias.
    let j = m.index + m[0].length;
    let depth = 0;
    let opened = false;
    while (j < text.length) {
      const ch = text[j];
      if (ch === '{') { depth++; opened = true; }
      else if (ch === '}') { depth--; if (opened && depth === 0) { j++; break; } }
      else if (ch === ';' && !opened) { j++; break; }
      j++;
    }
    i = j;
    decl.lastIndex = j;
  }
  return out + text.slice(i);
}

function collect(roots: string[], skip: (full: string) => boolean = () => false): string {
  const parts: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx|mjs)$/.test(name)) continue;
      // Schemas describe fields; they do not consume them.
      if (full.includes('schemas')) continue;
      if (skip(full)) continue;
      const text = fs.readFileSync(full, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');
      parts.push(stripDeclarations(text));
    }
  };
  for (const root of roots) walk(root);
  return parts.join('\n');
}

function sourceText(): string {
  return collect(['src', 'tools']);
}

/**
 * The simulation itself. A field read here changes what the hotel does.
 */
function runtimeText(): string {
  return collect(['src/core']);
}

/**
 * Everything the player's client runs that is not the simulation: the bridge,
 * the screens, the renderer, the copy. A field read only here is presentation.
 */
function appText(): string {
  return collect(['src'], (full) => full.startsWith(`src${path.sep}core${path.sep}`));
}

/** Field names appearing anywhere in a JSON value, at any depth. */
function fieldNames(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) fieldNames(item, out);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      out.add(key);
      fieldNames(child, out);
    }
  }
  return out;
}

/**
 * Fields that legitimately have no reader.
 *
 * Kept short and each one justified: a long list here is how a dead-data
 * check quietly stops checking anything.
 */
const EXEMPT = new Set([
  // File headers, for humans reading the data.
  // Any `note`-prefixed key is documentation for whoever reads the data.
  'version', 'note', 'note_reward', 'tuningStatus', 'assetKeyConvention', '$schema',
  // Read by the schema loader generically, not by name.
  'objectives', 'entries', 'items', 'rooms', 'tiers', 'types', 'roles',
  'grades', 'levels', 'shifts', 'expansions', 'events', 'currencies',
  // Structural containers whose children are what matter.
  'start', 'simulation', 'cleanliness', 'guests', 'decorMeter', 'sellback',
  'shiftCostScaling', 'xp', 'limits', 'closedHotel', 'check', 'trigger',
  'cost', 'blocks', 'grid', 'function', 'unlocks', 'clearCost',
  'clearRewardCoins', 'desireTags', 'slotTypes', 'categories', 'bundles',
  'resolutions', 'format', 'blockSize',
]);

const source = sourceText();
const runtime = runtimeText();
const app = appText();

/**
 * Fields that are shipped but not yet consumed, each with the decision behind
 * it. Being on this list is a recorded choice, not an oversight; a field that
 * is neither consumed nor listed here fails the sweep.
 *
 * The previous version of this check scanned `tools/` and the tests alongside
 * `src/`, so a field mentioned only inside its own selftest counted as read.
 * That is how a promise stays unkept while the sweep reports green.
 */
const RESERVED = new Map<string, string>([
  // --- Phase 1: time, shifts, queue, reception
  ['graceNote', 'Documentation for whoever reads shifts.json; graceSec is what the simulation reads.'],
  ['checkInNote', 'Documentation for whoever reads economy.json; checkInSec is what the simulation reads.'],
  ['offlineNote', 'Documentation: why the throughput correction and the design lever are separate numbers.'],
  ['tuningNote', 'Documentation: what was retuned in Phase 6c and the measurements behind it.'],
  ['groupNote', 'Documentation: what the three objective groups mean and that none of them gate play.'],
  ['starsNote', 'Documentation: the settled 2-star start and how to revisit it. Signed off after Phase 5.'],

  // --- Phase 2: inventory, shop, building, storage

  // --- Phase 4: staff, cleaning, maintenance, incidents
  ['roomsPerCleaner', 'Phase 4 — cleaning capacity gets one source of truth; online and offline disagree today.'],
  ['roomTypes', 'Phase 4 — nothing validates that a role may be assigned to the room it is assigned to.'],

  // --- Phase 5: room quality, decor, stars

  // --- Phase 6: economy, shifts, XP, progression
  ['formula', 'Phase 6 — a written formula on economy.shiftCostScaling and levels.curve; the code implements its own.'],
  ['curve', 'Phase 6 — the XP curve is documented here and contradicted by levels[]. One must win.'],
  ['xpToNext', 'Phase 6 — the level table carries a per-level step that no progression code reads.'],
  ['grantOnGuestCheckout', 'Phase 6 — XP on checkout is a flag the simulation does not consult.'],

  // --- Phase 7: objectives, live-ops, neighbours

  // --- Deferred beyond the current plan
  ['maxSaveSlots', 'Deferred — a single slot ships; multi-slot saves are not in the phased plan.'],
]);

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — dead data sweep');
console.log(line);

type Class = 'runtime' | 'ui' | 'reserved' | 'structural';
const classified = new Map<string, Class>();
const files = fs.readdirSync('data').filter((f) => f.endsWith('.json'));
const unread: Array<{ file: string; field: string }> = [];

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join('data', file), 'utf8'));
  for (const field of fieldNames(data)) {
    if (EXEMPT.has(field)) { classified.set(field, 'structural'); continue; }
    const word = new RegExp(`\\b${field}\\b`);
    if (word.test(runtime)) { classified.set(field, 'runtime'); continue; }
    if (word.test(app)) { classified.set(field, 'ui'); continue; }
    if (RESERVED.has(field)) { classified.set(field, 'reserved'); continue; }
    unread.push({ file, field });
  }
}

check('every field in the balance data is read by something', () => {
  const listed = unread.map((u) => `${u.file}:${u.field}`).join(', ');
  assert(unread.length === 0,
    `${unread.length} field(s) nothing reads — the player is paying for promises the game does not keep:\n      ${listed}`);
  const tally = (c: Class) => [...classified.values()].filter((v) => v === c).length;
  console.log(`      ${tally('runtime')} runtime-consumed · ${tally('ui')} UI-only · `
    + `${tally('reserved')} reserved · ${tally('structural')} structural`);
});

check('every reserved field carries a stated reason', () => {
  for (const [field, why] of RESERVED) {
    assert(why.trim().length > 0, `${field} is reserved with no reason given`);
    // A reserved field that has since gained a reader should leave the list,
    // or the list becomes a place fields go to stop being checked.
    assert(!new RegExp(`\\b${field}\\b`).test(runtime),
      `${field} is on the reserved list but the simulation now reads it`);
  }
});

check('every room-definition field is used by the simulation', () => {
  // The union means a field can exist on one category and be dead on it.
  const rooms = JSON.parse(fs.readFileSync('data/rooms.json', 'utf8')).rooms as Array<Record<string, unknown>>;
  const core = fs.readFileSync('src/core/systems/guests.ts', 'utf8')
    + fs.readFileSync('src/core/sim/tick.ts', 'utf8')
    + fs.readFileSync('src/core/sim/offline.ts', 'utf8')
    + fs.readFileSync('src/core/commands/index.ts', 'utf8')
    + fs.readFileSync('src/core/systems/stars.ts', 'utf8')
    + fs.readFileSync('src/core/systems/decor.ts', 'utf8')
    + fs.readFileSync('src/core/systems/cleanliness.ts', 'utf8')
    + fs.readFileSync('src/core/systems/economy.ts', 'utf8');

  const earners = ['incomePerGuest', 'incomePerCustomer', 'xpPerGuest', 'xpPerCustomer',
    'stayDurationSec', 'serviceDurationSec', 'capacity', 'beds', 'decorTarget', 'decorSlots'];
  const missing = earners.filter((f) => {
    const declared = rooms.some((r) => f in r);
    return declared && !new RegExp(`\\b${f}\\b`).test(core);
  });
  assert(missing.length === 0,
    `the simulation never reads: ${missing.join(', ')} — that content earns nothing`);
});

check('every functional room effect has a handler', () => {
  const rooms = JSON.parse(fs.readFileSync('data/rooms.json', 'utf8')).rooms as Array<{
    category: string; id: string; function?: { kind: string };
  }>;
  for (const room of rooms) {
    if (room.category !== 'functional' || !room.function) continue;
    const kind = room.function.kind;
    assert(new RegExp(`'${kind}'`).test(source),
      `"${room.id}" declares effect "${kind}" and nothing implements it`);
  }
});

check('every guest state is entered by some code path', () => {
  const types = fs.readFileSync('src/core/state/types.ts', 'utf8');
  const match = /state: ('[a-zA-Z]+'(?:\s*\|\s*'[a-zA-Z]+')*)/.exec(types);
  assert(match, 'could not find the guest state union');
  const states = [...match[1]!.matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]!);
  const sim = fs.readFileSync('src/core/systems/guests.ts', 'utf8')
    + fs.readFileSync('src/core/sim/tick.ts', 'utf8')
    + fs.readFileSync('src/core/commands/index.ts', 'utf8');
  for (const state of states) {
    // Assignment or an object literal — but never a mere comparison.
    // `usingAmenity` was compared against and never written, which is exactly
    // how it stayed unreachable for five phases.
    const written = new RegExp(`state = '${state}'|state: '${state}'`).test(sim);
    assert(written, `no code ever puts a guest into the "${state}" state`);
  }
  console.log(`      ${states.length} guest states, all reachable`);
});

check('every reject reason has player-facing wording', () => {
  // Twenty-six of twenty-nine refusals once reached nobody: the player tapped,
  // the game did not move, and no message explained why. Checking that a
  // reason appears in two named files was the wrong test; what matters is
  // that every reason maps to a string the player can read.
  const commands = fs.readFileSync('src/core/commands/index.ts', 'utf8');
  const block = /export type RejectReason =([\s\S]*?);/.exec(commands);
  assert(block, 'could not find the reject reason union');
  const reasons = [...block[1]!.matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]!);

  const map = fs.readFileSync('src/bridge/rejections.ts', 'utf8');
  const unmapped = reasons.filter((r) => !new RegExp(`\\b${r}:`).test(map));
  assert(unmapped.length === 0,
    `no wording for: ${unmapped.join(', ')} — the player would tap and see nothing`);

  const en = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
  const missing = reasons.filter((r) => !(`reject.${r}` in en));
  assert(missing.length === 0, `missing from en.json: ${missing.join(', ')}`);
  console.log(`      ${reasons.length} rejection reasons, all worded`);
});

check('refusals actually reach the screen', () => {
  // The mapping existing is not enough; something has to read it. This is the
  // same dead-code shape that left the art unloaded and the events unread.
  const store = fs.readFileSync('src/bridge/store.ts', 'utf8');
  assert(/lastRejection/.test(store), 'the store discards refusals');
  const app = fs.readFileSync('src/ui/App.tsx', 'utf8');
  assert(/consumeRejection\s*\(/.test(app), 'nothing consumes refusals — they are recorded and dropped');
});

check('every description written for a room is shown somewhere', () => {
  // `descKey` sat in the data from P1 and no screen read it: twenty-three
  // sentences written, none ever seen. The same shape as the unloaded art.
  const rooms = JSON.parse(fs.readFileSync('data/rooms.json', 'utf8')).rooms as Array<{ descKey?: string }>;
  assert(rooms.some((r) => r.descKey), 'no room declares a description');
  assert(/descKey/.test(source), 'descKey is declared and nothing reads it');

  const en = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
  const ar = JSON.parse(fs.readFileSync('src/i18n/locales/ar.json', 'utf8')) as Record<string, string>;
  for (const room of rooms) {
    if (!room.descKey) continue;
    assert(room.descKey in en, `${room.descKey} is missing from en.json`);
    assert(room.descKey in ar, `${room.descKey} is missing from ar.json`);
  }
});

check('both locales are complete', () => {
  // Falling back to English is a safety net, not a plan. Coverage is now full
  // and should stay that way.
  const en = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
  const ar = JSON.parse(fs.readFileSync('src/i18n/locales/ar.json', 'utf8')) as Record<string, string>;
  const missing = Object.keys(en).filter((k) => !(k in ar));
  assert(missing.length === 0, `${missing.length} keys missing from Arabic: ${missing.slice(0, 5).join(', ')}`);
  console.log(`      ${Object.keys(en).length} keys, both locales complete`);
});

check('a late texture replaces its placeholder', () => {
  // A street of blank capsules beside one drawn character shipped because the
  // views cached what they drew without recording which art existed at the
  // time. The generation counter is what makes a stale draw detectable.
  const assets = fs.readFileSync('src/render/assets.ts', 'utf8');
  assert(/assetGeneration/.test(assets), 'nothing tracks when a bundle lands');
  for (const view of ['characterView', 'roomView']) {
    const src = fs.readFileSync(`src/render/${view}.ts`, 'utf8');
    assert(/assetGeneration\(\)/.test(src),
      `${view} caches its last draw without accounting for art that arrives later`);
  }
  const canvas = fs.readFileSync('src/ui/HotelCanvas.tsx', 'utf8');
  assert(/refreshArt\s*\(/.test(canvas), 'nothing redraws the scene when a bundle finishes');
});

check('the document direction follows the chosen language', () => {
  // The interface flipped while <html> stayed ltr, so anything the browser
  // decides above the React tree kept the wrong direction.
  const app = fs.readFileSync('src/ui/App.tsx', 'utf8');
  assert(/documentElement\.dir/.test(app), 'the document element never receives a direction');
  assert(/documentElement\.lang/.test(app), 'the document element never receives a language');
});

check('no English word is hardcoded into a translated sentence', () => {
  // The Arabic footer read "5 rooms · 0 نزلاء تمت خدمتهم".
  const files = ['Hud', 'BuildPanel', 'RoomSheet', 'ShiftPanel', 'SettingsSheet', 'WelcomeBack'];
  const suspicious: string[] = [];
  for (const name of files) {
    const src = fs.readFileSync(`src/ui/${name}.tsx`, 'utf8');
    // A bare English word sitting between JSX expressions inside a sentence.
    for (const m of src.matchAll(/\}\s+([a-z]{3,})\s+[·{]/g)) {
      suspicious.push(`${name}.tsx: "${m[1]}"`);
    }
  }
  assert(suspicious.length === 0, `untranslated words in translated text: ${suspicious.join(', ')}`);
});

check('the debug badge is reachable in a deployed build', () => {
  // Hiding it outside development put the diagnostic surface exactly where it
  // could not be read.
  const badge = fs.readFileSync('src/ui/DebugBadge.tsx', 'utf8');
  assert(/URLSearchParams/.test(badge) && /debug/.test(badge),
    'the badge cannot be turned on in a production build');
});

check('the shop, the season and the gift all reach a screen', () => {
  // Three systems the document promised in P6 and that were never built. The
  // failure mode after building them is the one this project keeps having:
  // logic that works and nothing that shows it.
  const reach = (fn: string, exclude: string) => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        const full = `${dir}/${name}`;
        if (fs.statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(name) || full.includes(exclude)) continue;
        if (new RegExp(`${fn}\\s*\\(`).test(fs.readFileSync(full, 'utf8'))) found.push(full);
      }
    };
    walk('src/ui');
    return found;
  };
  assert(reach('shopSlots', 'selectors').length > 0, 'no screen shows the shop');
  assert(reach('seasonBanner', 'selectors').length > 0, 'no screen shows a running event');
  assert(reach('dailyGift', 'selectors').length > 0, 'no screen offers the daily gift');
  assert(reach('cityView', 'selectors').length > 0, 'no screen shows the city');
});

check('the running game announces which build it is', () => {
  // Two verification rounds were spent discovering a deployment was simply out
  // of date. A build that names itself turns that into a five-second check.
  const config = fs.readFileSync('vite.config.ts', 'utf8');
  assert(/__BUILD_ID__/.test(config), 'the build injects no identifier');
  assert(/__BUILD_ASSETS__/.test(config), 'the build does not record how many assets it expects');

  const main = fs.readFileSync('src/main.tsx', 'utf8');
  assert(/__BUILD_ID__/.test(main), 'nothing prints the build identifier at boot');
  assert(/window\.hct/.test(main),
    'there is no diagnostic that survives the interface failing to render');

  const badge = fs.readFileSync('src/ui/DebugBadge.tsx', 'utf8');
  assert(/__BUILD_ID__/.test(badge), 'the badge does not show which build it belongs to');
});

check('a stale deployment reports itself as one', () => {
  const canvas = fs.readFileSync('src/ui/HotelCanvas.tsx', 'utf8');
  assert(/declaredAssetCount\s*\(/.test(canvas),
    'missing textures are counted without comparing against what this build expects');
});

check('the bridge does not import back into itself through the core', () => {
  // characters → guests → selectors → characters resolved to undefined at
  // module load and took three tests down with a message about a function
  // that plainly existed. A cycle fails as `undefined`, not as an error.
  const guests = fs.readFileSync('src/core/systems/guests.ts', 'utf8');
  assert(!/from '\.\.\/\.\.\/bridge/.test(guests), 'a core system imports the bridge');
  const characters = fs.readFileSync('src/bridge/characters.ts', 'utf8');
  const coreImports = [...characters.matchAll(/from '\.\.\/core\/([\w/.]+)'/g)].map((m) => m[1]!);
  for (const path of coreImports) {
    if (!path.startsWith('systems/')) continue;
    const target = fs.readFileSync(`src/core/${path}`, 'utf8');
    assert(!/from '\.\.\/\.\.\/bridge/.test(target) && !/selectors/.test(target),
      `src/core/${path} is imported by the bridge and reaches back toward it`);
  }
});

check('every data file states an honest tuning status (6A)', () => {
  // "Provisional, awaiting a sim that ran a dozen phases ago" is a record
  // lying about itself. The vocabulary is small and each word is earned:
  // original-snapshot (verbatim tables), original-model (the original's
  // mechanic, our numbers where the source is silent), designed (ours),
  // parked-by-decision (deliberately out of reach).
  const files = fs.readdirSync('data').filter((f) => f.endsWith('.json'));
  const honest = /^(original-snapshot-|original-model-|designed-|parked-by-decision-)/;
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(`data/${f}`, 'utf8')) as Record<string, unknown>;
    assert(typeof d['version'] === 'number', `${f} has no version`);
    const status = d['tuningStatus'];
    assert(typeof status === 'string' && honest.test(status),
      `${f} claims "${String(status)}" — not in the honest vocabulary`);
    assert(!/provisional|awaiting/i.test(String(status)), `${f} still calls itself provisional`);
  }
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
