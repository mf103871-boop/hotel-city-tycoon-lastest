#!/usr/bin/env python3
"""
All 23 room interiors, plus the night, dirty, pest and thumb variants derived
from each base image rather than drawn separately.

Deriving the variants is the quiet advantage of drawing in code: those are 92
extra files that would otherwise have to be produced by hand, and here they
fall out of three colour transforms and a resize.

Guest rooms escalate deliberately by tier. A presidential suite has to look
worth its 700,000 coins beside an economy room, or the economy of the whole
game stops reading on screen.

Run: python3 tools/art/gen_rooms.py [room_id ...]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw
from style import (
    SS, BLOCK_W, BLOCK_H, P, canvas, rect, outline, ellipse,
    shell, window, door, rug, bed, pendant, counter, plant, framed_art, chair, table,
)

OUT = "public/assets/rooms"


# ---------------------------------------------------------------- functional

def lobby(d, W, H):
    ceil_h, floor_h = shell(d, W, H, wall=P["wall_warm"])
    fy = H - floor_h
    window(d, int(W * 0.06), ceil_h + 6 * SS, int(W * 0.26), int(H * 0.42))
    door(d, int(W * 0.78), fy - int(H * 0.45), int(W * 0.16), int(H * 0.45))
    dw, dh = int(W * 0.34), int(H * 0.26)
    dx, dy = int(W * 0.36), fy - dh
    counter(d, dx, dy, dw, dh, top=P["brass"])
    rect(d, dx + dw // 2 - SS, dy - 5 * SS, 2 * SS, 5 * SS, P["brass_dim"])
    rect(d, dx + dw // 2 - 3 * SS, dy - 8 * SS, 6 * SS, 3 * SS, P["citylight"])
    rug(d, W // 2, fy + 2 * SS, int(W * 0.5), floor_h - 3 * SS, P["red"])
    plant(d, int(W * 0.26), fy)
    lx, lw = int(W * 0.72), int(W * 0.055)
    rect(d, lx, fy - int(H * 0.12), lw, int(H * 0.12), P["floor_hi"])
    rect(d, lx, fy - int(H * 0.12), lw, max(2, SS), P["brass_dim"])
    rect(d, lx + lw // 3, fy - int(H * 0.15), lw // 3, int(H * 0.03), P["brass_dim"])
    cx = int(W * 0.52)
    rect(d, cx, ceil_h + 5 * SS, 7 * SS, 7 * SS, P["brass_dim"])
    rect(d, cx + 2 * SS, ceil_h + 7 * SS, 3 * SS, 3 * SS, P["night"])


def housekeeping(d, W, H):
    ceil_h, floor_h = shell(d, W, H, wall=P["wall_util"], floor=P["floor_dark"])
    fy = H - floor_h
    sx, sw = int(W * 0.08), int(W * 0.52)
    for i in range(3):
        sy = ceil_h + 8 * SS + i * int(H * 0.2)
        rect(d, sx, sy, sw, max(2, SS), P["floor_hi"])
        for j in range(4):
            rect(d, sx + 3 * SS + j * (sw // 4), sy - 5 * SS, sw // 5, 5 * SS,
                 P["linen"] if (i + j) % 2 == 0 else P["linen_sh"])
    bx = int(W * 0.72)
    rect(d, bx, fy - int(H * 0.14), int(W * 0.14), int(H * 0.14), P["green"])
    rect(d, bx + int(W * 0.06), fy - int(H * 0.5), max(2, SS), int(H * 0.36), P["floor_hi"])


def laundry(d, W, H):
    ceil_h, floor_h = shell(d, W, H, wall=P["wall_util"], floor=P["tile"], tiled=True)
    fy = H - floor_h
    for i in range(3):
        mx = int(W * 0.08) + i * int(W * 0.3)
        mw, mh = int(W * 0.22), int(H * 0.34)
        rect(d, mx, fy - mh, mw, mh, P["grey"])
        rect(d, mx, fy - mh, mw, max(2, SS), P["white"])
        ellipse(d, mx + mw // 4, fy - mh + int(mh * 0.24), mw // 2, mw // 2, P["dark"])
        ellipse(d, mx + mw // 4 + 2 * SS, fy - mh + int(mh * 0.24) + 2 * SS,
                mw // 2 - 4 * SS, mw // 2 - 4 * SS, P["glass"])
    rect(d, 0, ceil_h + int(H * 0.12), W, max(1, SS), P["brass_lo"])
    for i in range(6):
        rect(d, int(W * 0.06) + i * int(W * 0.15), ceil_h + int(H * 0.12),
             int(W * 0.08), int(H * 0.14), P["linen"] if i % 2 else P["linen_sh"])


def staff_room(d, W, H):
    ceil_h, floor_h = shell(d, W, H, wall=P["wall_lo"])
    fy = H - floor_h
    window(d, int(W * 0.7), ceil_h + 7 * SS, int(W * 0.22), int(H * 0.32))
    sw = int(W * 0.34)
    rect(d, int(W * 0.08), fy - int(H * 0.2), sw, int(H * 0.2), P["green"])
    rect(d, int(W * 0.08), fy - int(H * 0.28), sw, int(H * 0.1), P["green_hi"])
    table(d, int(W * 0.48), fy, int(W * 0.16))
    for i in range(3):
        rect(d, int(W * 0.1) + i * int(W * 0.06), ceil_h + 8 * SS, int(W * 0.04), int(H * 0.1), P["brass_lo"])


def maintenance(d, W, H):
    ceil_h, floor_h = shell(d, W, H, wall=P["wall_util"], floor=P["floor_dark"])
    fy = H - floor_h
    bw = int(W * 0.44)
    rect(d, int(W * 0.06), fy - int(H * 0.18), bw, int(H * 0.18), P["floor_hi"])
    rect(d, int(W * 0.06), fy - int(H * 0.18), bw, max(2, SS), P["grey"])
    for i, c in enumerate((P["brass"], P["grey"], P["red"], P["brass_dim"], P["grey"])):
        rect(d, int(W * 0.09) + i * int(W * 0.08), ceil_h + int(H * 0.16), 3 * SS, int(H * 0.16), c)
    rect(d, int(W * 0.06), ceil_h + int(H * 0.32), bw, max(1, SS), P["brass_lo"])
    px = int(W * 0.62)
    for i in range(3):
        rect(d, px, ceil_h + int(H * 0.14) + i * int(H * 0.2), int(W * 0.3), max(2, SS), P["grey"])
    rect(d, int(W * 0.8), fy - int(H * 0.22), int(W * 0.12), int(H * 0.22), P["red"])


def business(d, W, H):
    ceil_h, floor_h = shell(d, W, H, wall=P["wall_hi"])
    fy = H - floor_h
    window(d, int(W * 0.04), ceil_h + 6 * SS, int(W * 0.24), int(H * 0.4))
    dw = int(W * 0.3)
    counter(d, int(W * 0.34), fy - int(H * 0.2), dw, int(H * 0.2))
    for i in range(2):
        sx = int(W * 0.38) + i * int(W * 0.14)
        rect(d, sx, fy - int(H * 0.32), int(W * 0.1), int(H * 0.12), P["dark"])
        rect(d, sx + SS, fy - int(H * 0.32) + SS, int(W * 0.1) - 2 * SS, int(H * 0.12) - 2 * SS, P["glass"])
    chair(d, int(W * 0.42), fy, P["dark"])
    for i in range(3):
        framed_art(d, int(W * 0.7) + i * int(W * 0.1), ceil_h + 8 * SS,
                   int(W * 0.08), int(H * 0.16), P["blue"])
    plant(d, int(W * 0.92), fy, 0.9)


# ---------------------------------------------------------------- guest rooms

def guest_room(tier, extras=None):
    """One composition escalated by tier, so the price ladder is visible."""
    def draw(d, W, H):
        walls = [P["wall"], P["wall_hi"], P["wall_hi"], P["wall_warm"],
                 P["wall_warm"], P["wall_rich"], P["wall_rich"], P["wall_rich"], P["wall_rich"]]
        floors = [P["floor"], P["floor"], P["floor_hi"], P["floor_hi"],
                  P["floor_hi"], P["floor_pale"], P["floor_pale"], P["floor_pale"], P["floor_pale"]]
        ceil_h, floor_h = shell(d, W, H, wall=walls[tier - 1], floor=floors[tier - 1])
        fy = H - floor_h

        wins = 1 if tier <= 3 else 2 if tier <= 6 else 3
        wx = W - int(W * 0.08)
        win_left = W
        for _ in range(wins):
            w = int(W * (0.26 if wins == 1 else 0.2 if wins == 2 else 0.15))
            window(d, wx - w, ceil_h + 6 * SS, w, int(H * 0.36))
            win_left = min(win_left, wx - w)
            wx -= w + int(W * 0.03)

        bw = int(W * (0.42 if tier <= 2 else 0.34 if tier <= 5 else 0.26))
        bed(d, int(W * 0.07), fy, bw, tier)

        if tier <= 2:
            rect(d, int(W * 0.5), ceil_h, max(1, SS), 6 * SS, P["brass_lo"])
            rect(d, int(W * 0.5) - 2 * SS, ceil_h + 6 * SS, 4 * SS, 3 * SS, P["citylight"])
        else:
            # Hang it clear of the glass; on two- and three-window rooms the
            # centre of the wall is behind a window.
            pendant(d, max(int(W * 0.3), win_left - int(W * 0.07)),
                    ceil_h, int(H * 0.16), int(W * 0.09))

        if tier >= 2:
            tx = int(W * 0.07) + bw + 2 * SS
            rect(d, tx, fy - int(H * 0.13), int(W * 0.06), int(H * 0.13), P["floor_hi"])
            rect(d, tx + int(W * 0.015), fy - int(H * 0.2), int(W * 0.03), int(H * 0.07), P["citylight"])
        if tier >= 3:
            rug(d, int(W * 0.44), fy + 2 * SS, int(W * 0.34), floor_h - 4 * SS,
                [P["green"], P["red"], P["purple"], P["purple_hi"],
                 P["red_hi"], P["silk"], P["silk"]][min(tier - 3, 6)])
        if tier >= 4:
            framed_art(d, int(W * 0.1), ceil_h + 8 * SS, int(W * 0.14), int(H * 0.18), P["purple"])
        if tier >= 5:
            sx = int(W * 0.44)
            rect(d, sx, fy - int(H * 0.16), int(W * 0.14), int(H * 0.08),
                 P["silk"] if tier >= 7 else P["green_hi"])
            rect(d, sx, fy - int(H * 0.08), int(W * 0.14), int(H * 0.08), P["floor_dark"])
        if tier >= 6:
            plant(d, int(W * 0.62), fy, 1.1)
        if tier >= 7:
            rect(d, 0, int(H * 0.58), W, max(1, SS), P["brass_lo"])
            cx = int(W * 0.5)
            for ox in (-6, -2, 2, 6):
                rect(d, cx + ox * SS, ceil_h + int(H * 0.15), 2 * SS, 3 * SS, P["citylight"])
        if tier >= 8:
            table(d, int(W * 0.7), fy, int(W * 0.11), P["floor_pale"])
            chair(d, int(W * 0.67), fy, P["purple_hi"])
        if extras:
            extras(d, W, H, ceil_h, floor_h)
    return draw


def presidential_extras(d, W, H, ceil_h, floor_h):
    """A mezzanine only this suite gets — two storeys inside one room."""
    fy = H - floor_h
    mid = int(H * 0.52)
    rect(d, 0, mid, W, max(2, SS), P["brass_dim"])
    rect(d, int(W * 0.55), mid - int(H * 0.02), int(W * 0.4), int(H * 0.02), P["floor_pale"])
    for i in range(6):
        rect(d, int(W * 0.57) + i * int(W * 0.06), mid - int(H * 0.08), max(1, SS), int(H * 0.06), P["brass_lo"])
    rect(d, int(W * 0.2), mid, max(2, SS), fy - mid, P["brass_dim"])
    for i in range(5):
        rect(d, int(W * 0.2), mid + i * ((fy - mid) // 5), int(W * 0.09), max(2, SS), P["floor_pale"])


# ---------------------------------------------------------------- commercial

def cafe(d, W, H):
    ceil_h, floor_h = shell(d, W, H, wall=P["wall_warm"])
    fy = H - floor_h
    bw = int(W * 0.42)
    counter(d, int(W * 0.06), fy - int(H * 0.24), bw, int(H * 0.24), top=P["brass"])
    for i, col in enumerate((P["red"], P["green"], P["brass_dim"], P["purple"], P["citylight"])):
        bx = int(W * 0.09) + i * (bw // 5)
        rect(d, bx, ceil_h + int(H * 0.26), 5 * SS, int(H * 0.18), col)
        rect(d, bx + SS, ceil_h + int(H * 0.22), 3 * SS, int(H * 0.05), col)
    rect(d, int(W * 0.06), ceil_h + int(H * 0.44), bw, max(2, SS), P["brass_lo"])
    for k, frac in enumerate((0.58, 0.82)):
        tx = int(W * frac)
        table(d, tx, fy, int(W * 0.13))
        seat = P["red"] if k == 0 else P["purple"]
        chair(d, tx - 6 * SS, fy, seat, True)
        chair(d, tx + int(W * 0.13) + 2 * SS, fy, seat, False)
        pendant(d, tx + int(W * 0.065), ceil_h, int(H * 0.2), 8 * SS)


def gym(d, W, H):
    ceil_h, floor_h = shell(d, W, H, wall=P["wall_util"], floor=P["floor_dark"])
    fy = H - floor_h
    rect(d, int(W * 0.04), ceil_h + 5 * SS, int(W * 0.38), int(H * 0.44), P["glass"])
    outline(d, int(W * 0.04), ceil_h + 5 * SS, int(W * 0.38), int(H * 0.44), P["grey"])
    tx = int(W * 0.48)
    rect(d, tx, fy - int(H * 0.1), int(W * 0.22), int(H * 0.1), P["dark"])
    rect(d, tx, fy - int(H * 0.12), int(W * 0.22), int(H * 0.03), P["grey"])
    rect(d, tx + int(W * 0.18), fy - int(H * 0.34), max(2, SS), int(H * 0.24), P["grey"])
    rect(d, tx + int(W * 0.13), fy - int(H * 0.36), int(W * 0.1), 3 * SS, P["grey"])
    rx = int(W * 0.76)
    rect(d, rx, fy - int(H * 0.14), int(W * 0.2), max(2, SS), P["grey"])
    for i in range(3):
        bx = rx + 2 * SS + i * int(W * 0.06)
        rect(d, bx, fy - int(H * 0.19), 3 * SS, 4 * SS, P["dark"])
        rect(d, bx - SS, fy - int(H * 0.2), 5 * SS, 2 * SS, P["dark"])


def restaurant(d, W, H):
    ceil_h, floor_h = shell(d, W, H, wall=P["wall_rich"], floor=P["floor_hi"])
    fy = H - floor_h
    window(d, int(W * 0.04), ceil_h + 6 * SS, int(W * 0.18), int(H * 0.38))
    for frac in (0.3, 0.55, 0.8):
        tx = int(W * frac)
        table(d, tx, fy, int(W * 0.12), P["linen"])
        chair(d, tx - 5 * SS, fy, P["red"], True)
        chair(d, tx + int(W * 0.12) + SS, fy, P["red"], False)
        rect(d, tx + int(W * 0.055), fy - int(H * 0.21), 2 * SS, 4 * SS, P["citylight"])
        pendant(d, tx + int(W * 0.06), ceil_h, int(H * 0.14), 7 * SS)


def bar(d, W, H):
    ceil_h, floor_h = shell(d, W, H, wall=P["wall_rich"], floor=P["floor_dark"])
    fy = H - floor_h
    bw = int(W * 0.54)
    counter(d, int(W * 0.06), fy - int(H * 0.26), bw, int(H * 0.26), top=P["brass"])
    rect(d, int(W * 0.06), ceil_h + int(H * 0.18), bw, int(H * 0.26), P["dark"])
    for i in range(8):
        bx = int(W * 0.08) + i * (bw // 8)
        col = [P["red"], P["green"], P["brass"], P["purple"], P["citylight"]][i % 5]
        rect(d, bx, ceil_h + int(H * 0.24), 3 * SS, int(H * 0.16), col)
    rect(d, int(W * 0.06), ceil_h + int(H * 0.44), bw, max(2, SS), P["brass_dim"])
    for i in range(3):
        sx = int(W * 0.66) + i * int(W * 0.1)
        rect(d, sx, fy - int(H * 0.16), 6 * SS, 3 * SS, P["red"])
        rect(d, sx + 2 * SS, fy - int(H * 0.13), 2 * SS, int(H * 0.13), P["brass_lo"])


def arcade(d, W, H):
    ceil_h, floor_h = shell(d, W, H, wall=P["wall_lo"], floor=P["floor_dark"])
    fy = H - floor_h
    for i in range(4):
        cx = int(W * 0.06) + i * int(W * 0.235)
        cw, ch = int(W * 0.17), int(H * 0.46)
        col = [P["red"], P["blue"], P["purple_hi"], P["green_hi"]][i]
        rect(d, cx, fy - ch, cw, ch, col)
        rect(d, cx + 2 * SS, fy - ch + 3 * SS, cw - 4 * SS, int(ch * 0.36), P["dark"])
        rect(d, cx + 3 * SS, fy - ch + 4 * SS, cw - 6 * SS, int(ch * 0.3), P["glass"])
        rect(d, cx + 2 * SS, fy - int(ch * 0.5), cw - 4 * SS, 3 * SS, P["citylight"])
        rect(d, cx, fy - ch, cw, 3 * SS, P["citylight"])


def cinema(d, W, H):
    ceil_h, floor_h = shell(d, W, H, wall=P["dark"], floor=P["floor_dark"])
    fy = H - floor_h
    sw, sh = int(W * 0.48), int(H * 0.46)
    sx, sy = int(W * 0.05), ceil_h + 6 * SS
    rect(d, sx, sy, sw, sh, P["white"])
    rect(d, sx + 2 * SS, sy + 2 * SS, sw - 4 * SS, sh - 4 * SS, P["glass"])
    outline(d, sx, sy, sw, sh, P["brass_dim"])
    for row in range(2):
        ry = fy - int(H * 0.1) - row * int(H * 0.11)
        for i in range(6):
            rect(d, int(W * 0.58) + i * int(W * 0.065), ry, int(W * 0.05), int(H * 0.1), P["red"])
            rect(d, int(W * 0.58) + i * int(W * 0.065), ry, int(W * 0.05), 2 * SS, P["red_hi"])


def spa(d, W, H):
    """The Disco. The id stays `spa` for saves and asset keys (decision 17a);
    the room itself is a nightclub: lit chequer floor, mirror ball, neon."""
    ceil_h, floor_h = shell(d, W, H, wall=P["night"], floor=P["floor_dark"])
    fy = H - floor_h
    rect(d, 0, fy, W, max(1, SS), P["brass_lo"])

    # Neon rails across the back wall, each with a soft halo, and a string of
    # tiny lights under the top rail.
    for i, col in enumerate((P["purple_hi"], P["water_hi"], P["red_hi"])):
        ny = ceil_h + int(H * 0.13) + i * int(H * 0.10)
        rect(d, int(W * 0.05), ny - SS, int(W * 0.60), 3 * SS, (*col[:3], 60))
        rect(d, int(W * 0.05), ny, int(W * 0.60), max(1, SS), col)
    for i in range(14):
        lx = int(W * 0.07) + i * int(W * 0.04)
        rect(d, lx, ceil_h + int(H * 0.09), max(1, SS), max(1, SS), P["citylight"])

    # Raised chequer dance floor: brass-edged plinth, three rows of eight
    # glowing tiles with dark grout, and mirror-ball speckles scattered on it.
    dx, dw = int(W * 0.26), int(W * 0.46)
    plinth_h = int(H * 0.045)
    rect(d, dx - 2 * SS, fy - plinth_h, dw + 4 * SS, plinth_h, P["dark"])
    rect(d, dx - 2 * SS, fy - plinth_h, dw + 4 * SS, max(1, SS), P["brass_lo"])
    tiles, rows = 8, 3
    tw = dw // tiles
    th = int(H * 0.06)
    glow = (P["purple_hi"], P["teal"], P["red_hi"], P["water_hi"])
    top = fy - plinth_h - rows * th
    for row in range(rows):
        ty = top + row * th
        for i in range(tiles):
            col = glow[(i + row) % len(glow)]
            rect(d, dx + i * tw + SS, ty + SS, tw - 2 * SS, th - 2 * SS, (*col[:3], 225))
    rect(d, dx, top, dw, max(1, SS), P["white"])
    speck = (P["purple_hi"], P["water_hi"], P["citylight"], P["white"])
    for i in range(26):
        sx = dx + ((i * 73) % dw)
        sy = top + ((i * 41) % (rows * th + plinth_h - 2 * SS))
        rect(d, sx, sy, max(1, SS), max(1, SS), (*speck[i % 4][:3], 190))

    # Mirror ball: brass drop, big faceted sphere with a halo and a glint,
    # and two very soft short beams that stop at the floor's top edge.
    bx, br = int(W * 0.49), int(H * 0.105)
    by = ceil_h + int(H * 0.21)
    ellipse(d, bx - int(br * 1.5), by - int(br * 1.5), br * 3, br * 3, (*P["glass"][:3], 34))
    rect(d, bx - max(1, SS // 2), ceil_h, max(1, SS), by - ceil_h - br, P["brass_lo"])
    ellipse(d, bx - br, by - br, br * 2, br * 2, P["grey"])
    for fx in range(-br, br, 3 * SS):
        for fyy in range(-br, br, 3 * SS):
            if fx * fx + fyy * fyy <= (br - SS) * (br - SS):
                rect(d, bx + fx, by + fyy, max(1, SS), max(1, SS), P["white"])
    ellipse(d, bx - br // 2, by - br + SS, br // 2, br // 2, (*P["white"][:3], 170))
    d.polygon([(bx, by + br), (bx - int(W * 0.095), top), (bx - int(W * 0.048), top)],
              fill=(*P["citylight"][:3], 18))
    d.polygon([(bx, by + br), (bx + int(W * 0.095), top), (bx + int(W * 0.048), top)],
              fill=(*P["citylight"][:3], 18))

    # DJ booth on the left: tall speakers with grille lines and a power dot,
    # a wide dark counter with a brass lip and a bold equaliser.
    cx, cw = int(W * 0.055), int(W * 0.155)
    for sx in (cx - int(W * 0.048), cx + cw + int(W * 0.006)):
        rect(d, sx, fy - int(H * 0.30), int(W * 0.042), int(H * 0.30), P["dark"])
        outline(d, sx, fy - int(H * 0.30), int(W * 0.042), int(H * 0.30), P["grey"])
        for i in range(4):
            rect(d, sx + SS, fy - int(H * 0.25) + i * int(H * 0.055),
                 int(W * 0.042) - 2 * SS, max(1, SS), P["grey"])
        rect(d, sx + int(W * 0.017), fy - int(H * 0.29), 2 * SS, 2 * SS, P["teal"])
    rect(d, cx, fy - int(H * 0.20), cw, int(H * 0.20), P["dark"])
    rect(d, cx, fy - int(H * 0.20), cw, 2 * SS, P["brass"])
    eq = ((P["green_hi"], 0.10), (P["red_hi"], 0.14), (P["water_hi"], 0.08), (P["purple_hi"], 0.12))
    for i, (col, hh) in enumerate(eq):
        rect(d, cx + 3 * SS + i * 5 * SS, fy - int(H * (0.03 + hh)), 3 * SS, int(H * hh), col)

    # Bar on the right: dark counter with a brass top and two stools, and a
    # mid-wall shelf of lit bottles with an under-glow.
    bxr, bw = int(W * 0.75), int(W * 0.20)
    shelf_y = ceil_h + int(H * 0.30)
    rect(d, bxr, shelf_y + int(H * 0.11), bw, max(1, SS), P["brass_dim"])
    rect(d, bxr, shelf_y + int(H * 0.115) + SS, bw, max(1, SS), (*P["water_hi"][:3], 90))
    bottle = (P["glass"], P["teal"], P["purple_hi"], P["glass"], P["red_hi"], P["teal"])
    for i, col in enumerate(bottle):
        gx = bxr + int(W * 0.015) + i * int(W * 0.031)
        rect(d, gx, shelf_y, 2 * SS, int(H * 0.11), col)
        rect(d, gx, shelf_y - 2 * SS, 2 * SS, 2 * SS, P["citylight"])
    rect(d, bxr, fy - int(H * 0.18), bw, int(H * 0.18), P["dark"])
    rect(d, bxr, fy - int(H * 0.20), bw, int(H * 0.02), P["brass"])
    for i in range(2):
        stx = bxr + int(W * 0.05) + i * int(W * 0.09)
        rect(d, stx, fy - int(H * 0.09), max(1, SS), int(H * 0.09), P["grey"])
        rect(d, stx - 2 * SS, fy - int(H * 0.11), 5 * SS, 2 * SS, P["silk"])


def pool(d, W, H):
    ceil_h, floor_h = shell(d, W, H, wall=P["wall_spa"], floor=P["tile"], tiled=True)
    fy = H - floor_h
    px, pw = int(W * 0.14), int(W * 0.6)
    ph = int(H * 0.3)
    py = fy - ph
    rect(d, px, py, pw, ph, P["water"])
    rect(d, px, py, pw, max(2, SS), P["water_hi"])
    for i in range(5):
        rect(d, px + int(W * 0.05) + i * int(W * 0.11), py + int(ph * 0.4),
             int(W * 0.05), max(1, SS), P["water_hi"])
    outline(d, px, py, pw, ph, P["white"], max(1, SS))
    rect(d, px + pw - 3 * SS, py - int(H * 0.08), max(2, SS), int(H * 0.12), P["white"])
    for i in range(2):
        lx = int(W * 0.78) + i * int(W * 0.1)
        rect(d, lx, fy - int(H * 0.08), int(W * 0.08), int(H * 0.03), P["linen"])
        rect(d, lx, fy - int(H * 0.15), int(W * 0.02), int(H * 0.08), P["linen"])
    window(d, int(W * 0.02), ceil_h + 6 * SS, int(W * 0.09), int(H * 0.4))


# ---------------------------------------------------------------- registry

ROOMS = {
    "lobby":        (2, 1, lobby),
    "housekeeping": (1, 1, housekeeping),
    "laundry":      (2, 1, laundry),
    "staffRoom":    (2, 1, staff_room),
    "maintenance":  (2, 1, maintenance),
    "business":     (3, 1, business),

    "economy":      (1, 1, guest_room(1)),
    "standard":     (1, 1, guest_room(2)),
    "double":       (2, 1, guest_room(3)),
    "family":       (2, 1, guest_room(4)),
    "deluxe":       (2, 1, guest_room(5)),
    "executive":    (3, 1, guest_room(6)),
    "honeymoon":    (3, 1, guest_room(7)),
    "luxurySuite":  (4, 1, guest_room(8)),
    "presidential": (3, 2, guest_room(9, presidential_extras)),

    "cafe":         (2, 1, cafe),
    "gym":          (2, 1, gym),
    "restaurant":   (3, 1, restaurant),
    "bar":          (2, 1, bar),
    "arcade":       (2, 1, arcade),
    "cinema":       (3, 1, cinema),
    "spa":          (3, 1, spa),
    "pool":         (4, 1, pool),
}


# ---------------------------------------------------------------- variants

def make_night(base):
    """Cooler ambient, brighter lamps. A colour transform, not a redraw."""
    out = base.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r > 190 and g > 150 and b < 170:
                px[x, y] = (min(255, r + 20), min(255, g + 24), min(255, b + 30), a)
            else:
                px[x, y] = (int(r * 0.62), int(g * 0.68), min(255, int(b * 0.92 + 14)), a)
    return out


def make_dirty(base):
    """Desaturated and yellowed, with grime settling toward the floor."""
    out = base.copy()
    px = out.load()
    h = out.height
    for y in range(h):
        grime = 0.18 + 0.34 * (y / h)
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = r * 0.3 + g * 0.59 + b * 0.11
            # Pull toward a muddy ochre, and darken: a neglected room should
            # be obvious from across the hotel, not a subtle colour grade.
            px[x, y] = (
                min(255, int((r * (1 - grime) + lum * grime * 1.15) * 0.88)),
                min(255, int((g * (1 - grime) + lum * grime * 0.98) * 0.84)),
                min(255, int((b * (1 - grime) + lum * grime * 0.55) * 0.78)),
                a,
            )
    return out


def make_pest(base):
    """A transparent overlay only, composited over the base at runtime."""
    out = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(out, "RGBA")
    w, h = base.size
    seed = 1
    for _ in range(max(6, w * h // 900)):
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        x = seed % max(1, w - 5)
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        y = int(h * 0.45) + seed % max(1, int(h * 0.5))
        d.ellipse([x, y, x + 3, y + 2], fill=(58, 42, 26, 235))
        d.point((x - 1, y), fill=(38, 28, 18, 220))
        d.point((x + 4, y), fill=(38, 28, 18, 220))
    return out


def render(room_id):
    bw, bh, fn = ROOMS[room_id]
    W, H = bw * BLOCK_W, bh * BLOCK_H
    img, d = canvas(W, H)
    fn(d, W * SS, H * SS)
    base = img.resize((W, H), Image.LANCZOS)

    os.makedirs(OUT, exist_ok=True)
    written = []
    for suffix, image in (
        ("base", base),
        ("night", make_night(base)),
        ("dirty", make_dirty(base)),
        ("pest", make_pest(base)),
        ("thumb", base.resize((96, 96), Image.LANCZOS)),
    ):
        path = f"{OUT}/{room_id}_{suffix}.png"
        image.save(path)
        written.append(path)
    return written, (W, H)


def derive_from_disk(room_id):
    """
    Rebuild the variants from an existing `<room>_base.png`.

    Supplied art replaces the procedural base but should still inherit the
    night, dirty, pest and thumb treatments — those are 92 files nobody should
    have to draw by hand.
    """
    base_path = f"{OUT}/{room_id}_base.png"
    if not os.path.exists(base_path):
        return None
    base = Image.open(base_path).convert("RGBA")
    written = []
    for suffix, image in (
        ("night", make_night(base)),
        ("dirty", make_dirty(base)),
        ("pest", make_pest(base)),
        ("thumb", base.resize((96, 96), Image.LANCZOS)),
    ):
        path = f"{OUT}/{room_id}_{suffix}.png"
        image.save(path)
        written.append(path)
    return written, base.size


if __name__ == "__main__":
    args = sys.argv[1:]
    derive_only = "--derive" in args
    args = [a for a in args if not a.startswith("--")]

    if derive_only:
        # Do not redraw anything: read the base art that is there and produce
        # its variants.
        total = 0
        for rid in args or list(ROOMS):
            result = derive_from_disk(rid)
            if result is None:
                print(f"  ? {rid:<14} no base art on disk")
                continue
            written, size = result
            total += len(written)
            print(f"  ✓ {rid:<14} {size[0]}x{size[1]}  -> {len(written)} variants")
        print(f"\n  {total} variant files derived from supplied art")
        raise SystemExit(0)

    wanted = args or list(ROOMS)
    total = 0
    for rid in wanted:
        if rid not in ROOMS:
            print(f"  ? unknown room {rid}")
            continue
        written, size = render(rid)
        total += len(written)
        print(f"  ✓ {rid:<14} {size[0]}x{size[1]}  (+{len(written) - 1} variants)")
    print(f"\n  {total} files written to {OUT}/")
