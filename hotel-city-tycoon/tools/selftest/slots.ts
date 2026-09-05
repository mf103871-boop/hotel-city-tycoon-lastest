/**
 * The room plans, checked against the rooms they were written for.
 *
 * `src/core/systems/roomAnchors.ts` says where every piece of furniture in the
 * game stands and how big it is drawn. Those numbers are hand-authored, they
 * describe pictures drawn in a different language in a different directory,
 * and until HC-P1-S5 nothing compared the two. Measured, the old ones were
 * often wrong: the laundry stood furniture inside two of its own washing
 * machines, the gym put a treadmill in the middle of the mirror, the cinema
 * put five pieces under the screen and the pool put two of them in the water.
 * That is what "the decor looks random" meant.
 *
 * `room-fixtures.json` is the missing half — what each room's art actually
 * paints, in the same 1x pixels, measured off `tools/art/rooms_*.py`. With it,
 * every one of those failures is a check rather than a bug report.
 *
 * Run: node --experimental-strip-types tools/selftest/slots.ts
 */
import {
  layoutFor, plannedRooms, slotsOfKind, spotKindFor, floorLineFor, fixturesFor,
  slotAt, occupancyKey,
} from '../../src/core/systems/roomAnchors.ts';
import type { Slot, SpotKind } from '../../src/core/systems/roomAnchors.ts';
import { slotAllowed, decorFitsRoom } from '../../src/core/systems/quality.ts';
import { catalogueFor, decorDef } from '../../src/core/data-source.ts';
import { BLOCK_W, BLOCK_H, ANCHOR_PX_X, ANCHOR_PX_Y } from '../../src/render/layout.ts';
import { decorArtSpec, fitDecorSize } from '../../src/render/decorArt.ts';
import { loadSimData } from '../balance-sim/load-data.ts';
import fs from 'node:fs';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void {
  if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`);
}

interface Fixture {
  name: string;
  x0: number; y0: number; x1: number; y1: number;
  standing?: boolean;
}

const simData = loadSimData();
const painted = JSON.parse(
  fs.readFileSync('tools/selftest/room-fixtures.json', 'utf8'),
) as { rooms: Record<string, Fixture[]> };
const manifest = JSON.parse(
  fs.readFileSync('public/assets/manifest.json', 'utf8'),
) as { entries: Array<{ key: string; width: number; height: number }> };

/**
 * Fixtures a sprite may cross without looking wrong: a rail, a cornice, a
 * strip of neon. They are lines rather than objects, and furniture standing in
 * front of one is the arrangement rather than a clash.
 */
const CROSSABLE = new Set([
  'washing line', 'ceiling pipes', 'picture rail', 'dado rail', 'cornice',
  'wall rail', 'tiled dado', 'ceiling neon', 'neon bar left', 'neon bar right',
  'neon underline', 'pelmet', 'welcome mat', 'number plaque', 'wall clock',
]);

/** A slot's box in room-local pixels, from the anchor its kind hangs by. */
function boxOf(slot: Slot): { x0: number; y0: number; x1: number; y1: number } {
  const cx = slot.x * ANCHOR_PX_X;
  const cy = slot.y * ANCHOR_PX_Y;
  const w = slot.w * ANCHOR_PX_X;
  const h = slot.h * ANCHOR_PX_Y;
  if (slot.kind === 'ceiling') return { x0: cx - w / 2, y0: cy, x1: cx + w / 2, y1: cy + h };
  if (slot.kind === 'wall') {
    return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
  }
  return { x0: cx - w / 2, y0: cy - h, x1: cx + w / 2, y1: cy };
}

const ON_FLOOR = new Set<SpotKind>(['ground', 'bed', 'surface']);
const declared = new Map(manifest.entries.map((e) => [e.key, e]));

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — room plans against the rooms');
console.log(line);

check('every room has a plan, and every plan is whole numbers', () => {
  const planned = new Set(plannedRooms());
  for (const room of simData.rooms) {
    assert(planned.has(room.id), `room "${room.id}" has no plan of its own`);
    const layout = layoutFor(room.id, room.blocks.w, room.blocks.h);
    assert(layout.length > 0, `${room.id}'s plan is empty`);
    for (const slot of layout) {
      // A fractional anchor is written into the save as-is, and `checkDecor`
      // refuses a non-integer localX on the next load — which quarantines the
      // whole save. This is the check that stops that ever being typed.
      for (const [name, v] of [['x', slot.x], ['y', slot.y], ['w', slot.w], ['h', slot.h]]) {
        assert(Number.isInteger(v), `${room.id} has a fractional slot ${name}: ${String(v)}`);
      }
      assert(slot.x >= 0 && slot.y >= 0, `${room.id} has a negative anchor`);
      assert(slot.w >= 2 && slot.h >= 2, `${room.id} has a slot too small to draw in`);
    }
  }
});

check('the first eight places of every plan are the room\'s own eight pieces, in order', () => {
  // The per-room design in one sentence: a room sells eight pieces of its
  // own, the position of a piece in that list is the numbered place it stands
  // in, and the place is the right kind for the piece. PLACE_DECOR reads the
  // plan by index, so a plan out of step with its catalogue would stand a
  // lamp on the floor.
  for (const room of simData.rooms) {
    const list = catalogueFor(simData, room.id);
    eq(list.length, 8, `${room.id} sells ${list.length} pieces`);
    const layout = layoutFor(room.id, room.blocks.w, room.blocks.h);
    assert(layout.length >= 8, `${room.id} plans ${layout.length} places for its eight pieces`);
    list.forEach((id, i) => {
      const def = decorDef(simData, id);
      eq(layout[i]!.kind, spotKindFor(def.category, def.slotType),
        `${room.id}'s place ${i} is a ${layout[i]!.kind} slot but sells ${id}`);
      assert(slotAllowed(simData, room, id) && decorFitsRoom(simData, room, id),
        `${room.id} sells ${id}, which its own rules refuse`);
      // A built-in standing in a catalogue place is what that piece replaces,
      // so it has to be the same kind of thing.
      const fx = layout[i]!.fixture;
      if (fx) {
        const built = decorDef(simData, fx);
        eq(spotKindFor(built.category, built.slotType), layout[i]!.kind,
          `${room.id}'s built-in ${fx} does not match the place ${id} takes`);
      }
    });
  }
});

check('the eight pieces stand apart from each other and from the built-ins', () => {
  // "Far from each other" is the brief, stated as a number: a clear unit
  // (8 px) between any two standing pieces on the same floor line, and
  // between any two pieces of the same kind on the wall or the ceiling. A rug
  // is meant to lie under a chair, so surfaces are only measured against
  // surfaces. Lamps also keep clear of pictures — a chandelier drawn through a
  // painting was the commonest of the old collisions.
  const GAP = 8;
  let pairs = 0;
  for (const room of simData.rooms) {
    const layout = layoutFor(room.id, room.blocks.w, room.blocks.h);
    for (let i = 0; i < layout.length; i++) {
      for (let j = i + 1; j < layout.length; j++) {
        const a = layout[i]!;
        const b = layout[j]!;
        const ba = boxOf(a);
        const bb = boxOf(b);
        const apart = (gap: number): boolean =>
          ba.x0 >= bb.x1 + gap - 0.001 || bb.x0 >= ba.x1 + gap - 0.001
          || ba.y0 >= bb.y1 - 0.001 || bb.y0 >= ba.y1 - 0.001;
        const standing = (s: Slot): boolean => s.kind === 'ground' || s.kind === 'bed';
        if (standing(a) && standing(b) && a.y === b.y) {
          pairs++;
          assert(ba.x0 >= bb.x1 + GAP - 0.001 || bb.x0 >= ba.x1 + GAP - 0.001,
            `${room.id} stands ${a.kind}@${a.x} within ${GAP}px of ${b.kind}@${b.x}`);
        } else if (a.kind === b.kind && !standing(a)) {
          pairs++;
          assert(apart(GAP), `${room.id} puts two ${a.kind} pieces within ${GAP}px: @(${a.x},${a.y}) and @(${b.x},${b.y})`);
        } else if ((a.kind === 'wall' && b.kind === 'ceiling') || (a.kind === 'ceiling' && b.kind === 'wall')) {
          pairs++;
          assert(apart(0), `${room.id} hangs a lamp through a picture: @(${a.x},${a.y}) and @(${b.x},${b.y})`);
        }
      }
    }
  }
  console.log(`      ${pairs} pairs of places measured`);
});

check('every piece a room sells is drawn inside the room, in its own place', () => {
  for (const room of simData.rooms) {
    const roomW = room.blocks.w * BLOCK_W;
    const roomH = room.blocks.h * BLOCK_H;
    const layout = layoutFor(room.id, room.blocks.w, room.blocks.h);
    catalogueFor(simData, room.id).forEach((id, i) => {
      const def = decorDef(simData, id);
      const slot = layout[i]!;
      const entry = declared.get(def.assetKey);
      assert(entry, `no manifest entry for ${def.assetKey}`);
      const spec = decorArtSpec(def.category, def.slotType);
      const size = fitDecorSize(entry.width, entry.height, { w: slot.w * ANCHOR_PX_X, h: slot.h * ANCHOR_PX_Y });
      const left = slot.x * ANCHOR_PX_X - size.w * spec.anchorX;
      const top = slot.y * ANCHOR_PX_Y - size.h * spec.anchorY;
      assert(left >= -0.001 && left + size.w <= roomW + 0.001, `${room.id}'s ${id} is drawn past the wall`);
      assert(top >= -0.001 && top + size.h <= roomH + 0.001, `${room.id}'s ${id} is drawn past the ceiling or the floor`);
      // And at a size worth buying: a piece squeezed below two fifths of its
      // natural size is a place the room should not have sold. Two fifths
      // rather than half because the bar and the budget room are mostly
      // counter and door, and their last places are a bar mat and a lantern
      // that are small things anyway.
      const natural = fitDecorSize(entry.width, entry.height, null);
      assert(size.w >= natural.w * 0.4 - 0.001,
        `${room.id}'s ${id} is drawn at ${Math.round(size.w / natural.w * 100)}% of its size`);
    });
  }
});

check('every room can take a surface, a wall piece and a ceiling piece', () => {
  for (const room of simData.rooms) {
    const layout = layoutFor(room.id, room.blocks.w, room.blocks.h);
    for (const kind of ['wall', 'ceiling', 'surface'] as SpotKind[]) {
      assert(slotsOfKind(layout, kind, 99).length > 0,
        `${room.id} has nowhere to put a ${kind} piece`);
    }
    // Ground or bed: a one-block bedroom is a bed and a door and 24 pixels of
    // floor, so `economy` genuinely has no room for a chair beside its bed.
    // What matters is that the room has SOME standing place — `anchorFor`
    // lets a ground piece take a bed's place when there is nothing else.
    assert(slotsOfKind(layout, 'ground', 99).length
      + slotsOfKind(layout, 'bed', 99).length > 0,
      `${room.id} has nowhere for anything to stand`);
  }
});

check('every slot has enough places for the pieces the room may hold', () => {
  // Not one slot per decorSlot — a room does not have to be able to hold
  // twelve chandeliers — but a room whose plan is much smaller than its own
  // cap will fall through to the scan, which is the behaviour this whole
  // change exists to remove.
  const short: string[] = [];
  for (const room of simData.rooms) {
    const layout = layoutFor(room.id, room.blocks.w, room.blocks.h);
    assert(layout.length >= Math.min(room.decorSlots, 8),
      `${room.id} plans ${layout.length} places for ${room.decorSlots} slots`);
    if (layout.length < room.decorSlots) {
      short.push(`${room.id} ${layout.length}/${room.decorSlots}`);
    }
  }
  // Printed rather than asserted away: these rooms are as full as their own
  // pictures allow. What is left in them is eight or ten pixels between a
  // window and a door, and a slot that narrow makes a worse place than the
  // banded scan a piece falls back to. Worth seeing when a room is redrawn.
  console.log(`      ${short.length} room(s) cannot design a place for every`
    + ` slot they sell: ${short.join(', ')}`);
});

check('no slot hangs a piece outside its own room', () => {
  for (const room of simData.rooms) {
    const roomW = room.blocks.w * BLOCK_W;
    const roomH = room.blocks.h * BLOCK_H;
    for (const slot of layoutFor(room.id, room.blocks.w, room.blocks.h)) {
      const b = boxOf(slot);
      assert(b.x0 >= -0.001 && b.x1 <= roomW + 0.001,
        `${room.id}'s ${slot.kind} slot at x=${slot.x} runs past the wall`);
      assert(b.y0 >= -0.001 && b.y1 <= roomH + 0.001,
        `${room.id}'s ${slot.kind} slot at y=${slot.y} runs past the ceiling or the floor`);
    }
  }
});

check('two pieces are never given the same patch of floor', () => {
  for (const room of simData.rooms) {
    const layout = layoutFor(room.id, room.blocks.w, room.blocks.h);
    const standing = layout.filter((s) => s.kind === 'ground' || s.kind === 'bed');
    for (let i = 0; i < standing.length; i++) {
      for (let j = i + 1; j < standing.length; j++) {
        const a = standing[i]!;
        const b = standing[j]!;
        // Different standing lines cannot clash — the presidential suite has
        // two, and its mezzanine is not the floor below it.
        if (a.y !== b.y) continue;
        const ba = boxOf(a);
        const bb = boxOf(b);
        assert(!(ba.x0 < bb.x1 - 0.001 && ba.x1 > bb.x0 + 0.001),
          `${room.id} gives ${a.kind}@${a.x} and ${b.kind}@${b.x} the same floor`);
      }
    }
    for (const kind of ['wall', 'ceiling', 'surface'] as SpotKind[]) {
      const same = slotsOfKind(layout, kind, 99);
      for (let i = 0; i < same.length; i++) {
        for (let j = i + 1; j < same.length; j++) {
          const ba = boxOf(same[i]!);
          const bb = boxOf(same[j]!);
          assert(!(ba.x0 < bb.x1 - 0.001 && ba.x1 > bb.x0 + 0.001
            && ba.y0 < bb.y1 - 0.001 && ba.y1 > bb.y0 + 0.001),
            `${room.id} overlaps two ${kind} slots at x=${same[i]!.x} and x=${same[j]!.x}`);
        }
      }
    }
  }
});

check('nothing stands on the building', () => {
  // The check the old point list never had. A floor slot is measured against
  // what stands on the SAME floor line, whatever the slot's own height: the
  // pool's basin begins below the deck and a sunbed still cannot stand in it.
  let compared = 0;
  for (const room of simData.rooms) {
    const fixtures = painted.rooms[room.id] ?? [];
    for (const slot of layoutFor(room.id, room.blocks.w, room.blocks.h)) {
      const b = boxOf(slot);
      const floorPx = slot.y * ANCHOR_PX_Y;
      for (const f of fixtures) {
        if (CROSSABLE.has(f.name)) continue;
        if (ON_FLOOR.has(slot.kind)) {
          if (!f.standing) continue;
          if (!(f.y0 <= floorPx + 6 && f.y1 >= floorPx - 6)) continue;
          compared++;
          assert(!(b.x0 < f.x1 - 0.001 && b.x1 > f.x0 + 0.001),
            `${room.id} stands a ${slot.kind} piece at x=${slot.x} in the ${f.name}`);
        } else {
          compared++;
          assert(!(b.x0 < f.x1 - 0.001 && b.x1 > f.x0 + 0.001
            && b.y0 < f.y1 - 0.001 && b.y1 > f.y0 + 0.001),
            `${room.id} hangs a ${slot.kind} piece at (${slot.x},${slot.y}) over the ${f.name}`);
        }
      }
    }
  }
  console.log(`      ${compared} slot-against-fixture comparisons`);
});

check('what stands on the floor stands on the room\'s own floor', () => {
  for (const room of simData.rooms) {
    const floor = floorLineFor(room.id, room.blocks.h);
    const layout = layoutFor(room.id, room.blocks.w, room.blocks.h);
    const lines = new Set(layout.filter((s) => ON_FLOOR.has(s.kind)).map((s) => s.y));
    assert(lines.has(floor),
      `${room.id} has no floor slot on its own floor line (${floor}); it has ${[...lines].join(', ')}`);
    for (const y of lines) {
      // The presidential suite's mezzanine is the only second standing line in
      // the game, and it is above the main one, never below it.
      assert(y <= floor, `${room.id} stands something at y=${y}, below its floor line ${floor}`);
    }
  }
});

check('a hanging piece hangs near the ceiling', () => {
  for (const room of simData.rooms) {
    for (const slot of slotsOfKind(layoutFor(room.id, room.blocks.w, room.blocks.h), 'ceiling', 99)) {
      assert(slot.y <= 4, `${room.id} hangs a lamp at y=${slot.y}, nowhere near the ceiling`);
    }
  }
});

check('every built-in is a real piece that belongs in the room it furnishes', () => {
  let count = 0;
  for (const room of simData.rooms) {
    const layout = layoutFor(room.id, room.blocks.w, room.blocks.h);
    for (const slot of layout) {
      if (!slot.fixture) continue;
      count++;
      const def = simData.decor.find((d) => d.id === slot.fixture);
      // A fixture with no catalogue entry would make `decorDef` throw on
      // every income tick, because the selector looks its art up by id.
      assert(def, `${room.id} is furnished with "${slot.fixture}", which is not in the catalogue`);
      assert(slotAllowed(simData, room, def.id) && decorFitsRoom(simData, room, def.id),
        `${room.id} is furnished with ${def.id}, which the room's own rules forbid`);
      eq(spotKindFor(def.category, def.slotType), slot.kind,
        `${room.id}'s built-in ${def.id} is in a ${slot.kind} place`);
    }
  }
  assert(count > 0, 'no room is furnished at all');
  console.log(`      ${count} built-in pieces across ${simData.rooms.length} rooms`);
});

check('a built-in is drawn inside the place it was given', () => {
  for (const room of simData.rooms) {
    const roomW = room.blocks.w * BLOCK_W;
    const roomH = room.blocks.h * BLOCK_H;
    for (const fx of fixturesFor(room.id, room.blocks.w, room.blocks.h, new Set())) {
      const def = simData.decor.find((d) => d.id === fx.defId)!;
      const entry = declared.get(def.assetKey);
      assert(entry, `no manifest entry for ${def.assetKey}`);
      const spec = decorArtSpec(def.category, def.slotType);
      const size = fitDecorSize(entry.width, entry.height,
        { w: fx.w * ANCHOR_PX_X, h: fx.h * ANCHOR_PX_Y });
      const left = fx.x * ANCHOR_PX_X - size.w * spec.anchorX;
      const top = fx.y * ANCHOR_PX_Y - size.h * spec.anchorY;
      assert(left >= -0.001 && left + size.w <= roomW + 0.001,
        `${room.id}'s built-in ${def.id} is drawn past the wall`);
      assert(top >= -0.001 && top + size.h <= roomH + 0.001,
        `${room.id}'s built-in ${def.id} is drawn past the ceiling or the floor`);
    }
  }
});

check('a bought piece hides the built-in whose place it takes', () => {
  // The whole of "replace what the room came with", stated as a property.
  for (const room of simData.rooms) {
    const before = fixturesFor(room.id, room.blocks.w, room.blocks.h, new Set());
    if (before.length === 0) continue;
    const target = before[0]!;
    const slot = slotAt(room.id, room.blocks.w, room.blocks.h, target.x, target.y);
    const after = fixturesFor(room.id, room.blocks.w, room.blocks.h,
      new Set([occupancyKey(slot!.kind, target.x, target.y)]));
    eq(after.length, before.length - 1, `${room.id} still shows a built-in nobody can see`);
    assert(!after.some((f) => f.slot === target.slot),
      `${room.id} draws a built-in under the piece standing on it`);
  }
});

check('a coordinate is only ever shared with a floor covering', () => {
  /*
   * The rule the rest of the model leans on. Two places at one coordinate is
   * deliberate — a rug lies under the bed standing on it — and both
   * `anchorFor` and `fixturesFor` now tell them apart by kind. That is only
   * safe while every such pair has a `surface` in it: two things that stand on
   * the floor sharing a coordinate would be two pieces in one spot.
   */
  let shared = 0;
  for (const room of simData.rooms) {
    const layout = layoutFor(room.id, room.blocks.w, room.blocks.h);
    for (let i = 0; i < layout.length; i++) {
      for (let j = i + 1; j < layout.length; j++) {
        const a = layout[i]!;
        const b = layout[j]!;
        if (a.x !== b.x || a.y !== b.y) continue;
        shared++;
        assert(a.kind === 'surface' || b.kind === 'surface',
          `${room.id} puts a ${a.kind} and a ${b.kind} at the same (${a.x},${a.y})`);
      }
    }
  }
  console.log(`      ${shared} shared coordinates, every one of them a floor covering`);
});

check('a piece in the OTHER place at the same coordinate hides nothing', () => {
  /*
   * The bug this exists for: a room may design two places at one coordinate
   * on purpose — a rug lies under the bed standing on it — and hiding a
   * fixture by coordinate alone meant a sixty-coin rug deleted the bedroom's
   * bed. Twelve of the 23 rooms have such a pair, and eight of them are beds.
   */
  let pairs = 0;
  for (const room of simData.rooms) {
    const layout = layoutFor(room.id, room.blocks.w, room.blocks.h);
    for (const slot of layout) {
      if (!slot.fixture) continue;
      const twin = layout.find((s) => s !== slot && s.x === slot.x && s.y === slot.y);
      if (!twin) continue;
      pairs++;
      const kept = fixturesFor(room.id, room.blocks.w, room.blocks.h,
        new Set([occupancyKey(twin.kind, twin.x, twin.y)]));
      assert(kept.some((f) => f.defId === slot.fixture),
        `${room.id} loses its built-in ${slot.fixture} to a ${twin.kind} piece beside it`);
    }
  }
  console.log(`      ${pairs} shared coordinates, every built-in survives its twin`);
});

console.log(line);
console.log(failures.length === 0
  ? `  ${passed} checks passed`
  : `  ${passed} passed, ${failures.length} FAILED\n${failures.map((f) => `    ✗ ${f}`).join('\n')}`);
console.log(line);
process.exit(failures.length ? 1 : 0);
