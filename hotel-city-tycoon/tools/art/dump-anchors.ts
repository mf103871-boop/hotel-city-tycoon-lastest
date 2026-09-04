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

/** Categories in the order a player tends to buy them. */
const ORDER = [
  'wallpaper', 'flooring', 'wallArt', 'lighting', 'rug',
  'bed', 'seating', 'table', 'plant', 'luxury', 'appliance', 'storage',
];

const out: Record<string, Record<string, [number, number]>> = {};

for (const room of data.rooms) {
  const taken = new Set<string>();
  const placed: Record<string, [number, number]> = {};
  const bounds = anchorBoundsFor(data, room.id);

  for (const category of ORDER) {
    const item = data.decor
      .filter((d) => d.category === category && slotAllowed(data, room, d.id))
      .sort((a, b) => a.tier - b.tier)[0];
    if (!item) continue;
    const anchor = anchorFor(data, room.id, item.id, taken)
      ?? firstFreeAnchor(bounds, item.slotType, taken, anchorReachFor(data, item.id));
    taken.add(anchorKey(anchor.x, anchor.y));
    placed[item.id] = [anchor.x, anchor.y];
  }
  out[room.id] = placed;
}

console.log(JSON.stringify(out, null, 2));
