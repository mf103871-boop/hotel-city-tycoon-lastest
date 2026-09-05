# Room decor redesign — contract for room designers

Every room in Hotel City Tycoon gets its OWN catalogue of exactly 8 decor
pieces, sold nowhere else, each with ONE designed place inside that room.
Buying a piece installs it at its place; it can be bought once per room.

## Coordinates (DEC-010, src/core/systems/decorPlacement.ts + roomAnchors.ts)
- Anchor units: 16 per block on both axes. A block is 128x96 px, so one unit
  is 8 px across and 6 px down. A 2x1 room is 32x16 units = 256x96 px.
- A slot = {kind, x, y, w, h}: anchor (x,y) in units from the room's top-left,
  and a box (w units wide, h units tall) the sprite is scaled DOWN to fit
  (never up). Integers only.
- kind and how the box hangs on the anchor:
    ceiling  hangs from anchor: box = [x-w/2 .. x+w/2] × [y .. y+h]; y must be <= 4
    wall     centred on anchor: box = [x-w/2 .. x+w/2] × [y-h/2 .. y+h/2]
    ground / bed / surface  stand on anchor: box = [x-w/2 .. x+w/2] × [y-h .. y]
             and y MUST equal the room's floor line (14 for 1-high rooms;
             spa 12; pool 10; presidential 30 with a mezzanine line at 16;
             family may keep a bed at y=10 for the bunk).
- kind by category: wallpaper/wallArt → wall; lighting → ceiling;
  flooring/rug → surface; bed → bed; seating/table/plant/luxury/appliance/storage → ground.
- Natural sprite sizes (px, already scaled): wall 53x40, floor 40x40,
  ceiling 40x26, bed 57x35, equipment 53x40. A box smaller than that shrinks
  the art; aim for boxes that keep pieces >= 60% (ground w>=4, wall w>=5,
  ceiling w>=4, surface w>=5, bed w>=8; h: ground/surface 7, wall 6, ceiling 5, bed 6).

## Rules the checker enforces (tools/selftest/slots.ts + this redesign)
1. Box entirely inside the room.
2. Standing pieces (ground, bed) on the same line: boxes must not overlap AND
   keep a clear gap of >= 8 px (1 unit) from every other standing box,
   built-in fixtures included. "Far apart from each other" is the brief.
3. Same-kind wall / ceiling / surface boxes: no overlap, >= 8 px gap.
4. A wall box and a ceiling box must not overlap each other.
5. Nothing on the building: floor pieces must not stand in a painted STANDING
   fixture (a desk, a counter, the pool basin, a door); wall/ceiling boxes must
   not overlap ANY painted fixture except the "crossable" ones (rails, cornices,
   neon strips, welcome mat, number plaque, wall clock, washing line, pipes).
6. A surface (rug/flooring) MAY share its place with a bed or chair standing on
   it — that is intended (rug under the bed). Surfaces only avoid other surfaces.
7. The 8 items must include >= 1 wall piece, >= 1 ceiling piece, >= 1 surface piece.
8. Built-in fixtures the room already comes with (see the brief) must ALL keep a
   slot. A fixture slot may BE one of the 8 catalogue slots when the kinds
   match — then buying that catalogue item replaces the built-in (the upgrade).
   Prefer that for beds (every bedroom's catalogue bed replaces its built-in
   bed) and for cramped rooms. Fixture positions may be moved for spacing but
   must stay sensible (laundry machines on their painted bays, etc.).

## New items
A new item needs: id `<category>_<camelName>` (unique across the whole game;
check the existing list), category, slotType (wall/floor/ceiling/bed/equipment
— equipment for appliance & storage), an English name (2-3 words), an Arabic
name, and a 1-2 sentence ART BRIEF describing a distinctive silhouette in the
game's flat 40-px style (what shape, what colours, how it differs from every
existing piece of the same category). It must suit THIS room only.
