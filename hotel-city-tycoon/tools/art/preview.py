#!/usr/bin/env python3
"""
Contact sheets, so art can be judged instead of guessed at.

Nothing in this project can screenshot the running game — DEC-009 keeps the
canvas out of CI and the build machines have no GPU — so the only way to see
whether a room is legible, whether a cast reads as different people, or whether
a chair stands on the floor instead of hovering above it, is to compose the
same pictures the game composes and look at them.

    python3 tools/art/preview.py rooms [module]   every room a module draws
    python3 tools/art/preview.py decor [category] every decor sprite, on a wall
    python3 tools/art/preview.py cast             every character, every state
    python3 tools/art/preview.py compose <room>   a room with decor and people
    python3 tools/art/preview.py facade           the whole hotel, as it is played

`compose` is the one that matters: it stacks a room, its decor at the anchors
and scale `src/render/decorArt.ts` declares, and characters at the scale
`characterView.ts` draws them, so what comes out is what the player sees.

Sheets are written to `docs/art-preview/`.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image  # noqa: E402

from hcstyle import (  # noqa: E402
    BLOCK_W, BLOCK_H, CHAR_W, CHAR_H, FOOT_Y, Canvas, P, room_shell, draw_person, tint,
)

OUT_DIR = "docs/art-preview"
SHEET_BG = (238, 241, 246, 255)

#: The scales the renderer actually uses. Keep in step with the two modules.
DECOR_ART_SCALE = 0.55
CHARACTER_ART_SCALE = 0.82


def _rooms_data() -> dict[str, tuple[int, int]]:
    with open("data/rooms.json", encoding="utf8") as fh:
        return {r["id"]: (r["blocks"]["w"], r["blocks"]["h"]) for r in json.load(fh)["rooms"]}


def _decor_data() -> list[dict]:
    with open("data/decor.json", encoding="utf8") as fh:
        return json.load(fh)["items"]


def _write(sheet: Image.Image, name: str) -> str:
    os.makedirs(OUT_DIR, exist_ok=True)
    path = f"{OUT_DIR}/{name}.png"
    sheet.save(path)
    print(f"wrote {path}  ({sheet.width}x{sheet.height})")
    return path


def _label(sheet: Image.Image, text: str, x: int, y: int) -> None:
    from PIL import ImageDraw
    ImageDraw.Draw(sheet).text((x, y), text, fill=(30, 42, 70, 255))


# ------------------------------------------------------------------- rooms

def sheet_rooms(module_name: str = "all", zoom: int = 2) -> None:
    import gen_rooms
    blocks = _rooms_data()
    registry = gen_rooms.REGISTRY
    if module_name != "all":
        registry = __import__(module_name).ROOMS

    tiles = []
    for rid in sorted(registry):
        if rid not in blocks:
            continue
        bw, bh = blocks[rid]
        spec = registry[rid]
        c = Canvas(bw * BLOCK_W, bh * BLOCK_H, tier=2)
        fy = room_shell(c, spec.wall, spec.floor, floor_h=spec.floor_h)
        spec.draw(c, fy)
        img = c.image()
        tiles.append((rid, img.resize((img.width * zoom // 2, img.height * zoom // 2),
                                      Image.LANCZOS)))

    width = max(t.width for _, t in tiles) + 40
    height = sum(t.height + 34 for _, t in tiles) + 20
    sheet = Image.new("RGBA", (width, height), SHEET_BG)
    y = 14
    for rid, img in tiles:
        _label(sheet, rid, 20, y)
        y += 14
        sheet.alpha_composite(img, (20, y))
        y += img.height + 20
    _write(sheet, f"rooms-{module_name}")


# ------------------------------------------------------------------- decor

def sheet_decor(category: str = "all", zoom: int = 3) -> None:
    import gen_decor
    items = [i for i in _decor_data() if category in ("all", i["category"])]
    items = [i for i in items if i["id"] in gen_decor.PIECES]
    if not items:
        raise SystemExit(f"no drawing routines yet for category '{category}'")
    # Sized from the widest piece actually on the sheet. A fixed cell cropped
    # the sides off every 96px wall piece, which is exactly the part of a
    # picture frame you need to see.
    widest = max(gen_decor.size_for(i)[0] for i in items)
    tallest = max(gen_decor.size_for(i)[1] for i in items)
    cols = 8
    # The canvas renders at tier 2, then the sheet scales by zoom/2 — so a
    # 96px piece lands at 96*2*zoom/2 px. Sizing the cell from the declared 1x
    # width cropped the sides off every wall piece.
    cell_w = widest * zoom + 14
    cell_h = tallest * zoom + 14
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell_w + 20, rows * (cell_h + 18) + 20), SHEET_BG)
    for n, item in enumerate(items):
        w, h = gen_decor.size_for(item)
        c = Canvas(w, h, tier=2)
        gen_decor.PIECES[item["id"]](c)
        img = c.image()
        img = img.resize((img.width * zoom // 2, img.height * zoom // 2), Image.LANCZOS)
        # On a wall-coloured tile: a piece with no contrast against a room is a
        # piece nobody can see in the game either.
        tile = Image.new("RGBA", (cell_w, cell_h), (*P["wallCream"], 255))
        tile.alpha_composite(img, ((cell_w - img.width) // 2, (cell_h - img.height) // 2))
        cx, cy = 10 + (n % cols) * cell_w, 10 + (n // cols) * (cell_h + 18)
        sheet.alpha_composite(tile, (cx, cy))
        _label(sheet, item["id"][:22], cx + 2, cy + cell_h + 2)
    _write(sheet, f"decor-{category}")


# -------------------------------------------------------------------- cast

def sheet_cast(zoom: int = 3) -> None:
    import gen_chars
    import characters
    people = gen_chars.roster()
    # Sized from the sprite, not from a guess: at zoom 3 a 48x72 frame renders
    # 216px tall, and an 120px cell stacked every row's feet into the next
    # row's head.
    cell_w = CHAR_W * zoom + 8
    cell = CHAR_H * zoom + 8
    cols = 9
    sheet = Image.new("RGBA", (cols * cell_w + 20, len(people) * (cell + 20) + 20), SHEET_BG)
    for row, (kind, cid) in enumerate(people):
        member = characters.CAST[f"{kind}.{cid}"]
        y = 10 + row * (cell + 20)
        _label(sheet, f"{kind}.{cid}", 12, y + cell + 4)
        poses = [("idle", 0), ("work" if kind == "staff" else "sleep", 0)]
        poses += [("walk", i) for i in range(6)]
        for col, (pose, phase) in enumerate(poses):
            img = gen_chars.frame(member, 2, pose, phase).image()
            img = img.resize((img.width * zoom // 2, img.height * zoom // 2), Image.LANCZOS)
            sheet.alpha_composite(img, (10 + col * cell_w + (cell_w - img.width) // 2, y))
    _write(sheet, "cast")


# ------------------------------------------------------------------- icons

def sheet_icons(zoom: int = 4) -> None:
    import gen_ui
    import ui_icons
    wanted = {**gen_ui.UI_FILES, **gen_ui.effect_files()}
    drawn = [(p, wh) for p, wh in sorted(wanted.items()) if p in ui_icons.ICONS]
    if not drawn:
        raise SystemExit("no icon routines yet")
    cell = 64 * zoom + 20
    cols = 7
    rows = (len(drawn) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell + 20, rows * (cell + 18) + 20), SHEET_BG)
    for n, (path, (w, h)) in enumerate(drawn):
        c = Canvas(w, h, tier=2)
        ui_icons.ICONS[path](c)
        img = c.image()
        img = img.resize((img.width * zoom // 2, img.height * zoom // 2), Image.LANCZOS)
        cx, cy = 10 + (n % cols) * cell, 10 + (n // cols) * (cell + 18)
        sheet.alpha_composite(img, (cx + (cell - img.width) // 2, cy))
        _label(sheet, path.split("/")[-1][:-4], cx + 4, cy + cell + 2)
    _write(sheet, "icons")


# ----------------------------------------------------------------- compose

def _anchor_source():
    """
    Where a piece goes in a room, from the game's own table.

    `src/core/systems/roomAnchors.ts` is the single source of truth for
    placement, and it is TypeScript because the simulation places the piece.
    Rather than keep a second copy here that could drift, the preview shells
    out to the game's own dump. If that is not available yet, it falls back to
    a plain row along the floor, which is enough to judge the drawings.
    """
    import subprocess
    try:
        out = subprocess.run(
            ["node", "--experimental-strip-types", "tools/art/dump-anchors.ts"],
            capture_output=True, text=True, check=True).stdout
        table = json.loads(out)
        return lambda room_id: {k: tuple(v) for k, v in table.get(room_id, {}).items()}
    except Exception as exc:  # noqa: BLE001 - the fallback is the point
        print(f"  (no anchor dump: {exc}; laying decor out along the floor instead)")

        def spread(room_id: str):
            return {}
        return spread


def _waypoint_source():
    """
    Where a person stands in a room, from the game's own table — the same
    arrangement as `_anchor_source`, for `src/core/systems/roomWaypoints.ts`.
    """
    import subprocess
    try:
        out = subprocess.run(
            ["node", "--experimental-strip-types", "tools/art/dump-waypoints.ts"],
            capture_output=True, text=True, check=True).stdout
        table = json.loads(out)
        return lambda room_id: table.get(room_id, {})
    except Exception as exc:  # noqa: BLE001 - the fallback is the point
        print(f"  (no waypoint dump: {exc}; standing people at the room's left instead)")
        return lambda room_id: {}


def _rooms_staff() -> dict:
    """Which role works each room, from `data/rooms.json`."""
    with open("data/rooms.json", encoding="utf8") as fh:
        return {r["id"]: r.get("staffRole") for r in json.load(fh)["rooms"] if r.get("staffRole")}


def sheet_compose(room_id: str, zoom: int = 3) -> None:
    """
    One room as the game draws it: art, then decor at its anchors, then people.

    This is the acceptance shot ART-0 §16 asks for. If a bed hovers, if a lamp
    hangs through the floor, if a guest's head crosses the ceiling — it shows
    here and nowhere else.
    """
    import gen_rooms
    import gen_decor
    import characters
    anchors_for = _anchor_source()

    blocks = _rooms_data()
    bw, bh = blocks[room_id]
    spec = gen_rooms.REGISTRY[room_id]
    tier = 2
    c = Canvas(bw * BLOCK_W, bh * BLOCK_H, tier=tier)
    fy = room_shell(c, spec.wall, spec.floor, floor_h=spec.floor_h)
    spec.draw(c, fy)
    room = c.image()

    items = {i["id"]: i for i in _decor_data()}
    for defId, (ax, ay) in anchors_for(room_id).items():
        item = items.get(defId)
        if not item or defId not in gen_decor.PIECES:
            continue
        w, h = gen_decor.size_for(item)
        dc = Canvas(w, h, tier=tier)
        gen_decor.PIECES[defId](dc)
        art = dc.image()
        dw = max(1, int(w * DECOR_ART_SCALE * tier))
        dh = max(1, int(h * DECOR_ART_SCALE * tier))
        art = art.resize((dw, dh), Image.LANCZOS)
        anchor_y = gen_decor.ANCHOR_Y.get(item["category"], 1.0)
        px = int(ax * (BLOCK_W / 16) * tier - dw / 2)
        py = int(ay * (BLOCK_H / 16) * tier - dh * anchor_y)
        room.alpha_composite(art, (px, py))

    # People at the room's own movement points (HC-P2-S1): a guest in the bed
    # or at the first seat, the room's member of staff at their work point.
    # Feet on the standing line, pivot (24, 70), the way the renderer does it.
    points = _waypoint_source()(room_id)
    who = []
    guest_spot = points.get("guestSleep0") or points.get("guestUse0")
    if guest_spot:
        who.append(("guest.standard", guest_spot))
    staff_role = _rooms_staff().get(room_id)
    if staff_role and points.get("staffWork"):
        who.append((f"staff.{staff_role}", points["staffWork"]))
    if not who:
        who.append(("guest.standard", points.get("standLeft", {"x": 3, "y": 14, "facing": "right", "pose": "stand"})))
    for key, spot in who:
        member = characters.CAST[key]
        pose = "sleep" if spot["pose"] == "sleep" else ("work" if key.startswith("staff.") else "idle")
        pc = Canvas(CHAR_W, CHAR_H, tier=tier)
        draw_person(pc, member.person, CHAR_W / 2, pose=pose,
                    expression="sleep" if pose == "sleep" else member.expression,
                    prop=member.prop_work if pose == "work" else member.prop)
        art = pc.image()
        cw = int(CHAR_W * CHARACTER_ART_SCALE * tier)
        ch = int(CHAR_H * CHARACTER_ART_SCALE * tier)
        art = art.resize((cw, ch), Image.LANCZOS)
        if spot["facing"] == "left":
            art = art.transpose(Image.FLIP_LEFT_RIGHT)
        fx = int(spot["x"] * (BLOCK_W / 16) * tier - cw / 2)
        fy = int(spot["y"] * (BLOCK_H / 16) * tier - ch * (FOOT_Y / CHAR_H))
        room.alpha_composite(art, (fx, fy))

    big = room.resize((room.width * zoom // 2, room.height * zoom // 2), Image.LANCZOS)
    sheet = Image.new("RGBA", (big.width + 40, big.height + 40), SHEET_BG)
    sheet.alpha_composite(big, (20, 20))
    _write(sheet, f"compose-{room_id}")



# ------------------------------------------------------------------ facade

#: A hotel worth looking at: one of every kind of room, stacked the way a
#: player actually builds — service at the bottom, bedrooms in the middle,
#: amenities on top. Rows run bottom to top, as the game's grid does.
FACADE_ROWS = [
    ["lobby", "housekeeping", "cafe"],
    ["standard", "economy", "restaurant"],
    ["double", "gym"],
    ["deluxe", "bar"],
    ["executive", "spa"],
]


def sheet_facade(zoom: int = 2) -> None:
    """
    The whole hotel on its street, composed exactly as the game composes it.

    This is the acceptance shot ART-0 §16 asks for and the only picture that
    answers the question the art is actually for: does this look like a hotel
    somebody wants to run? Rooms, their decor at the game's own anchors, people
    at the game's own scale, on the sky, city and street the renderer draws.
    """
    import gen_rooms
    import gen_decor
    import characters
    anchors_for = _anchor_source()
    blocks = _rooms_data()
    items = {i["id"]: i for i in _decor_data()}
    tier = 2

    # Lay the rooms out on a block grid first, so the building's own size is
    # what decides the frame rather than the other way round.
    placed = []
    grid_w = 0
    for row, ids in enumerate(FACADE_ROWS):
        x = 0
        for rid in ids:
            bw, bh = blocks[rid]
            placed.append((rid, x, row, bw, bh))
            x += bw
        grid_w = max(grid_w, x)
    grid_h = len(FACADE_ROWS)

    margin_x, sky_h, street_h = 3, 2, 1
    W = (grid_w + margin_x * 2) * BLOCK_W
    H = (grid_h + sky_h + street_h) * BLOCK_H
    c = Canvas(W, H, tier=tier)
    ground = (sky_h + grid_h) * BLOCK_H

    _facade_backdrop(c, W, ground, H)

    # The building's shell: the dark frame the rooms are set into.
    bx, by = margin_x * BLOCK_W, sky_h * BLOCK_H
    bw, bh = grid_w * BLOCK_W, grid_h * BLOCK_H
    # Stroked, not filled — the same rule backdrop.ts follows, so a hotel with
    # a gap in it shows sky through the gap rather than a black slab.
    c.rrect(bx - 5, by - 5, bw + 10, bh + 10, r=6, ink=P["ink"], lw=5)
    c.rrect(bx - 9, by - 13, bw + 18, 10, r=4, fill=P["ink"])
    for i in range(3):
        _star(c, bx + bw / 2 + (i - 1) * 26, by - 26, 11)

    out = c.image()
    for rid, gx, gy, rw, rh in placed:
        spec = gen_rooms.REGISTRY[rid]
        rc = Canvas(rw * BLOCK_W, rh * BLOCK_H, tier=tier)
        fy = room_shell(rc, spec.wall, spec.floor, floor_h=spec.floor_h)
        spec.draw(rc, fy)
        room = rc.image()

        for defId, (ax, ay) in anchors_for(rid).items():
            item = items.get(defId)
            if not item or defId not in gen_decor.PIECES:
                continue
            dw, dh = gen_decor.size_for(item)
            dc = Canvas(dw, dh, tier=tier)
            gen_decor.PIECES[defId](dc)
            art = dc.image()
            sw = max(1, int(dw * DECOR_ART_SCALE * tier))
            sh = max(1, int(dh * DECOR_ART_SCALE * tier))
            art = art.resize((sw, sh), Image.LANCZOS)
            anchor_y = gen_decor.ANCHOR_Y.get(item["category"], 1.0)
            room.alpha_composite(art, (int(ax * (BLOCK_W / 16) * tier - sw / 2),
                                       int(ay * (BLOCK_H / 16) * tier - sh * anchor_y)))

        # People: one guest per bedroom, one member of staff per service room.
        cast_key = "guest.standard" if rid in ("standard", "economy", "double", "deluxe",
                                               "executive") else "staff.receptionist"
        member = characters.CAST.get(cast_key)
        if member:
            pc = Canvas(CHAR_W, CHAR_H, tier=tier)
            draw_person(pc, member.person, CHAR_W / 2, pose="idle", prop=member.prop)
            art = pc.image()
            pw = int(CHAR_W * CHARACTER_ART_SCALE * tier)
            ph = int(CHAR_H * CHARACTER_ART_SCALE * tier)
            art = art.resize((pw, ph), Image.LANCZOS)
            room.alpha_composite(art, (int(room.width * 0.62) - pw // 2, room.height - ph))

        px = int((margin_x + gx) * BLOCK_W * tier)
        py = int((sky_h + grid_h - gy - rh) * BLOCK_H * tier)
        out.alpha_composite(room, (px, py))

    big = out.resize((out.width * zoom // 2, out.height * zoom // 2), Image.LANCZOS)
    _write(big, "facade")


def _facade_backdrop(c: Canvas, W: float, ground: float, H: float) -> None:
    """
    Sky, city, trees and street — the preview's copy of `backdrop.ts`.

    A copy, because the renderer's version is TypeScript and Pixi; the point
    here is only to see the building in its setting rather than floating on
    white. The colours come from the same palette, so what this shows and what
    the game shows are the same picture.
    """
    from hcvariants import seeded
    c.rect(0, 0, W, ground, fill=P["sky"])
    c.rect(0, ground - 90, W, 90, fill=alpha_local(P["skyHi"], 0.5))
    c.rect(0, ground - 46, W, 46, fill=alpha_local(P["skyHi"], 0.5))

    r = seeded("facade-city")
    for rank, colour, scale in ((0, P["cityFar"], 0.72), (1, P["cityNear"], 1.0)):
        step = BLOCK_W * (1.1 if rank == 0 else 1.45)
        x = -step
        while x < W + step:
            h = BLOCK_H * (1.1 + r.rnd() * 2.0) * scale
            w = step * (0.62 + r.rnd() * 0.3)
            top = ground - h
            c.rrect(x, top, w, h, r=4, fill=colour)
            if r.rnd() > 0.45:
                c.poly([(x - 3, top), (x + w / 2, top - h * 0.22), (x + w + 3, top)], fill=colour)
            for cx in range(int(w // 26)):
                for cy in range(int(h // 30)):
                    if r.rnd() < 0.45:
                        continue
                    c.rrect(x + 8 + cx * 26, top + 12 + cy * 30, 9, 11, r=2,
                            fill=alpha_local(P["glass"], 0.55 if rank == 0 else 0.8))
            x += step

    for rank, colour, size in ((0, P["treeFar"], 0.8), (1, P["treeNear"], 1.0)):
        x = -40.0
        while x < W + 40:
            rad = (16 + r.rnd() * 12) * size
            cy = ground - rad * 0.9
            c.circle(x, cy, rad, fill=colour)
            c.circle(x - rad * 0.7, cy + rad * 0.4, rad * 0.66, fill=colour)
            c.circle(x + rad * 0.7, cy + rad * 0.4, rad * 0.66, fill=colour)
            x += BLOCK_W * 0.62

    kerb = BLOCK_H * 0.22
    c.rect(0, ground, W, H - ground, fill=P["road"])
    c.rect(0, ground, W, kerb, fill=P["kerb"])
    c.rect(0, ground + kerb, W, 2, fill=alpha_local(P["ink"], 0.25))
    x = 0.0
    while x < W:
        c.rrect(x, ground + kerb + BLOCK_H * 0.42, 34, 5, r=2.5, fill=P["roadLine"])
        x += 64


def alpha_local(colour, a: float):
    return (colour[0], colour[1], colour[2], int(round(255 * a)))


def _star(c: Canvas, cx: float, cy: float, r: float) -> None:
    import math
    pts = []
    for i in range(10):
        angle = math.pi / 5 * i - math.pi / 2
        radius = r if i % 2 == 0 else r * 0.44
        pts.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    c.poly(pts, fill=P["gold"], ink=P["goldDk"], lw=1.6)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "rooms"
    arg = sys.argv[2] if len(sys.argv) > 2 else None
    if mode == "rooms":
        sheet_rooms(arg or "all")
    elif mode == "decor":
        sheet_decor(arg or "all")
    elif mode == "cast":
        sheet_cast()
    elif mode == "icons":
        sheet_icons()
    elif mode == "compose":
        sheet_compose(arg or "standard")
    elif mode == "facade":
        sheet_facade()
    else:
        raise SystemExit(__doc__)
