#!/usr/bin/env python3
"""
Every room interior in the hotel, at both resolutions, plus their variants.

This file is the *driver*: it reads the room list from `data/rooms.json` so a
room can never be drawn at the wrong size, builds the shell every room shares,
hands the canvas to the room's own routine for the parts that make it that
room, and then derives night, dirty, pest and thumb from the result.

The rooms themselves live next door, split by what they are for:

    rooms_service.py      lobby, housekeeping, laundry, staff, maintenance, business
    rooms_guest.py        economy through presidential
    rooms_commercial.py   cafe, gym, restaurant, bar, arcade, cinema, spa, pool

Each module exports `ROOMS: dict[str, RoomSpec]`. A spec says which wall and
floor the room is built from and supplies `draw(c, fy)` for its fixed
architecture — windows, doors, and for a commercial room the equipment that is
part of the building rather than furniture (`ASSET-SPEC.md` §1). Movable
furniture is never drawn here: it is decor, composited on top at runtime, and
drawing it twice is the one mistake that makes a room look wrong in a way no
amount of redrawing fixes.

Run: python3 tools/art/gen_rooms.py [room_id ...]
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hcstyle import BLOCK_W, BLOCK_H, Canvas, room_shell  # noqa: E402
from hcvariants import write_variants                     # noqa: E402

import rooms_service                                       # noqa: E402
import rooms_guest                                         # noqa: E402
import rooms_commercial                                    # noqa: E402

REGISTRY = {**rooms_service.ROOMS, **rooms_guest.ROOMS, **rooms_commercial.ROOMS}


def room_blocks() -> dict[str, tuple[int, int]]:
    """Footprints from the data file, so art and simulation cannot disagree."""
    with open("data/rooms.json", encoding="utf8") as fh:
        rooms = json.load(fh)["rooms"]
    return {r["id"]: (r["blocks"]["w"], r["blocks"]["h"]) for r in rooms}


def draw_room(room_id: str, blocks: tuple[int, int], tier: int) -> tuple[Canvas, float]:
    """One room's base image at one tier. Returns the canvas and its floor line."""
    spec = REGISTRY[room_id]
    bw, bh = blocks
    c = Canvas(bw * BLOCK_W, bh * BLOCK_H, tier=tier)
    fy = room_shell(c, spec.wall, spec.floor, floor_h=spec.floor_h)
    spec.draw(c, fy)
    return c, fy


def generate(only: list[str] | None = None) -> int:
    blocks = room_blocks()
    missing = sorted(set(blocks) - set(REGISTRY))
    if missing:
        raise SystemExit(f"no drawing routine for: {', '.join(missing)}")
    extra = sorted(set(REGISTRY) - set(blocks))
    if extra:
        raise SystemExit(f"drawing routines for rooms that do not exist: {', '.join(extra)}")

    written = 0
    for room_id in sorted(blocks):
        if only and room_id not in only:
            continue
        for tier in (1, 2):
            canvas, fy = draw_room(room_id, blocks[room_id], tier)
            canvas.save(f"rooms/{room_id}_base.png")
            written += 1
            written += len(write_variants(room_id, canvas, REGISTRY[room_id].wall, fy))
        print(f"  {room_id:<14} {blocks[room_id][0]}x{blocks[room_id][1]} blocks  "
              f"base + night/dirty/pest/thumb at 1x and 2x")
    return written


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    total = generate(args or None)
    print(f"{total} room files written")
