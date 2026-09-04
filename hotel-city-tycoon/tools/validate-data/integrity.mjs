#!/usr/bin/env node
/**
 * Cross-reference integrity checker for data/*.json
 *
 * Zero dependencies on purpose: this must run in any environment, including
 * a cold checkout with no node_modules. Shape validation lives in schema.ts
 * (Zod); this file checks the things a schema cannot — that every id one file
 * points at actually exists in another.
 *
 * Exit code 1 on any error. Warnings do not fail the build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = path.join(ROOT, 'data');

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

const FILES = [
  'economy.json', 'rooms.json', 'shifts.json', 'stars.json',
  'guests.json', 'staff.json', 'events.json', 'plots.json',
  'decor.json', 'levels.json', 'objectives.json', 'upgrades.json', 'shop.json', 'seasons.json', 'gifts.json', 'neighbours.json',
];

// ---------------------------------------------------------------- load
const D = {};
for (const f of FILES) {
  const p = path.join(DATA, f);
  if (!fs.existsSync(p)) { err(f, 'file is missing'); continue; }
  try {
    D[f] = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    err(f, `invalid JSON — ${e.message}`);
  }
}
if (errors.length) { report(); process.exit(1); }

// ---------------------------------------------------------------- indexes
const rooms = D['rooms.json'].rooms;
const roomIds = new Set(rooms.map(r => r.id));
const staffRoles = D['staff.json'].roles;
const staffIds = new Set(staffRoles.map(r => r.id));
const guestTypes = D['guests.json'].types;
const guestIds = new Set(guestTypes.map(g => g.id));
const shiftIds = new Set(D['shifts.json'].shifts.map(s => s.id));
const plotIds = new Set(D['plots.json'].expansions.map(p => p.id));
const decorItems = D['decor.json'].items;
const levels = D['levels.json'].levels;
const maxLevel = D['levels.json'].maxLevel;
const desireTags = new Set(D['guests.json'].desireTags);
const currencies = new Set(Object.keys(D['economy.json'].currencies));

// ---------------------------------------------------------------- 1. unique ids
const dupCheck = (file, list, label) => {
  const seen = new Set();
  for (const item of list) {
    if (seen.has(item.id)) err(file, `duplicate ${label} id "${item.id}"`);
    seen.add(item.id);
  }
};
dupCheck('rooms.json', rooms, 'room');
dupCheck('staff.json', staffRoles, 'staff role');
dupCheck('guests.json', guestTypes, 'guest type');
dupCheck('decor.json', decorItems, 'decor item');
dupCheck('plots.json', D['plots.json'].expansions, 'plot');
dupCheck('shifts.json', D['shifts.json'].shifts, 'shift');
dupCheck('events.json', D['events.json'].events, 'event');

// ---------------------------------------------------------------- 2. unlockLevel bounds
// PARKED convention (3B): unlockLevel === maxLevel + 1 marks content that is
// deliberately switched off by data — schema-valid, one past the last level a
// player can reach, and exempt from the level table below. Anything else
// beyond maxLevel is still an error.
const PARKED = maxLevel + 1;
const isParked = (item) => item.unlockLevel === PARKED;
const levelBound = (file, list) => {
  for (const item of list) {
    if (typeof item.unlockLevel !== 'number') continue;
    if (isParked(item)) continue;
    if (item.unlockLevel < 1 || item.unlockLevel > maxLevel) {
      err(file, `"${item.id}" unlockLevel ${item.unlockLevel} outside 1..${maxLevel} (nor parked at ${PARKED})`);
    }
  }
};
levelBound('rooms.json', rooms);
levelBound('staff.json', staffRoles);
levelBound('guests.json', guestTypes);
levelBound('decor.json', decorItems);
levelBound('plots.json', D['plots.json'].expansions);
levelBound('shifts.json', D['shifts.json'].shifts);
levelBound('events.json', D['events.json'].events);

// ---------------------------------------------------------------- 3. room -> staff role
for (const r of rooms) {
  if (r.staffRole == null) continue;
  if (!staffIds.has(r.staffRole)) err('rooms.json', `room "${r.id}" needs unknown staff role "${r.staffRole}"`);
}
// ---------------------------------------------------------------- 4. staff role -> room types
for (const role of staffRoles) {
  for (const rt of role.roomTypes) {
    if (!roomIds.has(rt)) err('staff.json', `role "${role.id}" lists unknown room type "${rt}"`);
  }
}
// every role must be reachable from at least one room
for (const role of staffRoles) {
  const used = rooms.some(r => r.staffRole === role.id);
  if (!used) warn('staff.json', `role "${role.id}" is never requested by any room`);
}
// a staffed room must unlock no earlier than its role
for (const r of rooms) {
  if (!r.staffRole) continue;
  const role = staffRoles.find(x => x.id === r.staffRole);
  if (role && role.unlockLevel > r.unlockLevel) {
    err('staff.json', `room "${r.id}" unlocks at L${r.unlockLevel} but its role "${role.id}" needs L${role.unlockLevel}`);
  }
}

// ---------------------------------------------------------------- 5. currencies
const priceCheck = (file, id, cost) => {
  if (!cost) return;
  const cur = cost.currency ?? cost;
  if (typeof cur === 'string' && !currencies.has(cur)) err(file, `"${id}" uses unknown currency "${cur}"`);
};
rooms.forEach(r => priceCheck('rooms.json', r.id, r.cost));
decorItems.forEach(d => priceCheck('decor.json', d.id, d.cost));
D['shifts.json'].shifts.forEach(s => priceCheck('shifts.json', s.id, { currency: s.currency }));

// ---------------------------------------------------------------- 6. desire tags
for (const r of rooms) {
  if (r.category !== 'commercial') continue;
  if (!desireTags.has(r.desireTag)) err('rooms.json', `room "${r.id}" has unknown desireTag "${r.desireTag}"`);
}
for (const tag of desireTags) {
  if (!rooms.some(r => r.desireTag === tag)) err('guests.json', `desireTag "${tag}" is satisfiable by no room — guests could want it forever`);
}

// ---------------------------------------------------------------- 7. economy starting state
const start = D['economy.json'].start;
for (const id of start.prebuiltRooms) {
  if (!roomIds.has(id)) err('economy.json', `start.prebuiltRooms references unknown room "${id}"`);
  const r = rooms.find(x => x.id === id);
  if (r && r.unlockLevel > start.level) err('economy.json', `start room "${id}" needs L${r.unlockLevel} but game starts at L${start.level}`);
}
const startBlocks = start.prebuiltRooms.reduce((n, id) => {
  const r = rooms.find(x => x.id === id);
  return n + (r ? r.blocks.w * r.blocks.h : 0);
}, 0);
if (startBlocks > start.plotBlocks) {
  err('economy.json', `starting rooms need ${startBlocks} blocks but the starting plot is only ${start.plotBlocks}`);
}
const firstPlot = D['plots.json'].expansions.find(p => p.unlockLevel === 1 && p.cost === 0);
if (!firstPlot) err('plots.json', 'no free starting plot at level 1');
else if (firstPlot.blocks !== start.plotBlocks) {
  err('plots.json', `free plot is ${firstPlot.blocks} blocks but economy.start.plotBlocks is ${start.plotBlocks}`);
}
// a room must fit inside the largest plot grid
const biggest = D['plots.json'].expansions.reduce((a, b) => (b.blocks > a.blocks ? b : a));
for (const r of rooms) {
  if (r.blocks.w > biggest.grid.w || r.blocks.h > biggest.grid.h) {
    err('rooms.json', `room "${r.id}" (${r.blocks.w}x${r.blocks.h}) does not fit the largest plot grid ${biggest.grid.w}x${biggest.grid.h}`);
  }
}

// ---------------------------------------------------------------- 8. levels
if (levels.length !== maxLevel) err('levels.json', `declares maxLevel ${maxLevel} but contains ${levels.length} entries`);
levels.forEach((l, i) => {
  if (l.level !== i + 1) err('levels.json', `entry ${i} has level ${l.level}, expected ${i + 1}`);
  if (i > 0 && l.xpTotal <= levels[i - 1].xpTotal) {
    err('levels.json', `L${l.level} xpTotal ${l.xpTotal} is not greater than L${l.level - 1}`);
  }
  // One source of truth for the curve: `xpToNext` is authored and `xpTotal` is
  // its running sum. Storing both invites them to drift, and the drift is
  // invisible — a level table that disagrees with itself still loads, still
  // looks reasonable, and quietly puts a milestone out of reach.
  if (i > 0) {
    const expected = levels[i - 1].xpTotal + (levels[i - 1].xpToNext ?? 0);
    if (l.xpTotal !== expected) {
      err('levels.json', `L${l.level} xpTotal is ${l.xpTotal}; the running sum of xpToNext gives ${expected}`);
    }
  }
  for (const u of l.unlocks) {
    const pool = { room: roomIds, staffRole: staffIds, guestType: guestIds, shift: shiftIds, plot: plotIds }[u.kind];
    if (!pool) err('levels.json', `L${l.level} has unknown unlock kind "${u.kind}"`);
    else if (!pool.has(u.id)) err('levels.json', `L${l.level} unlocks unknown ${u.kind} "${u.id}"`);
  }
});
// every unlockable must appear on the level table exactly once
const declared = new Map();
levels.forEach(l => l.unlocks.forEach(u => declared.set(`${u.kind}:${u.id}`, l.level)));
const expect = (kind, list) => list.forEach(item => {
  if (isParked(item)) {
    if (declared.has(`${kind}:${item.id}`)) err('levels.json', `${kind} "${item.id}" is parked at ${PARKED} but still appears on the level table`);
    return;
  }
  const key = `${kind}:${item.id}`;
  if (!declared.has(key)) err('levels.json', `${kind} "${item.id}" (L${item.unlockLevel}) is missing from the level table`);
  else if (declared.get(key) !== item.unlockLevel) {
    err('levels.json', `${kind} "${item.id}" listed at L${declared.get(key)} but its own unlockLevel is ${item.unlockLevel}`);
  }
});
expect('room', rooms);
expect('staffRole', staffRoles);
expect('guestType', guestTypes);
expect('shift', D['shifts.json'].shifts);
expect('plot', D['plots.json'].expansions);

// ---------------------------------------------------------------- 9. stars
const tiers = D['stars.json'].tiers;
tiers.forEach((t, i) => {
  if (t.stars !== i + 1) err('stars.json', `tier ${i} has stars ${t.stars}, expected ${i + 1}`);
  if (i > 0) {
    const p = tiers[i - 1];
    if (t.minAvgDecorFill < p.minAvgDecorFill) err('stars.json', `${t.stars}★ decor requirement is lower than ${p.stars}★`);
    if (t.incomeMultiplier < p.incomeMultiplier) err('stars.json', `${t.stars}★ income multiplier is lower than ${p.stars}★`);
  }
});
if (!tiers.some(t => t.stars === start.stars)) err('economy.json', `start.stars ${start.stars} has no matching tier`);

// ---------------------------------------------------------------- 10. decor
const decorCats = new Set(D['decor.json'].categories);
const decorSlots = new Set(D['decor.json'].slotTypes);
const roomCats = new Set(rooms.map(r => r.category));
for (const d of decorItems) {
  if (!decorCats.has(d.category)) err('decor.json', `item "${d.id}" has category "${d.category}" not in categories[]`);
  if (!decorSlots.has(d.slotType)) err('decor.json', `item "${d.id}" has slotType "${d.slotType}" not in slotTypes[]`);
  // A room scope is a promise about where a piece can be bought. A typo in it
  // silently removes the piece from every list in the game, which is the sort
  // of thing nobody notices until a room has nothing left to buy.
  for (const token of d.roomScope ?? []) {
    if (token !== 'any' && !roomIds.has(token) && !roomCats.has(token)) {
      err('decor.json', `item "${d.id}" is scoped to "${token}", which is neither a room nor a room category`);
    }
  }
}
// The two rules that decide whether a piece may go in a room, mirrored from
// src/core/systems/quality.ts so the reachability check below asks the same
// question the game asks.
const slotTypeRooms = new Map(
  (D['economy.json'].roomQuality.slotTypeRooms ?? []).map(r => [r.slotType, r.categories]));
const fitsRoom = (d, r) => {
  const allowed = slotTypeRooms.get(d.slotType);
  if (allowed && allowed.length > 0 && !allowed.includes(r.category)) return false;
  const scope = d.roomScope ?? [];
  return scope.length === 0
    || scope.some(t => t === 'any' || t === r.category || t === r.id);
};
// a level-1 player must be able to start filling the meter
const l1Decor = decorItems.filter(d => d.unlockLevel === 1 && d.cost.currency === 'coins');
if (l1Decor.length < 3) err('decor.json', `only ${l1Decor.length} coin-priced decor items at L1 — a new player cannot fill a room`);
// every guest room's decorTarget must be reachable with items unlocked by then.
// Rooms the player starts with get zero grace — an unfillable meter in the
// tutorial is the exact frustration that sank the original game. Later rooms
// may be aspirational, but must become fillable within GRACE levels.
const GRACE = 5;
const startRooms = new Set(start.prebuiltRooms);
for (const r of rooms) {
  if (r.decorTarget === 0) continue;
  const by = startRooms.has(r.id) ? r.unlockLevel : Math.min(maxLevel, r.unlockLevel + GRACE);
  // Scoped to the room's own catalogue. Unscoped, this check certified the
  // lobby as fillable by counting bed_cot — which slotAllowed has always
  // refused to install in a functional room.
  const avail = decorItems
    .filter(d => d.unlockLevel <= by && d.cost.currency === 'coins' && fitsRoom(d, r))
    .sort((a, b) => b.decorPoints - a.decorPoints)
    .slice(0, r.decorSlots)
    .reduce((n, d) => n + d.decorPoints, 0);
  if (avail < r.decorTarget) {
    err('decor.json', `room "${r.id}" needs ${r.decorTarget} decor points but only ${avail} is reachable by L${by} with ${r.decorSlots} slots`);
  }
}

// ---------------------------------------------------------------- 11. events
for (const e of D['events.json'].events) {
  const t = e.trigger ?? {};
  if (t.kind === 'guestSpecial' && !guestIds.has(t.guestTypeId)) {
    err('events.json', `event "${e.id}" targets unknown guest type "${t.guestTypeId}"`);
  }
}
// ---------------------------------------------------------------- 12. asset keys
const keyRe = /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;
const allAssets = [];
const collect = (file, list) => list.forEach(i => { if (i.assetKey) allAssets.push([file, i.id, i.assetKey]); });
collect('rooms.json', rooms); collect('staff.json', staffRoles);
collect('guests.json', guestTypes); collect('decor.json', decorItems);
collect('events.json', D['events.json'].events); collect('shifts.json', D['shifts.json'].shifts);
for (const [file, id, key] of allAssets) {
  if (!keyRe.test(key)) err(file, `"${id}" has malformed assetKey "${key}"`);
}

// ---------------------------------------------------------------- 13. i18n keys
// Every nameKey/descKey the data declares must exist in the primary locale.
// A player must never see a raw key like "room.deluxe.name" on screen.
const EN_PATH = path.join(ROOT, 'src/i18n/locales/en.json');
if (fs.existsSync(EN_PATH)) {
  const en = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'));
  const referenced = [];
  const collectKeys = (file, list) => list.forEach(i => {
    if (i.nameKey) referenced.push([file, i.id, i.nameKey]);
    if (i.descKey) referenced.push([file, i.id, i.descKey]);
  });
  collectKeys('rooms.json', rooms);
  collectKeys('decor.json', decorItems);
  collectKeys('staff.json', staffRoles);
  collectKeys('staff.json', D['staff.json'].grades.map(g => ({ ...g, nameKey: g.nameKey })));
  collectKeys('guests.json', guestTypes);
  collectKeys('shifts.json', D['shifts.json'].shifts);
  collectKeys('events.json', D['events.json'].events);
  for (const [file, id, key] of referenced) {
    if (!(key in en)) err(file, `"${id}" references i18n key "${key}" which is missing from en.json`);
  }
  const AR_PATH = path.join(ROOT, 'src/i18n/locales/ar.json');
  if (fs.existsSync(AR_PATH)) {
    const ar = JSON.parse(fs.readFileSync(AR_PATH, 'utf8'));
    const missing = Object.keys(en).filter(k => !(k in ar)).length;
    if (missing > 0) {
      warn('ar.json', `${missing} of ${Object.keys(en).length} keys missing — those fall back to English`);
    }
  }
} else {
  warn('i18n', 'en.json not found — key coverage not checked');
}

// ---------------------------------------------------------------- 14. asset manifest
// Every assetKey the data declares must resolve to a manifest entry, and the
// manifest must not promise files for keys nobody references.
const MANIFEST_PATH = path.join(ROOT, 'public/assets/manifest.json');
let assetSummary = null;
if (fs.existsSync(MANIFEST_PATH)) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const manifestKeys = new Set(manifest.entries.map(e => e.key));

  for (const [file, id, key] of allAssets) {
    // Room and character keys name a base variant; the manifest expands them.
    const hasExact = manifestKeys.has(key);
    const hasAny = [...manifestKeys].some(k => k.startsWith(key.split('.').slice(0, 2).join('.') + '.'));
    if (!hasExact && !hasAny) {
      err(file, `"${id}" declares assetKey "${key}" with no manifest entry — run tools/gen-asset-manifest.mjs`);
    }
  }

  // How much art actually exists on disk yet.
  let present = 0;
  const missingRequired = [];
  for (const entry of manifest.entries) {
    if (fs.existsSync(path.join(ROOT, 'public/assets', entry.file))) present++;
    else if (entry.required) missingRequired.push(entry.file);
  }
  assetSummary = {
    total: manifest.entries.length,
    present,
    required: manifest.entries.filter(e => e.required).length,
    missingRequired: missingRequired.length,
  };
  if (missingRequired.length > 0) {
    warn('assets', `${missingRequired.length} of ${assetSummary.required} required files not drawn yet — placeholders will be used`);
  }
} else {
  warn('assets', 'manifest.json not found — run tools/gen-asset-manifest.mjs');
}

// ---------------------------------------------------------------- report
function report() {
  const line = '─'.repeat(58);
  console.log(line);
  console.log('  Hotel City Tycoon — data integrity');
  console.log(line);
  for (const w of warnings) console.log(`  ! ${w}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  if (!errors.length) {
    console.log(`  ✓ ${FILES.length} files · ${rooms.length} rooms · ${decorItems.length} decor` +
                ` · ${staffRoles.length} roles · ${guestTypes.length} guest types · ${levels.length} levels`);
    console.log(`  ✓ all cross-references resolve`);
    if (assetSummary) {
      console.log(`  ✓ ${assetSummary.total} asset entries · ${assetSummary.present} drawn · ` +
                  `${assetSummary.required - assetSummary.missingRequired}/${assetSummary.required} required present`);
    }
  }
  console.log(line);
  console.log(`  ${errors.length} error(s), ${warnings.length} warning(s)`);
  console.log(line);
}
report();
process.exit(errors.length ? 1 : 0);
