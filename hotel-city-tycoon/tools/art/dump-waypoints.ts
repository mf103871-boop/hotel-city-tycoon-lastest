/**
 * Where each room's people stand, as JSON — for `tools/art/preview.py`.
 *
 * The compose sheet is the acceptance shot ART-0 §16 asks for, and a person
 * standing where the game would never put them proves nothing. So the preview
 * asks the game, exactly as it asks `dump-anchors.ts` for the furniture:
 * every room's movement points from `roomWaypoints.ts`, in room-local anchor
 * units, with the pose and facing each one carries.
 *
 * Run: node --experimental-strip-types tools/art/dump-waypoints.ts
 */
import { loadSimData } from '../balance-sim/load-data.ts';
import { waypointsFor } from '../../src/core/systems/roomWaypoints.ts';

const data = loadSimData();
const out: Record<string, Record<string, { x: number; y: number; facing: string; pose: string }>> = {};

for (const room of data.rooms) {
  const points: Record<string, { x: number; y: number; facing: string; pose: string }> = {};
  for (const p of waypointsFor(room.id, room.blocks.w, room.blocks.h)) {
    points[p.name] = { x: p.x, y: p.y, facing: p.facing, pose: p.pose };
  }
  out[room.id] = points;
}

console.log(JSON.stringify(out, null, 2));
