"""
The back of house, and the lobby.

Sixteen pieces for the six rooms that had almost nothing of their own. Before
this the whole hotel shared one cleaning trolley, one linen shelf and one tool
rack between the laundry, housekeeping, maintenance, the staff room and the
business centre — so a player who built all five decorated them out of the same
four objects, and the lobby, which is the first room anyone sees, had a bench's
worth of furniture in a catalogue of ninety-three.

Everything here is drawn against `hcstyle` and nothing else: the same navy
outline hierarchy, the same palette, the same contact shadow. What separates
these from the guest-room catalogue is subject rather than style — a step
ladder and a parts bin are objects that belong to a working room, and the point
of the room-scope field in `data/decor.json` is that they can only be bought
for one.

Sizes come from `gen_decor.SLOT_SIZE`: 96x72 for anything on the `equipment`
slot (every appliance and every storage piece) and for wall art, 72x72 for the
furniture, 72x48 for a hanging light. Nothing below assumes those numbers —
every routine lays out from `c.w` and `c.h`, because the same drawing is handed
a 1x and a 2x canvas.
"""
from __future__ import annotations

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    alpha, shade, tint, mix, math,
)

from decor_props import _stand, _legs, _box, _towels, _buttons, _pot, _blade
from decor_surfaces import _art_frame, _chain, _ceiling_plate, _glow, _band, _fringe


# ------------------------------------------------------------------- lobby

def seating_lobbyBench(c: Canvas) -> None:
    """
    A slatted public bench on cast legs.

    Level one, and the first thing the lobby can be given, so it is drawn for
    legibility rather than for charm: four fat slats and two visibly cast legs,
    nothing under two pixels.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 26.0)
    half = 27.0
    seat_y = fy - 20.0
    # Cast side frames: a foot, a stem and the bracket the slats sit on.
    for side in (-1, 1):
        x = cx + side * (half - 4.0)
        c.rrect(x - 3.0, seat_y + 2.0, 6.0, fy - seat_y - 3.0, r=1.6,
                fill=P["metalDk"], ink=P["ink"], lw=LW_DETAIL)
        c.rrect(x - 6.0, fy - 3.0, 12.0, 3.0, r=1.2,
                fill=shade(P["metalDk"], 0.20), ink=P["ink"], lw=LW_FACE)
    # Seat slats, then a low back of two more.
    for i in range(2):
        c.rrect(cx - half, seat_y + i * 5.0, half * 2, 4.0, r=1.4,
                fill=P["woodPale"] if i == 0 else P["wood"],
                ink=P["ink"], lw=LW_DETAIL)
    back_y = seat_y - 15.0
    for side in (-1, 1):
        c.rrect(cx + side * (half - 5.0) - 1.6, back_y, 3.2, 16.0, r=1.2,
                fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)
    for i in range(2):
        c.rrect(cx - half + 3.0, back_y + i * 6.0, half * 2 - 6.0, 4.4, r=1.6,
                fill=P["wood"] if i == 0 else P["woodPale"],
                ink=P["ink"], lw=LW_DETAIL)


def rug_entranceRunner(c: Canvas) -> None:
    """
    The long runner inside a hotel door.

    A floor covering lies on the bottom edge of its canvas, so `_band` puts it
    there; the two stripes down its length are what say "runner" rather than
    "rug" at a size where the shape alone cannot.
    """
    x, y, w, h = _band(c, 15.0, mix(P["carpet"], P["ink2"], 0.30), r=2.0)
    c.rect(x + 3.0, y + 2.4, w - 6.0, h - 4.8, fill=mix(P["carpet"], P["cream"], 0.22))
    for i in range(2):
        ly = y + 4.6 + i * (h - 9.2)
        c.line([(x + 4.0, ly), (x + w - 4.0, ly)], P["cream"], 1.4)
    _fringe(c, x, y, w, h, mix(P["cream"], P["wood"], 0.30))


def plant_lobbyFicus(c: Canvas) -> None:
    """
    A ficus: one visible trunk carrying a round mass of small leaves.

    Deliberately unlike `plant_fern` (a low spray from the pot rim) and
    `plant_palm` (long arcing fronds) — the trunk and the ball of foliage are
    the whole difference, so the trunk is drawn before the leaves and left
    showing through the gap at the bottom of the crown.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 15.0)
    top = _pot(c, cx, fy - 17.0, 22.0, 16.0, colour=mix(P["cream"], P["wood"], 0.35))
    trunk_top = 18.0
    c.line([(cx, fy - 17.0), (cx - 1.0, trunk_top + 6.0)], P["woodDk"], 3.4)
    c.line([(cx - 1.0, trunk_top + 6.0), (cx - 1.0, trunk_top)], P["woodDk"], 2.6)
    # The crown: three overlapping discs, then leaf marks around the rim so it
    # does not read as a green balloon.
    for dx, dy, r in ((-7.0, 2.0, 12.0), (7.0, 1.0, 11.5), (0.0, -6.0, 12.5)):
        c.circle(cx + dx, trunk_top + 8.0 + dy, r, fill=P["green"],
                 ink=P["ink"], lw=LW_DETAIL)
    for dx, dy, r in ((-6.0, 0.0, 8.0), (6.0, -1.0, 7.5)):
        c.circle(cx + dx, trunk_top + 7.0 + dy, r, fill=tint(P["green"], 0.18))
    # Leaf marks around the rim of the crown rather than blades laid along it:
    # a fringe of small ovals is what stops the mass reading as a balloon, and
    # a row of drawn blades read as a caterpillar sitting on top of it.
    for i in range(10):
        ang = math.pi * (1.05 + i * 0.09)
        c.ellipse(cx + math.cos(ang) * 13.0, trunk_top + 6.0 + math.sin(ang) * 12.5,
                  3.2, 2.2, fill=P["leaf"], ink=P["ink"], lw=LW_FACE)
    c.ellipse(cx - 4.0, trunk_top + 4.0, 4.0, 2.6, fill=tint(P["leaf"], 0.22))


def wallArt_cityMap(c: Canvas) -> None:
    """
    A framed map of the city the hotel stands in.

    A river, four blocks and a route line: at 53 screen pixels a map is a few
    strong shapes and one accent, and any more becomes hatching.
    """
    ix, iy, iw, ih = _art_frame(c, 64.0, 46.0, mix(P["wood"], P["ink2"], 0.35))
    c.rect(ix, iy, iw, ih, fill=mix(P["cream"], P["white"], 0.55))
    # The river, drawn first so the blocks sit on its banks.
    c.line([(ix + 4.0, iy + ih - 6.0), (ix + iw * 0.42, iy + ih * 0.52),
            (ix + iw * 0.62, iy + ih * 0.44), (ix + iw - 3.0, iy + 5.0)],
           P["glassDk"], 3.0)
    for bx, by, bw, bh in ((0.10, 0.14, 0.20, 0.20), (0.36, 0.10, 0.16, 0.16),
                           (0.60, 0.60, 0.22, 0.22), (0.12, 0.52, 0.18, 0.18)):
        c.rect(ix + iw * bx, iy + ih * by, iw * bw, ih * bh,
               fill=mix(P["mint"], P["cream"], 0.40), ink=P["ink2"], lw=LW_FACE)
    c.line([(ix + 3.0, iy + ih * 0.30), (ix + iw * 0.55, iy + ih * 0.30),
            (ix + iw * 0.55, iy + ih - 4.0)], P["coral"], 1.6)
    c.circle(ix + iw * 0.55, iy + ih * 0.30, 2.2, fill=P["coral"],
             ink=P["ink"], lw=LW_FACE)


def lighting_lobbyLantern(c: Canvas) -> None:
    """
    A glazed lantern on a chain.

    Held by the top of its canvas: the chain starts at y = 0 or the fitting
    hangs from nothing.
    """
    cx = c.w / 2
    drop = 13.0
    _ceiling_plate(c, cx, 12.0)
    _chain(c, cx, drop, links=3)
    top, h, half = drop, 24.0, 11.0
    # Brass cap and foot, glass in between: two solid ends make the middle
    # read as glass without needing a highlight on it.
    c.poly([(cx - half + 2.0, top + 4.0), (cx, top - 2.0), (cx + half - 2.0, top + 4.0)],
           fill=P["gold"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - half, top + 3.0, half * 2, h, r=1.6,
            fill=alpha(P["creamHi"], 0.80), ink=P["ink"], lw=LW_PROP)
    for side in (-1, 1):
        c.line([(cx + side * (half - 1.2), top + 4.0), (cx + side * (half - 1.2), top + h + 1.0)],
               P["goldDk"], 1.4)
    c.line([(cx, top + 4.0), (cx, top + h + 1.0)], alpha(P["goldDk"], 0.55), 1.0)
    c.rrect(cx - half - 1.0, top + h + 1.0, half * 2 + 2.0, 4.0, r=1.4,
            fill=P["gold"], ink=P["ink"], lw=LW_DETAIL)
    _glow(c, cx, top + h * 0.55, 13.0)
    c.ellipse(cx, top + h * 0.52, 3.4, 4.6, fill=P["creamHi"])


# ------------------------------------------------- housekeeping and laundry

def storage_laundryBasket(c: Canvas) -> None:
    """A wheeled canvas hamper with the linen showing over the rim."""
    cx, half = c.w / 2, 22.0
    fy = _stand(c, cx, half)
    top = fy - 34.0
    # Tubular frame first, so the canvas bag hangs inside it.
    for side in (-1, 1):
        c.line([(cx + side * half, top + 2.0), (cx + side * (half - 2.0), fy - 6.0)],
               P["metalDk"], 2.4)
    c.rrect(cx - half - 1.0, top, (half + 1.0) * 2, 4.0, r=1.6,
            fill=P["metal"], ink=P["ink"], lw=LW_DETAIL)
    c.poly([(cx - half + 1.0, top + 3.0), (cx + half - 1.0, top + 3.0),
            (cx + half - 4.0, fy - 6.0), (cx - half + 4.0, fy - 6.0)],
           fill=P["linenSh"], ink=P["ink"], lw=LW_PROP)
    c.rect(cx - half + 3.0, top + 6.0, (half - 3.0) * 2, 3.0, fill=alpha(P["ink2"], 0.10))
    _towels(c, cx - 13.0, top - 5.0, 26.0, n=2, step=4.2)
    for side in (-1, 1):
        c.circle(cx + side * (half - 6.0), fy - 3.0, 3.0,
                 fill=P["black"], ink=P["ink"], lw=LW_FACE)


def appliance_vacuum(c: Canvas) -> None:
    """An upright vacuum: body, canister, handle, and a head on the floor."""
    cx = c.w / 2
    fy = _stand(c, cx, 18.0)
    lean = 5.0
    # Floor head, wide and flat, with a bristle strip so it reads as a nozzle.
    c.rrect(cx - 17.0, fy - 8.0, 34.0, 6.0, r=2.0,
            fill=P["coral"], ink=P["ink"], lw=LW_PROP)
    c.rect(cx - 14.0, fy - 3.4, 28.0, 2.0, fill=shade(P["coral"], 0.35))
    body_bot, body_top = fy - 10.0, fy - 40.0
    c.poly([(cx - 8.0, body_bot), (cx + 8.0, body_bot),
            (cx + 8.0 + lean, body_top), (cx - 6.0 + lean, body_top)],
           fill=P["coral"], ink=P["ink"], lw=LW_PROP)
    # The dust canister: clear, so the room shows through it, and a dusty band.
    c.rrect(cx - 4.0 + lean * 0.55, body_top + 7.0, 13.0, 15.0, r=2.2,
            fill=alpha(P["glass"], 0.72), ink=P["ink"], lw=LW_DETAIL)
    c.rect(cx - 2.6 + lean * 0.55, body_top + 16.0, 10.0, 5.0,
           fill=alpha(P["concrete"], 0.60))
    handle_top = body_top - 16.0
    c.line([(cx + 1.0 + lean, body_top + 1.0), (cx + 3.0 + lean, handle_top)],
           P["ink2"], 3.0)
    c.rrect(cx - 3.0 + lean, handle_top - 3.0, 12.0, 4.4, r=2.0,
            fill=P["black"], ink=P["ink"], lw=LW_FACE)
    c.circle(cx + 2.0 + lean * 0.6, body_top + 3.4, 2.0, fill=P["mint"],
             ink=P["ink"], lw=LW_FACE)


def storage_amenityShelf(c: Canvas) -> None:
    """
    Three narrow shelves of guest amenities.

    Narrower and busier than `storage_linenShelf`, which is a wide unit of
    folded towels: this one is small bottles and boxed soap, and the difference
    has to be visible at 53 pixels, so the shelves are shorter and the objects
    on them are many and small.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 17.0)
    x0, w = cx - 17.0, 34.0
    top = fy - 42.0
    c.rrect(x0, top, w, fy - top, r=2.0, fill=P["woodPale"],
            ink=P["ink"], lw=LW_PROP)
    c.rect(x0 + 2.0, top + 2.0, w - 4.0, fy - top - 4.0, fill=shade(P["woodPale"], 0.10))
    for row in range(3):
        sy = top + 6.0 + row * 12.0
        c.line([(x0 + 2.0, sy + 8.0), (x0 + w - 2.0, sy + 8.0)], P["woodDk"], LW_PROP)
        if row == 2:
            for i in range(3):
                c.rrect(x0 + 4.0 + i * 9.4, sy + 1.0, 7.0, 6.6, r=1.4,
                        fill=(P["mint"], P["cream"], P["glass"])[i],
                        ink=P["ink"], lw=LW_FACE)
        else:
            for i in range(4):
                bx = x0 + 4.0 + i * 7.2
                c.rrect(bx, sy + 1.4, 4.2, 6.4, r=1.2,
                        fill=(P["glass"], P["linen"], P["mint"], P["cream"])[i],
                        ink=P["ink"], lw=LW_FACE)
                c.rect(bx + 1.4, sy - 0.4, 1.6, 2.0, fill=P["metal"])


def appliance_foldingTable(c: Canvas) -> None:
    """A stainless folding table with a stack of sheets and a shelf under it."""
    cx = c.w / 2
    fy = _stand(c, cx, 24.0)
    top_y = fy - 26.0
    c.rrect(cx - 25.0, top_y, 50.0, 4.4, r=1.6, fill=P["metal"],
            ink=P["ink"], lw=LW_PROP)
    c.rect(cx - 23.0, top_y + 1.0, 46.0, 1.4, fill=tint(P["metal"], 0.40))
    _legs(c, (cx - 21.0, cx + 21.0), top_y + 4.0, colour=P["metalDk"], w=3.4, r=1.2)
    c.rrect(cx - 21.0, fy - 9.0, 42.0, 3.0, r=1.2, fill=P["metalDk"],
            ink=P["ink"], lw=LW_FACE)
    _towels(c, cx - 20.0, fy - 12.0, 16.0, n=2, step=4.0)
    _towels(c, cx - 16.0, top_y - 12.0, 22.0, n=3, step=4.2)


def storage_stepLadder(c: Canvas) -> None:
    """
    An A-frame step ladder, open, with its tool tray up top.

    The spreader bar between the two frames is the mark that says "open" — a
    ladder without it reads as a leaning plank.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 20.0)
    apex_y, spread = fy - 44.0, 17.0
    for side in (-1, 1):
        c.line([(cx + side * 3.0, apex_y), (cx + side * spread, fy - 1.0)],
               P["metalDk"], 3.2)
    for i in range(4):
        t = 0.24 + i * 0.24
        y = apex_y + (fy - 1.0 - apex_y) * t
        x = 3.0 + (spread - 3.0) * t
        c.rrect(cx - x, y - 1.6, x * 2, 3.2, r=1.2,
                fill=P["metal"], ink=P["ink"], lw=LW_FACE)
    # Spreader, and the tray sitting on the apex.
    c.line([(cx - 9.0, apex_y + 20.0), (cx + 9.0, apex_y + 26.0)], P["metalDk"], 1.6)
    c.rrect(cx - 11.0, apex_y - 4.0, 22.0, 5.0, r=1.4, fill=P["coral"],
            ink=P["ink"], lw=LW_DETAIL)
    c.rect(cx - 8.0, apex_y - 6.6, 3.0, 3.0, fill=P["metalDk"])
    c.circle(cx + 4.0, apex_y - 5.4, 1.8, fill=P["gold"], ink=P["ink"], lw=LW_FACE)


# -------------------------------------------- staff room and maintenance

def appliance_coffeeMachine(c: Canvas) -> None:
    """
    A filter machine and its jug on a small counter.

    A tall square body with a jug slid under it, which is a different
    silhouette from `appliance_espressoBar`'s wide group-head bar — the two
    have to be told apart at a glance in a staff room that can hold both.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 18.0)
    top = fy - 40.0
    _box(c, cx - 12.0, top, 24.0, 26.0, P["linen"])
    # Water tank down the back edge, tinted so it reads as full.
    c.rrect(cx + 6.0, top + 3.0, 5.0, 20.0, r=1.4,
            fill=alpha(P["glass"], 0.75), ink=P["ink"], lw=LW_FACE)
    _buttons(c, cx - 8.0, cx + 1.0, top + 5.0, 3, colour=P["coral"])
    # Hot plate, then the jug standing on it.
    c.rrect(cx - 13.0, fy - 12.0, 26.0, 3.2, r=1.2, fill=P["black"],
            ink=P["ink"], lw=LW_FACE)
    # The jug: glass with coffee filling the bottom two thirds, so the level
    # line is what says "jug" rather than "block".
    c.poly([(cx - 8.0, fy - 12.6), (cx + 8.0, fy - 12.6),
            (cx + 6.6, fy - 26.0), (cx - 6.6, fy - 26.0)],
           fill=alpha(P["glass"], 0.55), ink=P["ink"], lw=LW_DETAIL)
    c.poly([(cx - 7.6, fy - 13.0), (cx + 7.6, fy - 13.0),
            (cx + 7.0, fy - 21.0), (cx - 7.0, fy - 21.0)],
           fill=mix(P["woodDk"], P["ink2"], 0.30))
    c.line([(cx - 7.0, fy - 21.0), (cx + 7.0, fy - 21.0)], shade(P["woodDk"], 0.30), 1.2)
    c.arc(cx + 8.0, fy - 19.5, 4.6, 5.0, 270, 90, P["ink2"], 1.8)


def storage_partsBin(c: Canvas) -> None:
    """A workshop rack of tilt bins, four across and three down."""
    cx = c.w / 2
    fy = _stand(c, cx, 22.0)
    x0, w = cx - 22.0, 44.0
    top = fy - 40.0
    c.rrect(x0 - 1.5, top - 1.5, w + 3.0, fy - top + 1.5, r=2.0,
            fill=P["metalDk"], ink=P["ink"], lw=LW_PROP)
    tints = (P["cream"], P["mint"], P["glass"], P["coral"])
    for row in range(3):
        for col in range(4):
            bx = x0 + 1.0 + col * (w / 4)
            by = top + row * 12.6
            # A tilt bin is a box with its front face leaning out: two shapes.
            c.rrect(bx, by, w / 4 - 2.0, 10.6, r=1.4,
                    fill=tints[(row + col) % 4], ink=P["ink"], lw=LW_FACE)
            c.rect(bx + 1.2, by + 6.6, w / 4 - 4.4, 2.4,
                   fill=alpha(P["ink2"], 0.16))
    c.rrect(x0 - 1.5, fy - 4.0, w + 3.0, 4.0, r=1.2,
            fill=shade(P["metalDk"], 0.22), ink=P["ink"], lw=LW_FACE)


def seating_staffSofa(c: Canvas) -> None:
    """
    The sofa in the staff room: low, deep and slightly collapsed.

    `seating_loveseat` is upright and formal; this one sits lower, its arms are
    rolled rather than square, and the seat cushions sag. That is the whole
    difference and it has to be carried by silhouette alone.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 27.0)
    half = 28.0
    seat_y = fy - 17.0
    back_y = fy - 32.0
    body = mix(P["mint"], P["concrete"], 0.30)
    c.rrect(cx - half, back_y, half * 2, fy - back_y - 4.0, r=5.0,
            fill=body, ink=P["ink"], lw=LW_PROP)
    # Rolled arms, drawn over the carcass so they read as separate volumes.
    for side in (-1, 1):
        c.rrect(cx + side * (half - 6.0) - 5.0, seat_y - 6.0, 10.0, fy - seat_y + 1.0,
                r=4.4, fill=tint(body, 0.14), ink=P["ink"], lw=LW_DETAIL)
    # Two sagging cushions: an arc along the top of each says "soft".
    for side in (-1, 1):
        x = cx + side * 9.0
        c.rrect(x - 9.0, seat_y - 1.0, 18.0, 9.0, r=3.4,
                fill=tint(body, 0.26), ink=P["ink"], lw=LW_DETAIL)
        c.arc(x, seat_y + 2.0, 7.0, 3.0, 200, 340, shade(body, 0.18), LW_FACE)
    c.rect(cx - half + 4.0, back_y + 4.0, (half - 4.0) * 2, 2.0, fill=shade(body, 0.14))
    _legs(c, (cx - half + 6.0, cx + half - 6.0), fy - 5.0, colour=P["woodDk"], w=4.0, r=1.4)


# -------------------------------------------------------- business centre

def appliance_printer(c: Canvas) -> None:
    """An office multifunction printer on a stand, with paper in the tray."""
    cx = c.w / 2
    fy = _stand(c, cx, 22.0)
    stand_top = fy - 14.0
    c.rrect(cx - 20.0, stand_top, 40.0, 5.0, r=1.6, fill=P["metalDk"],
            ink=P["ink"], lw=LW_DETAIL)
    _legs(c, (cx - 16.0, cx + 16.0), stand_top + 5.0, colour=P["metalDk"], w=3.0, r=1.0)
    top = stand_top - 28.0
    _box(c, cx - 21.0, top, 42.0, 28.0, P["linenSh"])
    # Lid seam and control panel: the two marks that say "office machine".
    c.line([(cx - 19.0, top + 7.0), (cx + 19.0, top + 7.0)], P["ink2"], LW_DETAIL)
    c.rrect(cx + 6.0, top + 9.0, 13.0, 6.0, r=1.4, fill=P["black"],
            ink=P["ink"], lw=LW_FACE)
    c.circle(cx + 8.6, top + 12.0, 1.3, fill=P["mint"])
    # Output tray with a sheet half out of it.
    c.rrect(cx - 20.0, top + 19.0, 26.0, 3.0, r=1.0, fill=shade(P["linenSh"], 0.16),
            ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 24.0, top + 17.4, 16.0, 3.4, r=0.8, fill=P["white"],
            ink=P["ink"], lw=LW_FACE)


def wallArt_projectorScreen(c: Canvas) -> None:
    """
    A pull-down screen on its roller.

    Held by the centre of the canvas like every other wall piece, so the roller
    is drawn above the middle and the screen hangs below it.
    """
    cx = c.w / 2
    top = 8.0
    c.rrect(cx - 32.0, top, 64.0, 5.0, r=2.0, fill=P["metalDk"],
            ink=P["ink"], lw=LW_PROP)
    for side in (-1, 1):
        c.rrect(cx + side * 33.0 - 1.6, top + 0.6, 3.2, 3.8, r=1.0,
                fill=P["metal"], ink=P["ink"], lw=LW_FACE)
    face_y, face_h = top + 5.0, 44.0
    c.rect(cx - 30.0, face_y, 60.0, face_h, fill=P["white"])
    c.rect(cx - 30.0, face_y, 60.0, face_h * 0.34, fill=tint(P["glass"], 0.55))
    c.rect(cx - 30.0, face_y, 60.0, face_h)
    c.rrect(cx - 30.0, face_y, 60.0, face_h, r=0.8, ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - 31.0, face_y + face_h, 62.0, 3.6, r=1.2, fill=P["black"],
            ink=P["ink"], lw=LW_FACE)
    c.line([(cx, face_y + face_h + 3.6), (cx, face_y + face_h + 7.0)], P["ink2"], 1.4)
    c.circle(cx, face_y + face_h + 8.4, 1.8, ink=P["ink"], lw=LW_FACE)


def table_meetingTable(c: Canvas) -> None:
    """An oval boardroom table on a pillar and a splayed base."""
    cx = c.w / 2
    fy = _stand(c, cx, 26.0)
    top_y = fy - 28.0
    c.ellipse(cx, top_y, 27.0, 6.0, fill=mix(P["woodDk"], P["ink2"], 0.20),
              ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx, top_y - 1.2, 24.0, 4.4, fill=mix(P["wood"], P["cream"], 0.18))
    c.rect(cx - 3.4, top_y + 2.0, 6.8, fy - top_y - 8.0, fill=P["metalDk"])
    c.rrect(cx - 3.4, top_y + 2.0, 6.8, fy - top_y - 8.0, r=1.0,
            ink=P["ink"], lw=LW_DETAIL)
    c.ellipse(cx, fy - 4.0, 16.0, 4.0, fill=P["metalDk"], ink=P["ink"], lw=LW_DETAIL)
    c.ellipse(cx, fy - 5.2, 10.0, 2.4, fill=shade(P["metalDk"], 0.20))
    # The cable grommet, which is the one detail that says boardroom.
    c.ellipse(cx, top_y - 1.4, 3.0, 1.4, fill=P["black"], ink=P["ink"], lw=LW_FACE)


PIECES = {
    "seating_lobbyBench": seating_lobbyBench,
    "rug_entranceRunner": rug_entranceRunner,
    "plant_lobbyFicus": plant_lobbyFicus,
    "wallArt_cityMap": wallArt_cityMap,
    "lighting_lobbyLantern": lighting_lobbyLantern,
    "storage_laundryBasket": storage_laundryBasket,
    "appliance_vacuum": appliance_vacuum,
    "storage_amenityShelf": storage_amenityShelf,
    "appliance_foldingTable": appliance_foldingTable,
    "storage_stepLadder": storage_stepLadder,
    "appliance_coffeeMachine": appliance_coffeeMachine,
    "storage_partsBin": storage_partsBin,
    "seating_staffSofa": seating_staffSofa,
    "appliance_printer": appliance_printer,
    "wallArt_projectorScreen": wallArt_projectorScreen,
    "table_meetingTable": table_meetingTable,
}
