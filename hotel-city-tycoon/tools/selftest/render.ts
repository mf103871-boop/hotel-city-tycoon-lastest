/**
 * Headless tests for the parts of the render layer that are pure maths.
 *
 * Pixi itself cannot be exercised without a browser, so the camera, culling,
 * pooling and layout rules were deliberately written as plain functions. That
 * is most of what actually goes wrong in a 2D renderer — a clamp that traps
 * the camera, a cull that hides the wrong thing, a pool that leaks.
 *
 * Run: node --experimental-strip-types tools/selftest/render.ts
 */
import {
  clampZoom, clampCamera, worldToScreen, screenToWorld, pan, zoomAt,
  fitCamera, visibleRect, MIN_ZOOM, MAX_ZOOM,
} from '../../src/render/camera.ts';
import type { CameraState, Viewport, WorldBounds } from '../../src/render/camera.ts';
import { cull, intersects, expand } from '../../src/render/culling.ts';
import { Pool, KeyedPool } from '../../src/render/pool.ts';
import {
  blockToWorld, worldToBlock, roomWorldRect, plotWorldBounds, anchorToLocalPx,
  BLOCK_W, BLOCK_H, ANCHOR_UNITS_PER_BLOCK,
} from '../../src/render/layout.ts';
import {
  decorArtSpec, decorDrawSize, compareDecorDraw, knownDecorCategories, DECOR_ART_SCALE,
} from '../../src/render/decorArt.ts';
import type { DecorOrderable } from '../../src/render/decorArt.ts';
import { clampDecorBox, decorBox } from '../../src/render/decorArt.ts';
import {
  firstFreeAnchor, anchorBoundsFor, anchorKey, anchorReachFor, reachForCategory, reachedCategories,
} from '../../src/core/systems/decorPlacement.ts';
import { loadSimData } from '../balance-sim/load-data.ts';
import fs from 'node:fs';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }
function near(a: number, b: number, m: string, eps = 0.001): void {
  if (Math.abs(a - b) > eps) throw new Error(`${m} (got ${a}, expected ~${b})`);
}

const VIEW: Viewport = { width: 390, height: 780 };          // a phone
const WORLD: WorldBounds = { x: 0, y: 0, width: 4000, height: 3000 };

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — render maths self-test');
console.log(line);

// ---------------------------------------------------------------- camera
check('zoom stays within its limits', () => {
  eq(clampZoom(0.001), MIN_ZOOM, 'zoom below the floor');
  eq(clampZoom(999), MAX_ZOOM, 'zoom above the ceiling');
  eq(clampZoom(1), 1, 'a legal zoom was changed');
});

check('world and screen conversions are exact inverses', () => {
  const cam: CameraState = { x: 1234, y: 567, zoom: 1.7 };
  for (const p of [{ x: 0, y: 0 }, { x: 390, y: 780 }, { x: 195, y: 390 }]) {
    const back = worldToScreen(screenToWorld(p, cam, VIEW), cam, VIEW);
    near(back.x, p.x, 'x did not survive the round trip');
    near(back.y, p.y, 'y did not survive the round trip');
  }
});

check('the camera cannot be dragged off the hotel', () => {
  let cam: CameraState = { x: 2000, y: 1500, zoom: 1 };
  for (let i = 0; i < 200; i++) cam = pan(cam, 500, 500, VIEW, WORLD);
  const rect = visibleRect(cam, VIEW);
  assert(rect.x >= WORLD.x - 0.001, `camera escaped left (${rect.x})`);
  assert(rect.y >= WORLD.y - 0.001, `camera escaped top (${rect.y})`);
  for (let i = 0; i < 400; i++) cam = pan(cam, -500, -500, VIEW, WORLD);
  const rect2 = visibleRect(cam, VIEW);
  assert(rect2.x + rect2.width <= WORLD.x + WORLD.width + 0.001, 'camera escaped right');
  assert(rect2.y + rect2.height <= WORLD.y + WORLD.height + 0.001, 'camera escaped bottom');
});

check('a world smaller than the screen is centred, not cornered', () => {
  const tiny: WorldBounds = { x: 0, y: 0, width: 100, height: 100 };
  const cam = clampCamera({ x: 9999, y: -9999, zoom: 1 }, VIEW, tiny);
  near(cam.x, 50, 'small world not centred horizontally');
  near(cam.y, 50, 'small world not centred vertically');
});

check('pinch zoom keeps the anchored point under the finger', () => {
  const cam: CameraState = { x: 2000, y: 1500, zoom: 1 };
  const finger = { x: 100, y: 600 };
  const worldBefore = screenToWorld(finger, cam, VIEW);
  const zoomed = zoomAt(cam, 1.8, finger, VIEW, WORLD);
  const worldAfter = screenToWorld(finger, zoomed, VIEW);
  near(worldAfter.x, worldBefore.x, 'the world slid under the finger horizontally', 0.5);
  near(worldAfter.y, worldBefore.y, 'the world slid under the finger vertically', 0.5);
});

check('zoom limits still hold when anchored', () => {
  let cam: CameraState = { x: 2000, y: 1500, zoom: 1 };
  for (let i = 0; i < 50; i++) cam = zoomAt(cam, 1.5, { x: 195, y: 390 }, VIEW, WORLD);
  assert(cam.zoom <= MAX_ZOOM + 1e-9, `zoom ran past the ceiling (${cam.zoom})`);
  for (let i = 0; i < 100; i++) cam = zoomAt(cam, 0.5, { x: 195, y: 390 }, VIEW, WORLD);
  assert(cam.zoom >= MIN_ZOOM - 1e-9, `zoom ran past the floor (${cam.zoom})`);
});

// AUDIT 2026-09-03 (D20): the clamp knew nothing about the HUD, so at any
// zoom above the default fit the ground row sat under the ~270px footer and
// could not be panned into view.
check('the camera lets the ground row clear the bottom bar', () => {
  const insets = { top: 96, bottom: 270 };
  const low = clampCamera({ x: 2000, y: 99999, zoom: 1 }, VIEW, WORLD, insets);
  near(worldToScreen({ x: 0, y: WORLD.height }, low, VIEW).y, VIEW.height - insets.bottom,
    'the world bottom cannot rise above the footer');
  const high = clampCamera({ x: 2000, y: -99999, zoom: 1 }, VIEW, WORLD, insets);
  near(worldToScreen({ x: 0, y: 0 }, high, VIEW).y, insets.top,
    'the world top cannot come down to the header');
  // Without insets nothing changes for the existing callers.
  const plain = clampCamera({ x: 2000, y: 99999, zoom: 1 }, VIEW, WORLD);
  near(worldToScreen({ x: 0, y: WORLD.height }, plain, VIEW).y, VIEW.height, 'insets changed the default clamp');
});

check('a small hotel is centred in the band between header and footer', () => {
  const small: WorldBounds = { x: 0, y: 0, width: 200, height: 100 };
  const insets = { top: 100, bottom: 300 };
  const cam = fitCamera(VIEW, small, insets);
  near(worldToScreen({ x: 100, y: 50 }, cam, VIEW).y, (insets.top + (VIEW.height - insets.bottom)) / 2,
    'the hotel is not centred in the visible band');
  assert(cam.zoom * small.height <= VIEW.height - insets.top - insets.bottom, 'the fit ignores the band height');
});

check('fitCamera shows the whole hotel', () => {
  const small: WorldBounds = { x: 0, y: 0, width: 1200, height: 900 };
  const cam = fitCamera(VIEW, small);
  const rect = visibleRect(cam, VIEW);
  assert(rect.width >= small.width - 1 || cam.zoom <= MIN_ZOOM + 1e-9,
    `fit view is narrower than the world (${rect.width} vs ${small.width})`);
});

// ---------------------------------------------------------------- culling
check('culling keeps what is on screen and drops what is not', () => {
  const view: WorldBounds = { x: 0, y: 0, width: 1000, height: 1000 };
  const items = [
    { x: 100, y: 100, width: 50, height: 50 },      // inside
    { x: 5000, y: 5000, width: 50, height: 50 },    // far away
    { x: -25, y: 500, width: 50, height: 50 },      // straddling the edge
  ];
  const { visible, hidden } = cull(items, view, 0);
  assert(visible.includes(0), 'an on-screen item was culled');
  assert(hidden.includes(1), 'an off-screen item was drawn');
  assert(visible.includes(2), 'an item straddling the edge was culled');
});

check('the cull margin prepares items just outside the view', () => {
  const view: WorldBounds = { x: 0, y: 0, width: 100, height: 100 };
  const item = [{ x: 150, y: 0, width: 10, height: 10 }];
  eq(cull(item, view, 0).visible.length, 0, 'item was visible with no margin');
  eq(cull(item, view, 200).visible.length, 1, 'margin did not include a nearby item');
});

check('every item is either visible or hidden, never both or neither', () => {
  const view: WorldBounds = { x: 0, y: 0, width: 800, height: 600 };
  const items = Array.from({ length: 500 }, (_, i) => ({
    x: (i * 137) % 3000, y: (i * 89) % 2000, width: 60, height: 60,
  }));
  const { visible, hidden } = cull(items, view);
  eq(visible.length + hidden.length, items.length, 'items were lost or duplicated by culling');
  eq(new Set([...visible, ...hidden]).size, items.length, 'an item appeared in both lists');
});

check('intersects and expand agree with each other', () => {
  const r: WorldBounds = { x: 10, y: 10, width: 10, height: 10 };
  assert(!intersects(r, { x: 30, y: 10, width: 5, height: 5 }), 'false positive');
  assert(intersects(expand(r, 20), { x: 30, y: 10, width: 5, height: 5 }), 'expand did not widen the test');
});

// ---------------------------------------------------------------- pooling
check('a pool recycles rather than allocating', () => {
  let created = 0;
  const pool = new Pool<{ id: number }>({ create: () => ({ id: created++ }) });
  const a = pool.acquire()!;
  pool.release(a);
  const b = pool.acquire()!;
  eq(created, 1, 'the pool allocated a second object instead of recycling');
  eq(a, b, 'the pool handed back a different object');
});

check('a pool resets objects on release', () => {
  const pool = new Pool<{ used: boolean }>({
    create: () => ({ used: false }),
    activate: (i) => { i.used = true; },
    reset: (i) => { i.used = false; },
  });
  const item = pool.acquire()!;
  eq(item.used, true, 'activate did not run');
  pool.release(item);
  eq(item.used, false, 'reset did not run — state would leak into the next user');
});

check('a pool respects its ceiling', () => {
  const pool = new Pool<object>({ create: () => ({}), max: 3 });
  for (let i = 0; i < 3; i++) assert(pool.acquire() !== null, 'pool refused within its limit');
  eq(pool.acquire(), null, 'pool grew past its ceiling');
});

check('prewarming means the first frames allocate nothing', () => {
  let created = 0;
  const pool = new Pool<object>({ create: () => { created++; return {}; }, prewarm: 20 });
  eq(created, 20, 'prewarm did not build objects up front');
  for (let i = 0; i < 20; i++) pool.acquire();
  eq(created, 20, 'the pool allocated during use despite prewarming');
});

check('a keyed pool tracks entities appearing and leaving', () => {
  let created = 0;
  const pool = new KeyedPool<{ n: number }>({ create: () => ({ n: created++ }) });

  let r = pool.sync(['g1', 'g2', 'g3']);
  eq(r.added.length, 3, 'wrong number of views created');
  eq(pool.size, 3, 'wrong live count');

  r = pool.sync(['g2', 'g3', 'g4']);
  eq(r.removed.length, 1, 'a departed guest kept its view');
  eq(r.added.length, 1, 'a new guest got no view');
  // Three, not four: g1's view was released and handed straight to g4.
  eq(created, 3, 'the pool allocated a new view instead of recycling the departed one');

  pool.clear();
  eq(pool.size, 0, 'clear left views behind');
});

check('a keyed pool never leaks across a busy churn', () => {
  let created = 0;
  const pool = new KeyedPool<object>({ create: () => { created++; return {}; } });
  for (let frame = 0; frame < 200; frame++) {
    pool.sync(Array.from({ length: 12 }, (_, i) => `g${frame}_${i}`));
  }
  eq(pool.size, 12, 'live set drifted');
  assert(created <= 24, `pool allocated ${created} objects over 200 frames of churn`);
  console.log(`      200 frames of full churn allocated ${created} objects total`);
});

// ---------------------------------------------------------------- layout
check('block and world coordinates are exact inverses', () => {
  const plotH = 10;
  for (const [bx, by] of [[0, 0], [3, 7], [9, 9]] as const) {
    const world = blockToWorld(bx, by, plotH);
    const back = worldToBlock(world.x, world.y, plotH);
    eq(back.x, bx, 'x did not survive the round trip');
    eq(back.y, by, 'y did not survive the round trip');
  }
});

check('the ground row sits at the bottom of the world', () => {
  const plotH = 6;
  const ground = blockToWorld(0, 0, plotH);
  const top = blockToWorld(0, plotH - 1, plotH);
  assert(ground.y > top.y, 'the hotel is upside down — floor 0 must render below the top floor');
});

check('a multi-block room covers exactly its footprint', () => {
  const rect = roomWorldRect({ x: 2, y: 1, w: 3, h: 2 }, 8);
  eq(rect.width, 3 * BLOCK_W, 'wrong room width');
  eq(rect.height, 2 * BLOCK_H, 'wrong room height');
  eq(rect.x, 2 * BLOCK_W, 'wrong room x');
});

check('plot bounds leave sky above and street below', () => {
  const b = plotWorldBounds(10, 8);
  assert(b.y < 0, 'no sky margin above the hotel');
  assert(b.height > 8 * BLOCK_H, 'no street margin below the hotel');
  assert(b.x < 0, 'no margin beside the hotel');
});

// ------------------------------------------------------- decor art (HC-P1-S4)
//
// The contract that turns a DEC-010 anchor into a drawn sprite. It is checked
// against two sources that cannot be edited from here: the shipped catalogue
// in data/decor.json, and the anchors Codex declared in docs/ART-1_METADATA.md.

const simData = loadSimData();
const decorData = simData.decor;
const assetManifest = JSON.parse(fs.readFileSync('public/assets/manifest.json', 'utf8')) as {
  entries: Array<{ key: string; width: number; height: number }>;
};
const declaredSize = (assetKey: string): { w: number; h: number } => {
  const entry = assetManifest.entries.find((e) => e.key === assetKey);
  assert(entry, `no manifest entry for ${assetKey}`);
  return { w: entry.width, h: entry.height };
};

/** Transcribed from docs/ART-1_METADATA.md — the ten pieces ART-1 delivered. */
const ART1_ANCHORS: Array<[string, number, number, 'back' | 'front']> = [
  ['wallpaper_plain', 0.5, 0.5, 'back'],
  ['flooring_concrete', 0.5, 0.5, 'back'],
  ['wallArt_poster', 0.5, 0.5, 'back'],
  ['lighting_lamp', 0.5, 0, 'back'],
  ['bed_single', 0.5, 1, 'front'],
  ['seating_armchair', 0.5, 1, 'front'],
  ['table_deskWood', 0.5, 1, 'front'],
  ['plant_fern', 0.5, 1, 'front'],
  ['rug_mat', 0.5, 0.5, 'front'],
  ['luxury_aquarium', 0.5, 1, 'front'],
];

const pieceOf = (defId: string): DecorOrderable & { defId: string } => {
  const def = decorData.find((d) => d.id === defId);
  assert(def, `${defId} is not in data/decor.json`);
  return { id: defId, defId, category: def.category, slotType: def.slotType, localY: 8, zBias: 0 };
};

check('every catalogue category has its own art row, none falls back', () => {
  const known = new Set(knownDecorCategories());
  for (const item of decorData) {
    assert(known.has(item.category), `decor category "${item.category}" (${item.id}) has no art row`);
  }
});

check('the delivered ART-1 pieces get the anchors their metadata declares', () => {
  for (const [defId, anchorX, anchorY, band] of ART1_ANCHORS) {
    const piece = pieceOf(defId);
    const spec = decorArtSpec(piece.category, piece.slotType);
    eq(spec.anchorX, anchorX, `${defId} anchorX`);
    eq(spec.anchorY, anchorY, `${defId} anchorY`);
    eq(spec.band, band, `${defId} band`);
  }
});

check('an unknown category still lands on the surface its slot promises', () => {
  eq(decorArtSpec('brandNew', 'wall').band, 'back', 'an unknown wall piece left the wall');
  eq(decorArtSpec('brandNew', 'ceiling').anchorY, 0, 'an unknown ceiling piece does not hang');
  eq(decorArtSpec('brandNew', 'floor').anchorY, 1, 'an unknown floor piece does not stand');
  eq(decorArtSpec('brandNew', 'nonsense').band, 'front', 'an unknown slot type has no band');
});

check('decor is drawn at character scale, not one to one', () => {
  const size = decorDrawSize(104, 64);
  near(size.w, 104 * DECOR_ART_SCALE, 'bed width');
  near(size.h, 64 * DECOR_ART_SCALE, 'bed height');
  assert(DECOR_ART_SCALE < 1, 'the scale factor stopped shrinking anything');
});

check('every declared decor sprite fits inside a one-block room', () => {
  // The whole point of the scale factor: at 1:1 an armchair is three quarters
  // of a room tall (docs/art-1-shots/compose-1to1.png).
  const declared: Array<[number, number]> = [[96, 72], [72, 72], [72, 48], [104, 64]];
  for (const [w, h] of declared) {
    const size = decorDrawSize(w, h);
    assert(size.w <= BLOCK_W, `a ${w}x${h} piece is wider than a block (${size.w})`);
    assert(size.h <= BLOCK_H, `a ${w}x${h} piece is taller than a block (${size.h})`);
  }
});

check('a piece standing on the lowest anchor stays inside its room', () => {
  // The floor band anchor a 1x1 room hands out (decorPlacement inset of 1).
  const floorY = ANCHOR_UNITS_PER_BLOCK - 2;
  const at = anchorToLocalPx(ANCHOR_UNITS_PER_BLOCK / 2, floorY);
  const bed = decorDrawSize(104, 64);
  assert(at.y <= BLOCK_H, 'the floor anchor is already below the room');
  assert(at.y - bed.h >= 0, 'a bed on the floor anchor pokes through the ceiling');
  const lamp = decorDrawSize(72, 48);
  assert(anchorToLocalPx(8, 1).y + lamp.h <= BLOCK_H, 'a hanging lamp reaches past the floor');
});

check('surfaces draw behind everything that stands in the room', () => {
  const wallpaper = { ...pieceOf('wallpaper_plain'), localY: 14 };
  const chair = { ...pieceOf('seating_armchair'), localY: 2 };
  assert(compareDecorDraw(wallpaper, chair) < 0, 'a chair slid behind the wallpaper');
  assert(compareDecorDraw(chair, wallpaper) > 0, 'the comparator disagrees with itself');
});

check('wallpaper is behind its poster, and a rug is under the chair on it', () => {
  const wallpaper = pieceOf('wallpaper_plain');
  const poster = pieceOf('wallArt_poster');
  assert(compareDecorDraw(wallpaper, poster) < 0, 'the poster hid behind the wallpaper');
  const rug = pieceOf('rug_mat');
  const chair = pieceOf('seating_armchair');
  assert(compareDecorDraw(rug, chair) < 0, 'the rug covered the chair standing on it');
});

check('lower pieces draw nearer the viewer', () => {
  const back = { ...pieceOf('plant_fern'), id: 'a', localY: 4 };
  const front = { ...pieceOf('plant_fern'), id: 'b', localY: 12 };
  assert(compareDecorDraw(back, front) < 0, 'the far plant drew in front of the near one');
});

check('zBias still breaks a tie the art rules cannot', () => {
  const a = { ...pieceOf('plant_fern'), id: 'a', zBias: 2 };
  const b = { ...pieceOf('plant_fern'), id: 'b', zBias: -1 };
  assert(compareDecorDraw(a, b) > 0, 'zBias was ignored');
});

check('the draw order is total, so a redraw never reshuffles', () => {
  const pieces: DecorOrderable[] = [
    { ...pieceOf('plant_fern'), id: 'p2' },
    { ...pieceOf('plant_fern'), id: 'p1' },
    { ...pieceOf('wallpaper_plain'), id: 'w1' },
    { ...pieceOf('bed_single'), id: 'b1' },
    { ...pieceOf('rug_mat'), id: 'r1' },
  ];
  const first = [...pieces].sort(compareDecorDraw).map((p) => p.id).join(',');
  const again = [...pieces].reverse().sort(compareDecorDraw).map((p) => p.id).join(',');
  eq(again, first, 'the same pieces sorted two different ways');
  for (const a of pieces) {
    for (const b of pieces) {
      if (a.id === b.id) continue;
      assert(compareDecorDraw(a, b) !== 0, `${a.id} and ${b.id} tie, so their order is luck`);
    }
  }
});

check('a piece is drawn inside its own room, whatever anchor it was given', () => {
  const room = { w: BLOCK_W, h: BLOCK_H };
  // The worst anchor the S3 build could hand out: one unit from the corner.
  const at = anchorToLocalPx(1, 1);
  const spec = decorArtSpec('wallpaper', 'wall');
  const size = decorDrawSize(96, 72);
  const raw = decorBox(at, size, spec);
  assert(raw.left < 0, 'this test stopped testing anything: the raw box is already inside');
  const box = clampDecorBox(raw, room.w, room.h);
  assert(box.left >= 0 && box.top >= 0, 'a clamped piece still starts outside its room');
  assert(box.left + box.w <= room.w, 'a clamped piece still runs off the right of its room');
  assert(box.top + box.h <= room.h, 'a clamped piece still runs off the bottom of its room');
  eq(box.w, raw.w, 'clamping resized the art');
  eq(box.h, raw.h, 'clamping resized the art');
});

check('a piece already inside its room is left exactly where it is', () => {
  const raw = { left: 20, top: 30, w: 40, h: 20 };
  const box = clampDecorBox(raw, BLOCK_W, BLOCK_H);
  eq(box.left, raw.left, 'left moved');
  eq(box.top, raw.top, 'top moved');
});

check('a piece bigger than its room is centred, not shoved to a corner', () => {
  const box = clampDecorBox({ left: 0, top: 0, w: 200, h: 40 }, BLOCK_W, BLOCK_H);
  near(box.left, (BLOCK_W - 200) / 2, 'an oversized piece was not centred');
});

check('the core reach table and this art contract describe the same pictures', () => {
  // decorPlacement.ts holds the reach in anchor units because the core may not
  // import the renderer. This is the check that keeps the two in step: the
  // reach must be exactly the drawn extent, in units, rounded up.
  const ANCHOR_PX_X = BLOCK_W / ANCHOR_UNITS_PER_BLOCK;
  const ANCHOR_PX_Y = BLOCK_H / ANCHOR_UNITS_PER_BLOCK;
  for (const category of reachedCategories()) {
    const item = decorData.find((d) => d.category === category);
    assert(item, `no catalogue item in category ${category}`);
    const spec = decorArtSpec(item.category, item.slotType);
    const declared = declaredSize(item.assetKey);
    const size = decorDrawSize(declared.w, declared.h);
    const reach = reachForCategory(category);
    assert(reach, `${category} lost its reach row`);
    eq(reach.left, Math.ceil(size.w * spec.anchorX / ANCHOR_PX_X), `${category} left reach`);
    eq(reach.right, Math.ceil(size.w * (1 - spec.anchorX) / ANCHOR_PX_X), `${category} right reach`);
    eq(reach.up, Math.ceil(size.h * spec.anchorY / ANCHOR_PX_Y), `${category} up reach`);
    eq(reach.down, Math.ceil(size.h * (1 - spec.anchorY) / ANCHOR_PX_Y), `${category} down reach`);
  }
});

check('every catalogue piece placed today lands fully inside the smallest room', () => {
  // The end-to-end statement of the P1 gate "no position outside the room",
  // run over all 77 items in a 1x1 economy: place it the way PLACE_DECOR
  // would, draw it the way RoomView would, and see where it lands.
  const bounds = anchorBoundsFor(simData, 'economy');
  let checked = 0;
  for (const item of decorData) {
    const anchor = firstFreeAnchor(bounds, item.slotType, new Set<string>(), anchorReachFor(simData, item.id));
    const spec = decorArtSpec(item.category, item.slotType);
    const declared = declaredSize(item.assetKey);
    const box = decorBox(anchorToLocalPx(anchor.x, anchor.y), decorDrawSize(declared.w, declared.h), spec);
    assert(box.left >= 0, `${item.id} hangs ${(-box.left).toFixed(1)}px past the left wall`);
    assert(box.top >= 0, `${item.id} pokes ${(-box.top).toFixed(1)}px through the ceiling`);
    assert(box.left + box.w <= BLOCK_W, `${item.id} runs past the right wall`);
    assert(box.top + box.h <= BLOCK_H, `${item.id} runs past the floor`);
    // A new placement must never need the renderer's clamp.
    const clamped = clampDecorBox(box, BLOCK_W, BLOCK_H);
    eq(clamped.left, box.left, `${item.id} needed clamping straight after placement`);
    eq(clamped.top, box.top, `${item.id} needed clamping straight after placement`);
    checked++;
  }
  eq(checked, decorData.length, 'not every catalogue item was checked');
  console.log(`      ${checked} catalogue pieces placed and drawn inside a 1x1 room`);
});

check('anchors still avoid each other when the reach narrows the room', () => {
  const bounds = anchorBoundsFor(simData, 'economy');
  const reach = anchorReachFor(simData, 'plant_fern');
  const taken = new Set<string>();
  const cap = 24; // data/economy.json limits.maxDecorPerRoom
  for (let i = 0; i < cap; i++) {
    const anchor = firstFreeAnchor(bounds, 'floor', taken, reach);
    const key = anchorKey(anchor.x, anchor.y);
    assert(!taken.has(key), `anchor ${key} handed out twice at piece ${i + 1}`);
    taken.add(key);
  }
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach(f => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
