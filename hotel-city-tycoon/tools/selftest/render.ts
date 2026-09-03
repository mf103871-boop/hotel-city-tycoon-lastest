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
  orderDecor, decorAnchorFor, isDecorBack, BLOCK_W, BLOCK_H, ART_SCALE,
} from '../../src/render/layout.ts';
import { readFileSync } from 'node:fs';

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

// ---------------------------------------------------------------- decor (HC-P1-S4)
const DECOR_CATEGORIES = (JSON.parse(readFileSync('data/decor.json', 'utf8')) as {
  items: Array<{ category: string; slotType: string }>;
}).items;

check('every decor category the data ships has a deliberate anchor', () => {
  // A category with no anchor silently falls back to bottom-centre, which
  // hangs a wallpaper off the floor line. The catalogue is the source of
  // truth for which categories exist, so it is what gets checked.
  const seen = new Set(DECOR_CATEGORIES.map((d) => d.category));
  const bottom = new Set(['bed', 'seating', 'table', 'plant', 'luxury']);
  const centre = new Set(['flooring', 'rug', 'wallpaper', 'wallArt']);
  for (const category of seen) {
    const [ax, ay] = decorAnchorFor(category);
    eq(ax, 0.5, `${category} is not centred horizontally`);
    if (bottom.has(category)) eq(ay, 1, `${category} should stand on its contact edge`);
    else if (centre.has(category)) eq(ay, 0.5, `${category} should be centred on what it covers`);
    else eq(ay, 0, `${category} should hang from its fixing point`);
  }
  eq(seen.size, 10, 'the catalogue no longer has ten categories — recheck the anchor table');
});

check('surfaces are drawn behind anything standing on the floor', () => {
  for (const category of ['wallpaper', 'flooring', 'wallArt', 'lighting']) {
    assert(isDecorBack(category), `${category} should be on the back layer`);
  }
  for (const category of ['bed', 'seating', 'table', 'plant', 'rug', 'luxury']) {
    assert(!isDecorBack(category), `${category} should sort with the characters`);
  }
});

check('decor sorts by contact point, with surfaces underneath', () => {
  const piece = (id: string, category: string, localY: number, zBias = 0) =>
    ({ id, category, localY, zBias });
  const order = orderDecor([
    piece('chair', 'seating', 14),
    piece('paper', 'wallpaper', 6),
    piece('bed', 'bed', 10),
    piece('rug', 'rug', 12),
  ]).map((p) => p.id);
  // Wallpaper first however low it sits; then bed (10), rug (12), chair (14).
  eq(order.join(','), 'paper,bed,rug,chair', 'wrong draw order');
});

check('zBias only breaks ties, it does not override depth', () => {
  const piece = (id: string, localY: number, zBias: number) =>
    ({ id, category: 'seating', localY, zBias });
  eq(orderDecor([piece('low', 12, 9), piece('high', 4, 0)]).map((p) => p.id).join(','),
    'high,low', 'zBias overrode the contact point');
  eq(orderDecor([piece('b', 8, 1), piece('a', 8, 0)]).map((p) => p.id).join(','),
    'a,b', 'zBias did not break a tie at equal depth');
});

check('ordering keeps every piece exactly once', () => {
  const pieces = DECOR_CATEGORIES.slice(0, 20).map((d, i) => ({
    id: `p${i}`, category: d.category, localY: (i * 7) % 16, zBias: i % 3,
  }));
  const out = orderDecor(pieces);
  eq(out.length, pieces.length, 'ordering changed the number of pieces');
  eq(new Set(out.map((p) => p.id)).size, pieces.length, 'ordering duplicated or dropped a piece');
});

check('a scaled piece still fits the room it is anchored in', () => {
  // The whole point of ART_SCALE. An armchair is authored at 72x72; drawn 1:1
  // it is three quarters of a 96px room. This is the assertion that fails if
  // someone "simplifies" the scale away.
  assert(ART_SCALE > 0 && ART_SCALE < 1, 'art scale must shrink, not grow');
  const armchair = 72 * ART_SCALE;
  assert(armchair < BLOCK_H * 0.5, `a scaled armchair is ${armchair}px in a ${BLOCK_H}px room`);
  // Anchored at the bottom of the floor band it must not push through the ceiling.
  const foot = anchorToLocalPx(8, 15).y;
  assert(foot - armchair > 0, 'a floor-standing piece overflows the top of its room');
});


console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach(f => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
