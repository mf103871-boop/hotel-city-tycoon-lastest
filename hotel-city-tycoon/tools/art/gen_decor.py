#!/usr/bin/env python3
"""
Every piece of decor in the catalogue, at both resolutions.

The driver reads `data/decor.json`, so the set of pieces and their slot types
come from the game rather than from a list here, and sizes each canvas the way
`tools/gen-asset-manifest.mjs` declares it — a sprite that ships one pixel wide
of its manifest entry shifts the room's layout, because the renderer sizes from
the manifest and not from the file.

The pieces themselves live in two modules, split by what they are:

    decor_surfaces.py   wallpaper, flooring, wallArt, lighting, rug
    decor_props.py      bed, seating, table, plant, luxury, and the service
                        room equipment added for the back of house
    decor_service.py    the back of house and the lobby
    decor_fitness.py    the gym and the poolside
    decor_dining.py     the cafe, the restaurant and the bar
    decor_leisure.py    the arcade, the cinema and the disco

Each exports `PIECES: dict[str, callable]`, where the callable takes the canvas
and draws on it.

### Where the art has to sit in its canvas

`src/render/decorArt.ts` holds the anchor for every category, and the anchor is
what the renderer hangs the sprite from. That makes canvas alignment part of
the drawing, not a detail:

| category                          | anchor | the art must…                    |
|-----------------------------------|--------|----------------------------------|
| bed, seating, table, plant, luxury| (.5, 1)| **stand on the bottom edge**     |
| lighting                          | (.5, 0)| **hang from the top edge**       |
| flooring, rug                     | (.5, 1)| **stand on the bottom edge**     |
| wallpaper, wallArt                | (.5,.5)| **be centred**                   |

A floor piece drawn floating in the middle of its canvas hovers above the floor
in the room; a lamp drawn centred hangs by nothing. Both are invisible in a
sprite sheet and obvious in the game, which is why the rule is here.

Run: python3 tools/art/gen_decor.py [decor_id ...]
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hcstyle import Canvas  # noqa: E402

import decor_surfaces       # noqa: E402
import decor_props          # noqa: E402
import decor_service        # noqa: E402
import decor_fitness        # noqa: E402
import decor_dining         # noqa: E402
import decor_leisure        # noqa: E402

PIECES = {
    **decor_surfaces.PIECES, **decor_props.PIECES,
    # HC-P1-S5: the pieces that belong to one room rather than to the hotel.
    **decor_service.PIECES, **decor_fitness.PIECES,
    **decor_dining.PIECES, **decor_leisure.PIECES,
}

#: Must match SLOT_SIZE in tools/gen-asset-manifest.mjs.
SLOT_SIZE = {
    "wall": (96, 72),
    "floor": (72, 72),
    "ceiling": (72, 48),
    "bed": (104, 64),
    # `equipment` was missing, so every washer, treadmill and locker was drawn
    # on the 72x72 default while the manifest declared 96x72 — and the renderer
    # sizes from the manifest, so all sixteen were stretched a third wider than
    # they were drawn. Nothing caught it: the only on-disk dimension check
    # covers walk sheets.
    "equipment": (96, 72),
}

#: Where a category's art is anchored — mirrors src/render/decorArt.ts.
ANCHOR_Y = {
    # flooring and rug stand on the bottom edge, exactly like a chair — see
    # src/render/decorArt.ts, which is the contract this table mirrors.
    "wallpaper": 0.5, "flooring": 1.0, "wallArt": 0.5, "rug": 1.0,
    "lighting": 0.0,
    "bed": 1.0, "seating": 1.0, "table": 1.0, "plant": 1.0, "luxury": 1.0,
    "appliance": 1.0, "storage": 1.0, "service": 1.0,
}


def catalogue() -> list[dict]:
    with open("data/decor.json", encoding="utf8") as fh:
        return json.load(fh)["items"]


def size_for(item: dict) -> tuple[int, int]:
    return SLOT_SIZE.get(item["slotType"], (72, 72))


def generate(only: list[str] | None = None) -> int:
    items = catalogue()
    missing = sorted(i["id"] for i in items if i["id"] not in PIECES)
    if missing:
        raise SystemExit(f"no drawing routine for decor: {', '.join(missing)}")
    known = {i["id"] for i in items}
    extra = sorted(set(PIECES) - known)
    if extra:
        raise SystemExit(f"drawing routines for decor that does not exist: {', '.join(extra)}")

    written = 0
    for item in items:
        if only and item["id"] not in only:
            continue
        w, h = size_for(item)
        for tier in (1, 2):
            c = Canvas(w, h, tier=tier)
            PIECES[item["id"]](c)
            c.save(f"decor/{item['id']}.png")
            written += 1
    print(f"  {written} decor files ({len(items)} pieces at 1x and 2x)")
    return written


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    generate(args or None)
