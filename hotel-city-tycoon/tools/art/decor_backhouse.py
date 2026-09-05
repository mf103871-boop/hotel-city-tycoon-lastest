"""
Housekeeping and the laundry — the two rooms behind the "staff only" door.

Neither room ever has a guest in it, so nothing here has to be beautiful; it
has to be *legible as work*. Housekeeping is the room the hotel is run from —
a board on the wall says which rooms are clean — and the laundry is a wet room
of steel, tile and hot water with one machine the size of a car. What
separates these six from the catalogue around them is therefore what each one
*is* rather than how it is dressed:

*   the two wall pieces are a chart and a noticeboard, not pictures: a white
    grid of coloured tags, and a row of odd socks pinned to cork. No scene, no
    mount, no tape, no gilt, so the eye reads "information" before "art";
*   the commercial washer is a dark riveted cube on a hazard-striped plinth
    with one porthole nearly as wide as itself, where the domestic washer is
    white with three small dials and a sock going round;
*   the drain tile is the only floor in the range with a fitting in it, and
    the tiled wall is the only wallpaper that is a grid with a pipe along its
    foot;
*   the batten is a single wide bar with a bright tube under it — every other
    light in the game hangs as a point: a globe, a cone, a ring, a truss of
    coloured heads.

Drawn against `hcstyle` and nothing else, and laid out from `c.w` / `c.h`
because every routine is handed a 1x and a 2x canvas. The helpers are imported
from `decor_props` (feet, shadows, carcasses) and `decor_surfaces` (panels,
frames, bands, cords, glow) rather than copied, so a laundry floor and a suite
floor are the same strip of material at the same y.
"""
from __future__ import annotations

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    alpha, shade, tint, mix, math,
)

from decor_props import _stand, _box, _bay
from decor_surfaces import (
    _panel, _art_frame, _band, _cord, _ceiling_plate, _glow, _as_wall_panel,
    PANEL_X, PANEL_Y, PANEL_W, PANEL_H,
)


# ------------------------------------------------------------ housekeeping

#: The three states a room can be in, as the housekeeper colours them:
#: clean, dirty, in progress. Same three accents the rest of the hotel uses,
#: so the board reads as part of the game's own UI rather than as a picture.
_STATUS = (P["mint"], P["coral"], P["gold"])


def wallArt_roomStatusBoard(c: Canvas) -> None:
    """
    The housekeeping board: a white grid of rooms, each with a coloured tag.

    A chart, not a picture. The frame is thin aluminium with no mount, the
    heading is two dashes where the words would be, and the twelve tags are
    what carries the piece: at 40px a white rectangle dotted with green, red
    and yellow squares is read before any line inside it is.
    """
    depth = 2.4
    ix, iy, iw, ih = _art_frame(c, 72.0, 52.0, P["metal"], lw=LW_PROP, depth=depth)
    c.rect(ix, iy, iw, ih, fill=P["white"])
    head = 6.0
    c.rect(ix, iy, iw, head, fill=P["tileDk"])
    c.line([(ix + 3.0, iy + head / 2), (ix + 21.0, iy + head / 2)], P["ink2"], 1.4)
    c.line([(ix + iw - 12.0, iy + head / 2), (ix + iw - 3.0, iy + head / 2)], P["ink2"], 1.4)
    c.line([(ix, iy + head), (ix + iw, iy + head)], P["ink"], LW_FACE)
    # The grid: four columns of three rooms. Any more cells and the tags
    # inside them drop under two device pixels.
    cols, rows = 4, 3
    gx, gy, gw, gh = ix, iy + head, iw, ih - head
    cw, ch = gw / cols, gh / rows
    grid = mix(P["tileDk"], P["metalDk"], 0.35)
    for i in range(1, cols):
        c.line([(gx + i * cw, gy), (gx + i * cw, gy + gh)], grid, LW_FACE)
    for j in range(1, rows):
        c.line([(gx, gy + j * ch), (gx + gw, gy + j * ch)], grid, LW_FACE)
    # One tag per cell in a fixed sequence — mostly clean, a few dirty, two in
    # progress — because the art has to be identical on every run.
    order = (0, 1, 0, 2, 0, 0, 1, 0, 2, 0, 1, 0)
    for k, s in enumerate(order):
        tx = gx + (k % cols) * cw + cw / 2
        ty = gy + (k // cols) * ch + ch / 2
        c.rrect(tx - 4.8, ty - 3.1, 9.6, 6.2, r=1.4, fill=_STATUS[s],
                ink=P["ink"], lw=LW_FACE)
    # The marker tray along the foot, with two markers lying in it. It hangs
    # a little below the frame so the bottom edge is not one straight line.
    fx0, fy1 = ix - depth, iy + ih + depth
    c.rrect(fx0 + 6.0, fy1 - 0.6, 72.0 - 12.0, 4.2, r=1.2, fill=P["metalDk"],
            ink=P["ink"], lw=LW_DETAIL)
    for k, col in enumerate((P["coral"], P["roomBlue"])):
        mx = fx0 + 12.0 + k * 13.0
        c.rrect(mx, fy1 + 0.2, 10.0, 2.6, r=1.2, fill=col, ink=P["ink"], lw=LW_FACE)
        c.rect(mx + 7.6, fy1 + 0.5, 1.8, 2.0, fill=P["black"])


# ----------------------------------------------------------------- laundry

def appliance_commercialWasher(c: Canvas) -> None:
    """
    The laundry's industrial front-loader.

    Where `appliance_washer` is a white box with three small dials, this is a
    dark riveted cube with one porthole nearly as wide as itself, standing on
    a plinth with a hazard stripe: at 40px a grey box with a giant dark
    circle, which no other machine in the catalogue is. Squarer than the
    domestic pair on purpose — it is taller, not wider, so the two silhouettes
    never match.
    """
    cx, half = _bay(c)
    half = min(half, 34.0)
    _stand(c, cx, half + 4.0)
    x0, x1 = cx - half, cx + half
    top = 8.0
    body = mix(P["metalDk"], P["ink2"], 0.30)
    # The plinth and its hazard stripe: a gold band with dark slashes. Seven
    # across the width is the most that stay separate at 55%.
    plinth_y = c.h - 8.0
    c.rrect(x0 - 2.0, plinth_y, half * 2 + 4.0, 8.0, r=1.6, fill=P["black"],
            ink=P["ink"], lw=LW_PROP)
    sy0, sy1 = plinth_y + 2.4, c.h - 2.4
    c.rect(x0 + 1.0, sy0, half * 2 - 2.0, sy1 - sy0, fill=P["gold"])
    n = 7
    for i in range(n):
        sx = x0 + 3.0 + i * (half * 2 - 6.0) / n
        c.poly([(sx, sy1), (sx + 3.0, sy0), (sx + 5.6, sy0), (sx + 2.6, sy1)],
               fill=P["ink2"])
    # The body: one dark carcass, a highlight along the top and a shade down
    # the right edge, and rivets where the panels meet.
    _box(c, x0, top, half * 2, plinth_y - top + 1.6, body, r=3.0, panel=False)
    c.rect(x0 + 3.0, top + 1.5, half * 2 - 6.0, 1.6, fill=tint(body, 0.28))
    c.rect(x1 - 4.4, top + 3.0, 2.4, plinth_y - top - 6.0, fill=shade(body, 0.26))
    ry0 = top + 3.4
    for rx in (x0 + 4.4, x1 - 4.4):
        for ry in (ry0 + 3.0, (ry0 + plinth_y) / 2 + 3.0, plinth_y - 4.4):
            c.circle(rx, ry, 1.4, fill=P["metal"], ink=P["ink"], lw=LW_FACE)
    # The readout: a slim black strip with red digits, in place of dials.
    c.rrect(x0 + 9.0, ry0, half * 2 - 18.0, 6.0, r=1.4, fill=P["black"],
            ink=P["ink"], lw=LW_FACE)
    c.rrect(x0 + 12.0, ry0 + 1.6, 20.0, 2.8, r=0.8, fill=P["coral"])
    for dx in (6.6, 13.2):
        c.rect(x0 + 12.0 + dx, ry0 + 1.6, 1.2, 2.8, fill=P["black"])
    c.circle(x1 - 13.0, ry0 + 3.0, 1.8, fill=P["green"], ink=P["ink"], lw=LW_FACE)
    # The porthole: a black rim, dark glass, water and a heap of pale suds.
    door_cy = (ry0 + 6.0 + plinth_y) / 2 + 1.0
    r = min(half * 0.72, (plinth_y - ry0 - 6.0) / 2 - 3.5)
    c.circle(cx, door_cy, r, fill=P["black"], ink=P["ink"], lw=LW_PROP)
    ri = r - 4.0
    c.circle(cx, door_cy, ri, fill=P["glassDk"], ink=P["ink"], lw=LW_DETAIL)
    c.pie(cx, door_cy, ri, ri, 0, 180, fill=P["water"])
    for dx, rr in ((-0.55, 0.34), (-0.08, 0.42), (0.46, 0.36)):
        c.circle(cx + dx * ri, door_cy + 0.06 * ri, rr * ri, fill=P["linen"])
    c.circle(cx - ri * 0.30, door_cy - ri * 0.55, 1.8, fill=alpha(P["white"], 0.55))
    c.circle(cx + ri * 0.28, door_cy - ri * 0.66, 1.2, fill=alpha(P["white"], 0.55))
    c.line([(cx - ri * 0.72, door_cy - ri * 0.30), (cx - ri * 0.38, door_cy - ri * 0.72)],
           tint(P["glassDk"], 0.55), LW_DETAIL)
    # Hinges on the left of the rim, the lever handle on the right: the door
    # swings, which is what says "front-loader" and not "porthole".
    for dy in (-6.0, 6.0):
        c.rrect(cx - r - 1.0, door_cy + dy - 2.2, 3.4, 4.4, r=1.0, fill=P["metal"],
                ink=P["ink"], lw=LW_FACE)
    hx = cx + r - 2.0
    c.rrect(hx - 2.8, door_cy - 8.5, 5.8, 17.0, r=2.4, fill=P["metal"],
            ink=P["ink"], lw=LW_DETAIL)
    c.circle(hx + 0.1, door_cy - 5.4, 1.2, fill=P["ink2"])


def flooring_drainTile(c: Canvas) -> None:
    """
    Non-slip ceramic on a square grid, with the floor drain in the middle.

    The only floor in the range with a fitting in it. The tiles are small and
    the grout is dark so the band reads as a grid rather than as slabs, and
    the drain is one dark disc dead centre — the mark that says "wet room"
    before the tile does.
    """
    base = mix(P["tile"], P["concrete"], 0.30)
    x, y, w, h = _band(c, 26.0, base)
    grout = shade(P["tileDk"], 0.45)
    cols, rows = 8, 3
    tw, th = (w - 3.2) / cols, (h - 3.2) / rows
    for i in range(1, cols):
        c.line([(x + 1.6 + i * tw, y + 1.6), (x + 1.6 + i * tw, y + h - 1.6)], grout, 1.0)
    for j in range(1, rows):
        c.line([(x + 1.6, y + 1.6 + j * th), (x + w - 1.6, y + 1.6 + j * th)], grout, 1.0)
    cx, cy = x + w / 2, y + h / 2
    # The wet sheen: two flat pale-blue washes fanning out from the drain, so
    # the floor around it reads as just-hosed rather than as dry stone.
    sheen = alpha(P["glass"], 0.32)
    c.ellipse(cx, cy + 1.0, 25.0, 8.5, fill=sheen)
    c.ellipse(cx, cy + 1.0, 14.0, 5.0, fill=sheen)
    # The drain: a dark chrome disc, one bright ring, a black eye and four
    # slots. Dark overall, because at 40px a pale disc on pale tile vanishes.
    c.circle(cx, cy, 8.4, fill=P["metalDk"], ink=P["ink"], lw=LW_PROP)
    c.circle(cx, cy, 5.6, ink=P["metal"], lw=LW_DETAIL)
    c.circle(cx, cy, 2.4, fill=P["black"], ink=P["ink"], lw=LW_FACE)
    for k in range(4):
        ang = math.radians(45 + k * 90)
        c.line([(cx + math.cos(ang) * 3.8, cy + math.sin(ang) * 3.8),
                (cx + math.cos(ang) * 7.0, cy + math.sin(ang) * 7.0)], P["black"], 1.3)


def _sock(c: Canvas, px: float, py: float, toe: int, tilt: float, colour,
          pattern: str, pin) -> None:
    """
    One odd sock hanging from a pin at (px, py), toe towards `toe` (±1).

    Built as a polygon and rotated by hand: Pillow rotates bitmaps, not
    shapes, and a rotated bitmap softens the outline every other shape keeps
    crisp. The cuff is a separate pale band, which is what makes a coloured
    blob read as a sock rather than as a boot.
    """
    a = math.radians(tilt)
    ca, sa = math.cos(a), math.sin(a)

    def R(x, y):
        x *= toe
        return (px + x * ca - y * sa, py + x * sa + y * ca)

    body = [(-3.2, 0.0), (3.2, 0.0), (3.2, 8.6), (6.4, 10.0), (8.2, 12.4),
            (7.0, 14.8), (-3.2, 14.8)]
    c.poly([R(*p) for p in body], fill=colour, ink=P["ink"], lw=LW_DETAIL)
    if pattern == "stripe":
        for yy in (5.6, 8.4):
            c.line([R(-2.4, yy), R(2.4, yy)], P["linen"], 1.2)
    elif pattern == "spot":
        for sx, sy in ((-1.2, 5.8), (1.4, 8.6), (-0.4, 11.8), (4.8, 12.8)):
            c.circle(*R(sx, sy), 1.0, fill=P["white"])
    c.poly([R(-3.2, 0.0), R(3.2, 0.0), R(3.2, 3.2), R(-3.2, 3.2)],
           fill=P["linen"], ink=P["ink"], lw=LW_FACE)
    c.circle(px, py + 0.6, 1.8, fill=pin, ink=P["ink"], lw=LW_FACE)


def wallArt_lostSockBoard(c: Canvas) -> None:
    """
    The laundry's cork noticeboard, with the odd socks pinned up to be
    claimed.

    Neither a picture nor a chart: a brown rectangle in a pine frame with a
    row of bright dangling shapes on it, and the socks are the whole piece.
    Six of them, in two rows, each at its own tilt — a straight row of six
    identical shapes reads as bunting.
    """
    ix, iy, iw, ih = _art_frame(c, 76.0, 56.0, P["woodPale"], depth=3.2)
    cork = mix(P["woodPale"], P["wood"], 0.45)
    c.rect(ix, iy, iw, ih, fill=cork)
    # Cork grain: a scatter of darker flecks, jittered from their own index
    # so the board is the same on every run and never a strict grid.
    fleck = alpha(shade(cork, 0.30), 0.45)
    for k in range(14):
        fx = ix + 3.0 + (k * 23) % int(iw - 6.0)
        fy = iy + 3.0 + (k * 17 + 5) % int(ih - 6.0)
        c.ellipse(fx, fy, 1.3 + (k % 3) * 0.3, 0.9, fill=fleck)
    c.rrect(ix, iy, iw, ih, r=0.8, ink=shade(P["woodPale"], 0.30), lw=LW_FACE)
    socks = (
        # x as a fraction of the board, row, toe side, tilt, colour, pattern, pin
        (0.16, 0, 1, -9.0, P["coral"], "stripe", P["roomBlue"]),
        (0.39, 0, -1, 7.0, P["roomBlue"], "spot", P["gold"]),
        (0.62, 0, -1, -6.0, P["gold"], "plain", P["coral"]),
        (0.24, 1, -1, 8.0, P["mint"], "spot", P["coral"]),
        (0.50, 1, 1, -7.0, P["coral"], "plain", P["mint"]),
        (0.78, 1, 1, 10.0, P["roomBlue"], "stripe", P["gold"]),
    )
    for fx, row, toe, tilt, colour, pattern, pin in socks:
        _sock(c, ix + iw * fx, iy + 5.0 + row * 23.0, toe, tilt, colour, pattern, pin)
    # The label card in the top-right corner: cream, two dashes, one pin.
    lx, ly, lw_, lh = ix + iw - 16.0, iy + 3.5, 13.0, 8.0
    c.rrect(lx, ly, lw_, lh, r=0.8, fill=mix(P["cream"], P["white"], 0.55),
            ink=P["ink"], lw=LW_FACE)
    c.line([(lx + 2.0, ly + 3.0), (lx + lw_ - 2.0, ly + 3.0)], P["ink2"], 0.9)
    c.line([(lx + 2.0, ly + 5.6), (lx + lw_ * 0.6, ly + 5.6)], P["ink2"], 0.9)
    c.circle(lx + lw_ / 2, ly + 0.4, 1.6, fill=P["mint"], ink=P["ink"], lw=LW_FACE)


def wallpaper_utilityTile(c: Canvas) -> None:
    """
    Glossy white subway tile in brick bond, a pale-blue border course at
    two-thirds height, and a chrome pipe with a red stop-tap along the foot.

    The grout is what makes it: on plain white the panel is a blank card, and
    a mid-grey grid coarse enough to survive 55% turns it into a wall that has
    been tiled. Eight courses is the floor for that — nine and the grout goes
    grey. The pipe is the only thing on it that is not a rectangle.
    """
    grout = mix(P["tileDk"], P["metalDk"], 0.45)
    _panel(c, grout)
    fx, fy, fw, fh = PANEL_X + 1.6, PANEL_Y + 1.6, PANEL_W - 3.2, PANEL_H - 3.2
    cols, rows = 6, 8
    tw, th = fw / cols, fh / rows
    gap = 1.2
    border_row = rows // 3
    for j in range(rows):
        off = tw / 2 if j % 2 else 0.0
        fill = P["wallSky"] if j == border_row else P["white"]
        for i in range(-1, cols + 1):
            x0 = max(fx + i * tw + off, fx)
            x1 = min(fx + (i + 1) * tw + off, fx + fw)
            if x1 - x0 < gap * 2:
                continue
            c.rrect(x0 + gap / 2, fy + j * th + gap / 2, x1 - x0 - gap, th - gap,
                    r=0.8, fill=fill)
    # The pipe run: chrome, two clips, and the stop-tap wheel at a third.
    py = PANEL_Y + PANEL_H - 7.0
    px0, px1 = PANEL_X + 3.0, PANEL_X + PANEL_W - 3.0
    tx = PANEL_X + PANEL_W * 0.30
    c.rrect(tx - 1.8, py - 5.4, 3.6, 6.0, r=0.8, fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)
    c.rrect(px0, py, px1 - px0, 3.4, r=1.7, fill=P["metal"], ink=P["ink"], lw=LW_FACE)
    c.line([(px0 + 3.0, py + 1.1), (px1 - 3.0, py + 1.1)], tint(P["metal"], 0.5), 0.8)
    for cxp in (px0 + 12.0, px1 - 12.0):
        c.rrect(cxp - 1.7, py - 0.9, 3.4, 5.2, r=0.8, fill=P["metalDk"],
                ink=P["ink"], lw=LW_FACE)
    c.circle(tx, py - 6.4, 3.6, fill=P["coral"], ink=P["ink"], lw=LW_FACE)
    c.circle(tx, py - 6.4, 1.8, ink=shade(P["coral"], 0.35), lw=LW_FACE)
    c.circle(tx, py - 6.4, 0.9, fill=P["ink2"])


def lighting_laundryBatten(c: Canvas) -> None:
    """
    A fluorescent batten on two short chains: one wide grey bar with a bright
    tube under it.

    Every other light in the game hangs as a point — a globe, a cone, a ring
    of candles — so this one is drawn as the opposite: a bar clearly wider
    than it is tall, held by the top of its canvas at both ends, and the tube
    is the one bright line on it. Cool white, not cream: it is the only lamp
    that is not meant to be flattering.
    """
    cx = c.w / 2
    drop = 9.0
    half = min(c.w * 0.42, 30.0)
    tube_y = drop + 6.4
    tube_h = 4.2
    _glow(c, cx, tube_y + 7.0, 30.0, colour=tint(P["glass"], 0.45))
    # Two drops, in steel: the stem-and-beads chain of `_chain`, without the
    # brass, because nothing in a laundry is brass.
    for dx in (-half + 8.0, half - 8.0):
        _ceiling_plate(c, cx + dx, 8.0, colour=P["metalDk"])
        _cord(c, cx + dx, drop, colour=P["metalDk"])
        for k in range(2):
            c.circle(cx + dx, 4.6 + k * 2.6, 1.2, fill=P["metal"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - half, drop, half * 2, 7.0, r=1.8, fill=P["metal"], ink=P["ink"], lw=LW_PROP)
    c.rect(cx - half + 2.0, drop + 1.4, half * 2 - 4.0, 1.6, fill=tint(P["metal"], 0.40))
    c.rect(cx - half + 2.0, drop + 4.8, half * 2 - 4.0, 1.4, fill=shade(P["metal"], 0.22))
    for side in (-1, 1):
        c.rrect(cx + side * (half - 4.0) - 2.4, tube_y - 0.6, 4.8, tube_h + 1.2, r=1.2,
                fill=P["mint"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - half + 5.0, tube_y, half * 2 - 10.0, tube_h, r=2.0, fill=P["white"],
            ink=P["ink"], lw=LW_DETAIL)
    c.rect(cx - half + 8.0, tube_y + 1.0, half * 2 - 16.0, 1.2, fill=tint(P["glass"], 0.55))


PIECES = {
    "wallArt_roomStatusBoard": wallArt_roomStatusBoard,
    "appliance_commercialWasher": appliance_commercialWasher,
    "flooring_drainTile": flooring_drainTile,
    "wallArt_lostSockBoard": wallArt_lostSockBoard,
    # Framed and washed the way every wallpaper in `decor_surfaces` is, so the
    # laundry's tiles sit in the same moulded panel as the suites' silk.
    "wallpaper_utilityTile": _as_wall_panel(wallpaper_utilityTile),
    "lighting_laundryBatten": lighting_laundryBatten,
}
