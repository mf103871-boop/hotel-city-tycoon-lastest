/**
 * Where each room's furniture lands, as JSON — for `tools/art/preview.py`.
 *
 * The preview needs to compose a room the way the game composes it, and the
 * only honest way to get the positions is to ask the game. This walks every
 * room in the catalogue, furnishes it with the cheapest piece of each category
 * the room's own rules allow, and prints the anchors `roomAnchors.ts` hands
 * out — the same call `PLACE_DECOR` makes, with the same taken-set, in the
 * same order.
 *
 * Keeping the numbers in one place matters more than it sounds: a preview with
 * its own copy of the layout table would agree with the art and disagree with
 * the game, which is the one failure mode a preview exists to prevent.
 *
 * Run: node --experimental-strip-types tools/art/dump-anchors.ts
 */
import { loadSimData } from '../balance-sim/load-data.ts';
import { anchorFor } from '../../src/core/systems/roomAnchors.ts';
import { anchorKey, anchorBoundsFor, firstFreeAnchor, anchorReachFor } from '../../src/core/systems/decorPlacement.ts';
import { slotAllowed } from '../../src/core/systems/quality.ts';

const data = loadSimData();

/**
 * Categories in the order a player tends to buy them.
 *
 * The hero piece first — a bedroom gets a bed before it gets wallpaper — so a
 * room capped at four slots shows the four things that would actually be in
 * it, not four surface treatments and no furniture.
 */
const ORDER = [
  'bed', 'appliance', 'seating', 'table', 'lighting', 'rug',
  'storage', 'plant', 'wallArt', 'luxury', 'wallpaper', 'flooring',
];

const out: Record<string, Record<string, [number, number]>> = {};

for (const room of data.rooms) {
  const taken = new Set<string>();
  const placed: Record<string, [number, number]> = {};
  const inRoom: Array<{ defId: string; localX: number; localY: number }> = [];
  const bounds = anchorBoundsFor(data, room.id);

  for (const category of ORDER) {
    // Never more pieces than the room can actually hold: a one-block bedroom
    // takes four, and furnishing it with ten in a preview shows a collision
    // the game would never produce.
    if (inRoom.length >= room.decorSlots) break;
    const item = data.decor
      .filter((d) => d.category === category && slotAllowed(data, room, d.id))
      .sort((a, b) => a.tier - b.tier)[0];
    if (!item) continue;
    const anchor = anchorFor(data, room.id, item.id, taken, 24, inRoom)
      ?? firstFreeAnchor(bounds, item.slotType, taken, anchorReachFor(data, item.id));
    taken.add(anchorKey(anchor.x, anchor.y));
    inRoom.push({ defId: item.id, localX: anchor.x, localY: anchor.y });
    placed[item.id] = [anchor.x, anchor.y];
  }
  out[room.id] = placed;
}

console.log(JSON.stringify(out, null, 2));
