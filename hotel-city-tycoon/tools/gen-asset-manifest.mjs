/**
 * Derives the complete list of art files the game needs from data/*.json.
 *
 * The data already declares an assetKey for every room, guest, staff role,
 * decor item and event. This turns those keys into a manifest of real files
 * with real dimensions, so nobody has to guess what to draw or what to name it.
 *
 * Run: node tools/gen-asset-manifest.mjs
 */
import fs from 'node:fs';

const R = (f) => JSON.parse(fs.readFileSync(`data/${f}`, 'utf8'));
const rooms = R('rooms.json').rooms;
const decor = R('decor.json').items;
const staff = R('staff.json').roles;
const guests = R('guests.json').types;
const events = R('events.json').events;

// Must match src/render/layout.ts
const BLOCK_W = 128;
const BLOCK_H = 96;

/** Variants each kind of subject needs. */
const ROOM_VARIANTS = ['base', 'night', 'dirty', 'pest', 'thumb'];
const CHARACTER_VARIANTS = ['idle', 'walk', 'thumb'];
const STAFF_EXTRA = ['work'];
const GUEST_EXTRA = ['sleep'];

const entries = [];
const add = (e) => entries.push(e);

// ---- rooms: sized to their block footprint --------------------------------
for (const room of rooms) {
  const w = room.blocks.w * BLOCK_W;
  const h = room.blocks.h * BLOCK_H;
  for (const variant of ROOM_VARIANTS) {
    const thumb = variant === 'thumb';
    add({
      key: `room.${room.id}.${variant}`,
      bundle: 'rooms',
      file: `rooms/${room.id}_${variant}.png`,
      width: thumb ? 96 : w,
      height: thumb ? 96 : h,
      required: variant === 'base',
      note: {
        base: 'Interior seen from the front, wall removed. Empty of furniture — decor is layered on top.',
        night: 'Same room, lamps lit, cooler ambient.',
        dirty: 'Same room with grime, litter, unmade bed.',
        pest: 'Overlay only: transparent PNG with roaches. Composited over base.',
        thumb: 'Square icon for the build menu.',
      }[variant],
    });
  }
}

// ---- decor: single sprites, sized by slot ---------------------------------
// Equipment — the washers, treadmills and shelving the service rooms are
// furnished with — is drawn on the wall canvas rather than the floor one: a
// machine is a tall box, and 72x72 crops the top off every one of them.
const SLOT_SIZE = {
  wall: [96, 72], floor: [72, 72], ceiling: [72, 48], bed: [104, 64], equipment: [96, 72],
};
for (const item of decor) {
  const [w, h] = SLOT_SIZE[item.slotType] ?? [72, 72];
  add({
    key: item.assetKey,
    bundle: 'decor',
    file: `decor/${item.id}.png`,
    width: w,
    height: h,
    required: item.unlockLevel <= 5,
    note: `${item.category} · tier ${item.tier} · transparent background`,
  });
}

// ---- characters -----------------------------------------------------------
const CHAR_W = 48;
const CHAR_H = 72;
const WALK_FRAMES = 6;
for (const role of staff) {
  for (const variant of [...CHARACTER_VARIANTS, ...STAFF_EXTRA]) {
    add({
      key: `staff.${role.id}.${variant}`,
      bundle: 'characters',
      file: `characters/staff_${role.id}_${variant}.png`,
      // A walk sheet is six frames laid out horizontally, so its declared
      // width is the whole strip. Declaring one frame's width made the
      // manifest disagree with its own note.
      width: variant === 'thumb' ? 64 : variant === 'walk' ? CHAR_W * WALK_FRAMES : CHAR_W,
      height: variant === 'thumb' ? 64 : CHAR_H,
      required: variant === 'idle',
      note: variant === 'walk'
        ? `Sprite sheet, ${WALK_FRAMES} frames horizontal (${CHAR_W * WALK_FRAMES}x${CHAR_H} total)`
        : 'Single frame, transparent',
    });
  }
}
for (const guest of guests) {
  for (const variant of [...CHARACTER_VARIANTS, ...GUEST_EXTRA]) {
    add({
      key: `guest.${guest.id}.${variant}`,
      bundle: 'characters',
      file: `characters/guest_${guest.id}_${variant}.png`,
      width: variant === 'thumb' ? 64 : variant === 'walk' ? CHAR_W * WALK_FRAMES : CHAR_W,
      height: variant === 'thumb' ? 64 : CHAR_H,
      required: variant === 'idle',
      note: variant === 'walk'
        ? `Sprite sheet, ${WALK_FRAMES} frames horizontal (${CHAR_W * WALK_FRAMES}x${CHAR_H} total)`
        : 'Single frame, transparent',
    });
  }
}

// ---- events ---------------------------------------------------------------
for (const event of events) {
  add({
    key: event.assetKey,
    bundle: 'effects',
    file: `effects/${event.id}.png`,
    width: 64,
    height: 64,
    required: true,
    note: 'Overlay or badge, transparent background',
  });
}

// ---- ui -------------------------------------------------------------------
const UI = [
  ['ui.currency.coins', 'ui/coins.png', 48, 48],
  ['ui.currency.gems', 'ui/gems.png', 48, 48],
  ['ui.shift.2h', 'ui/shift_2h.png', 64, 64],
  ['ui.shift.6h', 'ui/shift_6h.png', 64, 64],
  ['ui.shift.12h', 'ui/shift_12h.png', 64, 64],
  ['ui.shift.24h', 'ui/shift_24h.png', 64, 64],
  ['ui.shift.48h', 'ui/shift_48h.png', 64, 64],
];
for (const [key, file, width, height] of UI) {
  add({ key, bundle: 'ui', file, width, height, required: true, note: 'Icon, transparent background' });
}

// ---- resolution tiers: declared only when every file exists at that tier ---
//
// HC-P1-S2. The manifest used to hard-code `resolutions: [1, 2]`. The loader
// trusts that list: any device with devicePixelRatio >= 2 — every modern
// phone — asked for `/assets/@2x/<file>`, the @2x tree had never been drawn,
// and all 241 textures failed at once (BL-016). A tier is a promise that the
// files exist, so it is derived from the disk rather than typed in.
const CANDIDATE_TIERS = [2];
const tierComplete = (tier) => entries.every((e) => fs.existsSync(`public/assets/@${tier}x/${e.file}`));
const resolutions = [1, ...CANDIDATE_TIERS.filter(tierComplete)];

const manifest = {
  version: 1,
  note: 'Generated by tools/gen-asset-manifest.mjs. Do not hand-edit; change the data instead.',
  blockSize: { w: BLOCK_W, h: BLOCK_H },
  // Only tiers whose full tree is on disk. A partial @2x delivery stays
  // undeclared until it is complete; the loader falls back per file anyway.
  resolutions,
  format: 'png',
  bundles: ['rooms', 'decor', 'characters', 'effects', 'ui'],
  entries: entries.sort((a, b) => a.key.localeCompare(b.key)),
};

fs.mkdirSync('public/assets', { recursive: true });
fs.writeFileSync('public/assets/manifest.json', JSON.stringify(manifest, null, 2) + '\n');

const required = entries.filter((e) => e.required).length;
const byBundle = {};
for (const e of entries) byBundle[e.bundle] = (byBundle[e.bundle] ?? 0) + 1;
console.log(`public/assets/manifest.json -> ${entries.length} entries (${required} required to launch)`);
console.log(`  resolutions  ${JSON.stringify(resolutions)}${resolutions.length === 1 ? '  (no complete @2x tree on disk)' : ''}`);
for (const [bundle, n] of Object.entries(byBundle)) console.log(`  ${bundle.padEnd(12)} ${n}`);
