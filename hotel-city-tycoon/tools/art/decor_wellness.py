"""
The disco, the pool and the gym — the second wave.

Three rooms that sell light. The disco (registered as `spa`, drawn on a navy
wall over a lit chequer) has nothing to offer a player but its glow, so every
piece here that lives in it carries its own: the dance floor is a grid of lit
tiles, the video wall is an equaliser on black, the podium is a drum lit from
inside, the mirror balls throw sparkles, and the fog machine is the one
appliance in the game that is *venting* rather than working. The pool sells
sun: sand tiles with a wave along their edge, a striped towel with the
flip-flops still on it, a mosaic in four blues, a red-framed rules board and
two fittings that are plainly outdoor — a pair of floodlight heads and a heat
lamp with an orange element in its mouth. The gym gets the two things a gym
wall and ceiling actually have: an interval timer counting down in red, and an
industrial high-bay light.

What tells the silhouettes apart, category by category, since 40 pixels is
all they get:

*   **lighting** — every existing lamp is a drop (a cord and a shade). The
    mirror balls are three *spheres*; the floodlight is two *squares* on a
    bar; the heat lamp is a wide shallow *dome* with an orange mouth; the
    high bay is a flared *trapezoid* under a black driver box. No two share
    an outline, and none of them is a cone.
*   **wallArt** — none of these is a picture. The video wall is a black grid
    full of vertical bars; the lifeguard board is white in a red frame with
    a red cross; the interval timer is a grey box with four red digits.
*   **flooring / rug** — the dance floor is the only floor that is self-lit;
    the deck tiles are the only sand-coloured one with a blue wave along the
    front; the towel is the only rug with stripes across it and a pair of
    shoes on it.
*   **luxury / appliance** — the podium is a single lit cylinder with nothing
    on it; the fog machine is low, black and trailing a cloud.

Anchors follow the render contract: floor and equipment pieces stand on the
bottom edge over a contact shadow, lights start at y=0 on a plate, wall
pieces are centred, and the floor coverings lie on the bottom edge as bands.
The helpers are borrowed from `decor_props` and `decor_surfaces` rather than
copied, so a foot, a shadow, a frame or a glow here is the same drawing it is
everywhere else in the hotel.
"""
from __future__ import annotations

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    alpha, shade, tint, mix, math,
)

from decor_props import _stand, _box, _bay
from decor_surfaces import (
    _band, _panel, _art_frame, _ceiling_plate, _glow, _fringe,
    _as_wall_panel, LIGHT_CX, PANEL_X, PANEL_Y, PANEL_W, PANEL_H,
)

# --------------------------------------------------------------- colours
#
# The disco's palette is three lights, and none of them is in `P` as such.
# Each is mixed from two palette entries rather than typed in as hex, so the
# room stays inside the hotel's gamut and a later palette change moves them.

#: Magenta: the pink of the hair palette pushed toward lavender.
MAGENTA = mix(P["hairPink"], P["lavender"], 0.30)
#: Cyan is simply the pool's water.
CYAN = P["water"]
#: The orange of a heat lamp element and a pair of flip-flops.
ORANGE = mix(P["coral"], P["gold"], 0.45)
#: Fog: lilac, mostly white, so it reads as vapour and not as a purple blob.
LILAC = mix(P["lavender"], P["white"], 0.55)


# --------------------------------------------------------------- toolkit

#: Seven-segment digits, named a-g the way a display datasheet names them:
#: top, top-right, bottom-right, bottom, bottom-left, top-left, middle.
_SEGS = {
    "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc",
    "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg",
}


def _seg_digit(c: Canvas, x: float, y: float, w: float, h: float, ch: str,
               colour, lw: float = 2.0) -> None:
    """
    One digit of a seven-segment display.

    Drawn as strokes with rounded ends rather than as the bevelled bars of a
    real LED: at 55% the bevels are gone anyway, and rounded strokes are what
    every other line in the game already has.
    """
    m = h / 2
    pts = {
        "a": [(x, y), (x + w, y)],
        "b": [(x + w, y), (x + w, y + m)],
        "c": [(x + w, y + m), (x + w, y + h)],
        "d": [(x, y + h), (x + w, y + h)],
        "e": [(x, y + m), (x, y + h)],
        "f": [(x, y), (x, y + m)],
        "g": [(x, y + m), (x + w, y + m)],
    }
    for s in _SEGS[ch]:
        c.line(pts[s], colour, lw)


def _seg_text(c: Canvas, x: float, y: float, text: str, w: float, h: float,
              colour, gap: float = 3.4, lw: float = 2.0) -> float:
    """A run of digits, with ':' and '.' as dots. Returns the x it ended at."""
    for ch in text:
        if ch == ":":
            for dy in (h * 0.30, h * 0.70):
                c.circle(x + 1.4, y + dy, lw * 0.62, fill=colour)
            x += 2.8 + gap
        elif ch == ".":
            c.circle(x + 1.2, y + h - lw * 0.3, lw * 0.62, fill=colour)
            x += 2.4 + gap
        else:
            _seg_digit(c, x, y, w, h, ch, colour, lw)
            x += w + gap
    return x


def _sparkle(c: Canvas, cx: float, cy: float, r: float, colour=None) -> None:
    """A four-point glint: the cheapest way to say a surface is a mirror."""
    colour = colour or P["white"]
    c.poly([(cx, cy - r), (cx + r * 0.28, cy - r * 0.28), (cx + r, cy),
            (cx + r * 0.28, cy + r * 0.28), (cx, cy + r),
            (cx - r * 0.28, cy + r * 0.28), (cx - r, cy),
            (cx - r * 0.28, cy - r * 0.28)], fill=colour)


def _mirror_ball(c: Canvas, cx: float, cy: float, r: float, glints) -> None:
    """
    One faceted ball: a chequer of two greys clipped to a disc, a few coloured
    facets where the lights catch it, and the outline drawn last so the cells
    never poke through it.
    """
    c.circle(cx, cy, r, fill=P["metal"])
    cell = max(2.4, r / 2.6)
    n = int(math.ceil(r / cell))
    for j in range(-n, n + 1):
        for i in range(-n, n + 1):
            fx, fy = cx + i * cell, cy + j * cell
            if math.hypot(fx - cx, fy - cy) > r - cell * 0.55:
                continue
            fill = tint(P["metal"], 0.42) if (i + j) % 2 == 0 else shade(P["metal"], 0.14)
            c.rect(fx - cell / 2 + 0.2, fy - cell / 2 + 0.2, cell - 0.4, cell - 0.4, fill=fill)
    for gi, gj, colour in glints:
        c.rect(cx + gi * cell - cell / 2 + 0.2, cy + gj * cell - cell / 2 + 0.2,
               cell - 0.4, cell - 0.4, fill=colour)
    # One white facet high on the left: the light source, and the thing that
    # makes a grey disc a sphere.
    c.rect(cx - cell * 1.5 + 0.2, cy - cell * 1.5 + 0.2, cell - 0.4, cell - 0.4,
           fill=P["white"])
    c.circle(cx, cy, r, ink=P["ink"], lw=LW_DETAIL)


def _chrome_chain(c: Canvas, cx: float, drop: float) -> None:
    """A short steel chain from the ceiling — `_chain` is brass, and a disco
    ball on a brass chain is a chandelier that has lost its way."""
    c.line([(cx, 0.0), (cx, drop)], P["metalDk"], 1.4)
    for i in range(int(drop // 4.0)):
        c.circle(cx, 2.6 + i * 4.0, 1.2, fill=P["metal"], ink=P["ink"], lw=LW_FACE)


# ======================================================================= GYM

def wallArt_intervalTimer(c: Canvas) -> None:
    """
    A gym interval timer: a grey aluminium housing round a black display,
    four big red digits and a colon on the top line, a smaller mint round
    counter and two status lamps underneath.

    The digits are the piece. Four red seven-segment strokes on black read as
    a timer at any size, so the housing is kept plain and grey — the one dark
    rectangle on a gym wall is the display, not the box round it.
    """
    ix, iy, iw, ih = _art_frame(c, 78.0, 48.0, P["metalDk"], depth=3.2)
    c.rrect(ix, iy, iw, ih, r=1.6, fill=P["black"], ink=P["ink"], lw=LW_DETAIL)
    c.rect(ix + 1.6, iy + 1.4, iw - 3.2, 1.6, fill=tint(P["black"], 0.16))
    # 00:45, the big line. Five glyphs centred on the display.
    dw, dh, gap = 9.0, 17.0, 3.6
    total = 4 * dw + 3 * gap + 2.8 + gap
    x0 = ix + iw / 2 - total / 2
    _seg_text(c, x0, iy + 4.5, "00:45", dw, dh, P["coral"], gap=gap, lw=2.2)
    # The lower line: round counter in mint at the left, a divider, and the
    # WORK / REST lamps at the right — one lit coral, one dark.
    ly = iy + ih - 13.0
    c.line([(ix + 4.0, ly - 1.6), (ix + iw - 4.0, ly - 1.6)], P["ink2"], 1.0)
    _seg_text(c, ix + 7.0, ly + 1.0, "03", 5.4, 9.0, P["mint"], gap=2.6, lw=1.6)
    c.rrect(ix + 26.0, ly + 3.0, 10.0, 4.0, r=1.2, fill=P["ink2"])
    c.circle(ix + iw - 20.0, ly + 5.5, 3.0, fill=P["coral"], ink=P["ink"], lw=LW_FACE)
    c.circle(ix + iw - 20.0 - 1.0, ly + 4.5, 1.0, fill=tint(P["coral"], 0.5))
    c.circle(ix + iw - 9.0, ly + 5.5, 3.0, fill=shade(P["mint"], 0.55), ink=P["ink"], lw=LW_FACE)
    # Two screws in the housing, so it is mounted and not floating.
    for sx in (ix - 1.6 + 0.0, ix + iw + 1.6):
        c.circle(sx, iy + ih / 2, 1.0, fill=P["ink2"])


def lighting_gymHighBay(c: Canvas) -> None:
    """
    An industrial high-bay: a black driver box under the ceiling, a short
    rod, then a wide flared aluminium reflector with a bright disc of lens in
    its mouth and a cool glow under it.

    The reflector is a trapezoid, narrow at the top, and it is what separates
    this from every cone in the catalogue: the linen lamp tapers the other
    way (wide shade, narrow top) and is soft; this is hard, ribbed and metal.
    """
    cx = LIGHT_CX
    _glow(c, cx, 38.0, 22.0, P["glass"])
    _ceiling_plate(c, cx, 12.0, P["metalDk"])
    c.line([(cx, 2.0), (cx, 8.0)], P["metalDk"], 2.4)
    # The driver box, with cooling fins.
    c.rrect(cx - 8.0, 7.0, 16.0, 7.0, r=1.4, fill=P["black"], ink=P["ink"], lw=LW_DETAIL)
    for i in range(3):
        c.line([(cx - 4.0 + i * 4.0, 8.4), (cx - 4.0 + i * 4.0, 12.6)], P["ink2"], 1.0)
    c.line([(cx, 14.0), (cx, 17.0)], P["metalDk"], 2.4)
    # The reflector, and one lit facet down its left side.
    top_y, bot_y = 17.0, 32.0
    c.poly([(cx - 9.0, top_y), (cx + 9.0, top_y), (cx + 26.0, bot_y), (cx - 26.0, bot_y)],
           fill=P["metal"], ink=P["ink"], lw=LW_PROP)
    c.poly([(cx - 8.0, top_y + 0.8), (cx - 3.6, top_y + 0.8), (cx - 14.0, bot_y - 1.0),
            (cx - 23.0, bot_y - 1.0)], fill=tint(P["metal"], 0.40))
    # Two ribs across the cone: a pressed reflector has them, and they are the
    # only thing that stops the trapezoid reading as a lampshade.
    for t in (0.36, 0.68):
        y = top_y + (bot_y - top_y) * t
        half = 9.0 + 17.0 * t
        c.line([(cx - half + 1.0, y), (cx + half - 1.0, y)], shade(P["metal"], 0.30), 1.0)
    # The mouth and the lens: a white disc with a paler cool ring inside.
    c.ellipse(cx, bot_y, 26.0, 4.6, fill=shade(P["metal"], 0.34), ink=P["ink"], lw=LW_DETAIL)
    c.ellipse(cx, bot_y + 0.4, 22.0, 3.2, fill=P["white"], ink=P["ink"], lw=LW_FACE)
    c.ellipse(cx, bot_y + 0.6, 14.0, 1.8, fill=tint(P["glass"], 0.45))


# ===================================================================== DISCO

def appliance_fogMachine(c: Canvas) -> None:
    """
    A fog machine: a squat black box on four stub feet with a chrome nozzle
    at its right end, a red carry handle, a gold power lamp, and a lilac
    plume rolling out of the nozzle and up to the right.

    The box is deliberately low — a third of the bay's height — because the
    silhouette that matters is 'block with a cloud coming off it', and a
    taller box turns into another washing machine. The fog is the one place
    here that translucency is the subject.
    """
    cx, half = _bay(c)
    x0, x1 = cx - half * 0.82, cx + half * 0.42
    top = c.h - 24.0
    bottom = c.h - 4.0
    _stand(c, (x0 + x1) / 2, (x1 - x0) / 2 + 2.0)
    # Feet first, so the body's outline sits over them.
    for fx in (x0 + 6.0, x0 + 18.0, x1 - 18.0, x1 - 6.0):
        c.rrect(fx - 3.0, bottom - 1.0, 6.0, 5.0, r=1.2, fill=P["metalDk"],
                ink=P["ink"], lw=LW_FACE)
    # The handle: an arch on top, ink under coral so it has an outline.
    hx = cx - 4.0
    c.arc(hx, top + 1.0, 11.0, 8.0, 180, 360, P["ink"], 4.6)
    c.arc(hx, top + 1.0, 11.0, 8.0, 180, 360, P["coral"], 2.8)
    _box(c, x0, top, x1 - x0, bottom - top, P["black"], r=2.6, panel=False)
    c.rrect(x0 + 2.0, top + 1.8, x1 - x0 - 4.0, 3.2, r=1.2, fill=tint(P["black"], 0.18))
    # Front panel: a gold power lamp, a switch and three vent slots.
    c.circle(x0 + 9.0, top + 11.0, 2.4, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    c.rrect(x0 + 15.0, top + 8.6, 8.0, 4.8, r=1.2, fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)
    c.rect(x0 + 15.8, top + 9.4, 3.2, 3.2, fill=P["coral"])
    for i in range(3):
        c.line([(x0 + 30.0 + i * 5.0, top + 8.0), (x0 + 30.0 + i * 5.0, top + 15.0)],
               P["ink2"], 1.4)
    # The nozzle: a chrome barrel out of the right end with a dark bore.
    c.rrect(x1 - 1.0, top + 6.0, 10.0, 8.0, r=1.6, fill=P["metal"], ink=P["ink"], lw=LW_DETAIL)
    c.rect(x1 + 0.6, top + 7.2, 7.0, 1.6, fill=tint(P["metal"], 0.5))
    c.ellipse(x1 + 8.6, top + 10.0, 1.6, 3.0, fill=P["ink2"], ink=P["ink"], lw=LW_FACE)
    # Fog: three puffs stepping up and right, each a translucent disc with a
    # paler heart. Two layers of the same colour is all the modelling it
    # gets, which is what keeps it a cloud and not a purple balloon.
    nx = x1 + 10.0
    for px, py, rx, ry in ((nx + 5.0, top + 9.0, 7.0, 5.0),
                           (nx + 13.0, top - 1.0, 10.0, 6.8),
                           (nx + 19.0, top - 13.0, 11.0, 7.4)):
        c.ellipse(px, py, rx, ry, fill=alpha(LILAC, 0.62), ink=alpha(P["lavender"], 0.55),
                  lw=LW_FACE)
        c.ellipse(px - rx * 0.16, py - ry * 0.14, rx * 0.56, ry * 0.52,
                  fill=alpha(P["white"], 0.38))


def flooring_ledDanceFloor(c: Canvas) -> None:
    """
    A 5x2 grid of lit tiles in cyan, magenta and white, on a white ground
    that shows between them as gridlines and round them as a rim.

    The rim is the ground itself: the tiles are inset three pixels into a
    white band, so the lit edge costs no extra shape and cannot drift away
    from the grid.
    """
    x, y, w, h = _band(c, 26.0, P["white"], r=2.4)
    inset = 3.0
    cols, rows = 5, 2
    tw = (w - inset * 2) / cols
    th = (h - inset * 2) / rows
    pale = mix(P["white"], P["glass"], 0.40)
    pattern = ((CYAN, MAGENTA, pale, MAGENTA, CYAN),
               (MAGENTA, pale, CYAN, pale, MAGENTA))
    for j in range(rows):
        for i in range(cols):
            fill = pattern[j][i]
            tx, ty = x + inset + i * tw, y + inset + j * th
            c.rrect(tx + 0.7, ty + 0.7, tw - 1.4, th - 1.4, r=1.0, fill=fill)
            # One lit sliver per cell, top-left, so each tile reads as a lamp
            # under glass rather than as a painted square.
            c.rect(tx + 2.0, ty + 1.8, tw * 0.45, 1.6, fill=tint(fill, 0.55))
    c.rrect(x + 1.4, y + 1.4, w - 2.8, h - 2.8, r=1.8, ink=tint(P["glass"], 0.5), lw=LW_FACE)


def lighting_mirrorBallCluster(c: Canvas) -> None:
    """
    Three mirror balls of three sizes on short steel chains from one chrome
    plate, with pink and cyan facets where the room's lights hit them and a
    few sparkles beside them.

    Three balls rather than one because one ball is a bauble; a cluster at
    three drops fills the ceiling box and is unmistakably a disco.
    """
    cx = LIGHT_CX
    _ceiling_plate(c, cx, 20.0, P["metal"])
    balls = ((cx - 11.0, 24.0, 10.0), (cx + 13.0, 16.0, 7.0), (cx + 9.0, 34.0, 5.6))
    for bx, by, r in balls:
        _chrome_chain(c, bx, by - r + 0.5)
    _mirror_ball(c, cx - 11.0, 24.0, 10.0,
                 ((1, 0, MAGENTA), (-1, 1, CYAN), (2, -1, CYAN), (0, 2, MAGENTA)))
    _mirror_ball(c, cx + 13.0, 16.0, 7.0, ((1, 0, CYAN), (-1, 1, MAGENTA)))
    _mirror_ball(c, cx + 9.0, 34.0, 5.6, ((1, 0, MAGENTA), (0, -1, CYAN)))
    for sx, sy, r in ((cx - 26.0, 14.0, 3.2), (cx + 26.0, 30.0, 2.8),
                      (cx - 4.0, 41.0, 2.4), (cx + 24.0, 6.0, 2.0)):
        _sparkle(c, sx, sy, r)


def luxury_goGoPodium(c: Canvas) -> None:
    """
    A go-go podium: a waist-high frosted drum lit magenta from inside, three
    cyan LED rings round it, a mirror-tile disc on top and a chrome guard
    rail arcing behind it.

    A cylinder with nothing standing on it is the point. The rail is a wide
    shallow arc so it shows on both sides of the drum without adding a
    second silhouette above it.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 22.0)
    top = fy - 36.0
    rw, rh = 17.0, 33.0
    # The guard rail: two posts and a hoop, behind the drum.
    for side in (-1, 1):
        px = cx + side * 26.0
        c.line([(px, fy - 27.0), (px, fy - 1.5)], P["ink"], 3.8)
        c.line([(px, fy - 27.0), (px, fy - 1.5)], P["metal"], 2.2)
    c.arc(cx, fy - 22.0, 27.0, 7.0, 180, 360, P["ink"], 3.8)
    c.arc(cx, fy - 22.0, 27.0, 7.0, 180, 360, P["metal"], 2.2)
    # The drum: frosted white body, a magenta heart where the lamp is, a
    # white sliver on the left rim.
    body = mix(P["white"], MAGENTA, 0.28)
    c.rrect(cx - rw, top + 3.0, rw * 2, rh, r=3.0, fill=body, ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 9.0, top + 6.0, 18.0, rh - 6.0, r=5.0, fill=mix(P["white"], MAGENTA, 0.66))
    c.rrect(cx - 4.0, top + 9.0, 8.0, rh - 12.0, r=3.0, fill=MAGENTA)
    c.rect(cx - rw + 1.8, top + 6.0, 2.4, rh - 8.0, fill=P["white"])
    # Three cyan LED rings, each a band with its own lit line.
    for k in range(3):
        ry = top + 10.0 + k * 9.6
        c.rrect(cx - rw - 0.8, ry, rw * 2 + 1.6, 3.0, r=1.4, fill=CYAN, ink=P["ink"], lw=LW_FACE)
        c.rect(cx - rw + 2.0, ry + 0.8, rw * 1.2, 1.0, fill=tint(CYAN, 0.6))
    # The mirror-tile top: an ellipse of chrome carrying a chequer.
    c.ellipse(cx, top + 3.0, rw + 1.0, 4.6, fill=P["metal"], ink=P["ink"], lw=LW_PROP)
    for i in range(-4, 5):
        tx = cx + i * 3.6
        if (i % 2 == 0):
            c.rect(tx - 1.4, top + 1.2, 2.8, 1.8, fill=tint(P["metal"], 0.45))
        else:
            c.rect(tx - 1.4, top + 3.4, 2.8, 1.8, fill=shade(P["metal"], 0.18))
    _sparkle(c, cx + 10.0, top + 1.6, 2.4)
    # A chrome kick plate at the foot, on the floor line.
    c.rrect(cx - rw - 1.2, fy - 3.4, rw * 2 + 2.4, 3.4, r=1.2, fill=P["metalDk"],
            ink=P["ink"], lw=LW_FACE)


def wallArt_ledVideoWall(c: Canvas) -> None:
    """
    A video wall: a black frame round a 4x3 grid of dark tiles, with a
    coloured equaliser of cyan, magenta and gold bars running across all of
    them and thin white gridlines over the joins.

    Twelve bars for twelve tiles, so the seams fall between colours and the
    grid and the picture read as one object. The bars are drawn first and the
    gridlines over them — a screen is behind its bezels.
    """
    ix, iy, iw, ih = _art_frame(c, 84.0, 60.0, P["black"], depth=3.0)
    c.rect(ix, iy, iw, ih, fill=shade(P["black"], 0.40))
    cols, rows = 4, 3
    bars = 12
    bw = iw / bars
    heights = (0.34, 0.58, 0.82, 0.48, 0.92, 0.70, 0.40, 0.64, 0.86, 0.54, 0.30, 0.50)
    hues = (CYAN, MAGENTA, P["gold"])
    base = iy + ih - 2.0
    for i in range(bars):
        bh = (ih - 4.0) * heights[i]
        col = hues[i % 3]
        bx = ix + i * bw + 1.0
        c.rrect(bx, base - bh, bw - 2.0, bh, r=0.9, fill=col)
        c.rect(bx, base - bh, bw - 2.0, 2.0, fill=tint(col, 0.55))
    for k in range(1, cols):
        c.line([(ix + iw * k / cols, iy), (ix + iw * k / cols, iy + ih)], P["white"], 1.0)
    for k in range(1, rows):
        c.line([(ix, iy + ih * k / rows), (ix + iw, iy + ih * k / rows)], P["white"], 1.0)
    c.rrect(ix, iy, iw, ih, r=0.8, ink=P["ink"], lw=LW_DETAIL)
    # A standby lamp in the bezel: the one warm dot on a black frame.
    c.circle(ix + iw - 4.0, iy + ih + 1.6, 0.9, fill=P["mint"])


# ====================================================================== POOL

def flooring_deckTiles(c: Canvas) -> None:
    """
    Sand-coloured non-slip deck tiles in a square grid, a wavy blue border
    tile along the front edge, and a small drain grille.

    The wave strip is what sells it: sand tiles alone are a paler lino, and
    the blue edge says the water is just past the bottom of the sprite.
    """
    sand = mix(P["woodPale"], P["linen"], 0.45)
    grout = shade(sand, 0.20)
    x, y, w, h = _band(c, 24.0, grout)
    cols, rows = 6, 2
    fx, fy_, fw = x + 2.0, y + 2.0, w - 4.0
    tw = fw / cols
    th = 7.2
    for j in range(rows):
        for i in range(cols):
            tx, ty = fx + i * tw, fy_ + j * th
            c.rrect(tx + 0.6, ty + 0.6, tw - 1.2, th - 1.2, r=0.8, fill=sand)
            c.rect(tx + 1.6, ty + 1.4, tw * 0.5, 1.2, fill=tint(sand, 0.45))
    # The border course: water blue with a white wave through it.
    by = fy_ + rows * th + 0.4
    bh = y + h - 3.0 - by
    c.rrect(fx, by, fw, bh, r=1.0, fill=P["water"])
    pts = []
    n = 24
    for k in range(n + 1):
        t = k / n
        pts.append((fx + 2.0 + (fw - 4.0) * t, by + bh / 2 + math.sin(t * math.pi * 5) * 1.6))
    c.line(pts, P["white"], 1.4)
    # The drain: a dark grille let into one tile, three slots.
    gx, gy = fx + tw * 4 + 1.6, fy_ + th + 1.4
    c.rrect(gx, gy, tw * 2 - 3.2, th - 2.8, r=0.8, fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)
    for i in range(3):
        c.line([(gx + 2.4 + i * 4.6, gy + 1.2), (gx + 2.4 + i * 4.6, gy + th - 4.0)],
               P["ink2"], 1.0)


def rug_swimTowel(c: Canvas) -> None:
    """
    A beach towel spread on the deck: broad sky-blue and white stripes, one
    corner folded back, a pair of orange flip-flops left on it.

    Stripes run *across* the towel. Lengthways they would be one-pixel lines
    at 55%; across, seven bands eight pixels wide are the boldest pattern in
    the rug category, which is what a towel next to a Persian rug needs.
    """
    x, y, w, h = _band(c, 20.0, P["white"], r=2.4, w=56.0)
    bands = 7
    bw = w / bands
    for i in range(bands):
        if i % 2 == 0:
            c.rect(x + i * bw, y + 1.0, bw, h - 2.0, fill=P["sky"])
    c.rrect(x, y, w, h, r=2.4, ink=P["ink"], lw=LW_PROP)
    _fringe(c, x, y, w, h, P["white"])
    # The folded corner: the terry underside turned over the top-right.
    fold = 15.0
    c.poly([(x + w - fold, y), (x + w, y + fold), (x + w, y)],
           fill=P["linenSh"], ink=P["ink"], lw=LW_DETAIL)
    c.line([(x + w - fold + 3.0, y + 1.8), (x + w - 1.8, y + fold - 3.0)],
           tint(P["linenSh"], 0.5), 1.0)
    # Flip-flops: two orange soles with a dark V of strap, a little apart
    # the way they are kicked off.
    for sx, sy in ((x + 14.0, y + 10.0), (x + 22.5, y + 11.0)):
        c.ellipse(sx, sy, 3.4, 5.4, fill=ORANGE, ink=P["ink"], lw=LW_FACE)
        c.line([(sx - 2.2, sy + 1.6), (sx, sy - 2.2), (sx + 2.2, sy + 1.6)], P["ink2"], 1.0)


def wallpaper_poolMosaic(c: Canvas) -> None:
    """
    Small square glass tiles in three blues and a mint, in a grid with a
    darker-blue wave running across the middle.

    Six-and-a-half-pixel tiles: the coarsest grid that still counts as
    mosaic, and the finest that survives 55%. The colours are scattered by
    a fixed formula so no run of one blue is long enough to read as a stripe.
    """
    grout = mix(P["tile"], P["white"], 0.45)
    _panel(c, grout)
    tile = 6.6
    cols = int(PANEL_W // tile)
    rows = int(PANEL_H // tile)
    fx = PANEL_X + (PANEL_W - cols * tile) / 2
    fy_ = PANEL_Y + (PANEL_H - rows * tile) / 2
    hues = (P["water"], P["water"], P["sky"], P["sky"], P["roomBlue"], P["glass"], P["mint"])
    for j in range(rows):
        for i in range(cols):
            k = (i * 5 + j * 3 + (i * j) % 4) % len(hues)
            c.rrect(fx + i * tile + 0.6, fy_ + j * tile + 0.6, tile - 1.2, tile - 1.2,
                    r=0.7, fill=hues[k])
    mid = PANEL_Y + PANEL_H / 2
    pts = []
    n = 40
    for k in range(n + 1):
        t = k / n
        pts.append((PANEL_X + 2.0 + (PANEL_W - 4.0) * t,
                    mid + math.sin(t * math.pi * 4) * 3.6))
    c.line(pts, P["waterDk"], 2.6)
    c.line(pts, alpha(P["glass"], 0.55), 0.8)


def wallArt_lifeguardBoard(c: Canvas) -> None:
    """
    The lifeguard's rules board: white in a red frame, a red cross and a
    depth figure on the top line, three crossed-out pictograms in a row
    beneath.

    White with a red border is the opposite of every framed picture in the
    game, and the cross is the one glyph that says 'first aid' at any size;
    the rules are three red rings with a slash each, which reads as
    'forbidden' long before the figures inside them do.
    """
    ix, iy, iw, ih = _art_frame(c, 72.0, 54.0, P["coral"], depth=3.4)
    c.rect(ix, iy, iw, ih, fill=P["white"])
    c.rect(ix, iy, iw, 3.0, fill=tint(P["glass"], 0.45))
    # The cross.
    kx, ky, a, b = ix + 13.0, iy + 13.0, 7.0, 2.6
    c.poly([(kx - b, ky - a), (kx + b, ky - a), (kx + b, ky - b), (kx + a, ky - b),
            (kx + a, ky + b), (kx + b, ky + b), (kx + b, ky + a), (kx - b, ky + a),
            (kx - b, ky + b), (kx - a, ky + b), (kx - a, ky - b), (kx - b, ky - b)],
           fill=P["coral"], ink=P["ink"], lw=LW_FACE)
    # The depth: 1.8 in blue, with a water line under it as the unit.
    end = _seg_text(c, ix + 30.0, iy + 6.0, "1.8", 6.4, 12.0, P["roomBlue"], gap=3.0, lw=1.9)
    c.line([(ix + 30.0, iy + 22.0), (end - 3.0, iy + 22.0)], P["water"], 1.6)
    c.rrect(end + 1.0, iy + 12.0, 8.0, 6.0, r=1.2, fill=P["water"], ink=P["ink"], lw=LW_FACE)
    # The rules row: three red rings, each with a glyph and a slash.
    ry = iy + ih - 13.0
    c.line([(ix + 4.0, iy + 27.0), (ix + iw - 4.0, iy + 27.0)], alpha(P["ink2"], 0.35), 1.0)
    for k, t in enumerate((0.2, 0.5, 0.8)):
        rx = ix + iw * t
        c.circle(rx, ry, 7.0, fill=P["white"], ink=P["coral"], lw=1.7)
        if k == 0:
            # No diving: a figure going in head first.
            c.line([(rx - 3.0, ry - 3.0), (rx + 2.0, ry + 3.0)], P["ink2"], 1.6)
            c.circle(rx + 2.8, ry + 3.6, 1.3, fill=P["ink2"])
        elif k == 1:
            # No running: a stick figure mid-stride.
            c.circle(rx, ry - 3.6, 1.3, fill=P["ink2"])
            c.line([(rx, ry - 2.0), (rx, ry + 1.0)], P["ink2"], 1.6)
            c.line([(rx - 3.0, ry + 4.0), (rx, ry + 1.0), (rx + 3.0, ry + 3.4)], P["ink2"], 1.4)
        else:
            # No glass: a bottle.
            c.rrect(rx - 2.0, ry - 1.0, 4.0, 5.4, r=1.0, fill=P["ink2"])
            c.rect(rx - 0.9, ry - 4.4, 1.8, 3.6, fill=P["ink2"])
        c.line([(rx - 5.0, ry - 5.0), (rx + 5.0, ry + 5.0)], P["coral"], 1.7)


def lighting_poolFloodlight(c: Canvas) -> None:
    """
    Twin floodlights: two square metal heads hung off a short bar under the
    ceiling, each tilted down so its white lens face shows, with a cool glow
    beneath them.

    Two squares side by side is a silhouette no shade in the catalogue has,
    and the tilt is drawn as a face rather than as a rotation: a box with a
    wider bright plate under it reads as 'aimed at the floor' without a
    single skewed edge.
    """
    cx = LIGHT_CX
    _glow(c, cx, 36.0, 24.0, P["glass"])
    _ceiling_plate(c, cx, 14.0, P["metalDk"])
    c.line([(cx, 2.0), (cx, 10.0)], P["metalDk"], 2.6)
    c.rrect(cx - 18.0, 8.6, 36.0, 3.4, r=1.4, fill=P["metalDk"], ink=P["ink"], lw=LW_DETAIL)
    for side in (-1, 1):
        hx = cx + side * 12.0
        # The yoke, then the body, then the lens face flaring below it.
        c.line([(hx, 11.0), (hx, 15.0)], P["metalDk"], 2.2)
        c.rrect(hx - 8.0, 14.0, 16.0, 10.0, r=1.6, fill=P["metalDk"], ink=P["ink"], lw=LW_PROP)
        c.rect(hx - 6.6, 15.4, 5.0, 1.6, fill=tint(P["metalDk"], 0.35))
        c.poly([(hx - 8.0, 23.4), (hx + 8.0, 23.4), (hx + 10.0, 30.0), (hx - 10.0, 30.0)],
               fill=P["white"], ink=P["ink"], lw=LW_DETAIL)
        c.poly([(hx - 5.6, 25.0), (hx + 5.6, 25.0), (hx + 7.0, 28.6), (hx - 7.0, 28.6)],
               fill=tint(P["glass"], 0.45))
        c.rect(hx - 4.0, 25.6, 3.0, 1.2, fill=P["white"])


def lighting_heatLamp(c: Canvas) -> None:
    """
    A patio heat lamp: a wide shallow steel dome on a short rod, with a
    coral-orange element glowing in its mouth and a warm pool of light below.

    Wide and flat: the dome is nearly the width of the canvas and a third as
    tall, so it reads as an inverted dish rather than a pendant, and the
    orange in its mouth is the only warm light in a room full of cool ones.
    """
    cx = LIGHT_CX
    _glow(c, cx, 34.0, 24.0, mix(ORANGE, P["creamHi"], 0.35))
    _ceiling_plate(c, cx, 10.0, P["metalDk"])
    c.line([(cx, 2.0), (cx, 13.0)], P["metalDk"], 2.6)
    c.circle(cx, 12.0, 2.4, fill=P["black"], ink=P["ink"], lw=LW_FACE)
    top, mouth = 13.0, 27.0
    c.pie(cx, mouth, 27.0, mouth - top, 180, 360, fill=P["metal"], ink=P["ink"], lw=LW_PROP)
    c.pie(cx - 9.0, mouth - 1.0, 12.0, 11.0, 200, 258, fill=tint(P["metal"], 0.42))
    # The mouth: a dark rim, then the element as two orange rings.
    c.ellipse(cx, mouth, 27.0, 4.6, fill=shade(P["metal"], 0.42), ink=P["ink"], lw=LW_DETAIL)
    c.ellipse(cx, mouth + 0.4, 20.0, 2.8, fill=ORANGE, ink=P["ink"], lw=LW_FACE)
    c.ellipse(cx, mouth + 0.6, 11.0, 1.6, fill=tint(ORANGE, 0.55))
    c.ellipse(cx, mouth + 0.6, 4.0, 0.9, fill=P["creamHi"])


PIECES = {
    # gym
    "wallArt_intervalTimer": wallArt_intervalTimer,
    "lighting_gymHighBay": lighting_gymHighBay,
    # disco
    "appliance_fogMachine": appliance_fogMachine,
    "flooring_ledDanceFloor": flooring_ledDanceFloor,
    "lighting_mirrorBallCluster": lighting_mirrorBallCluster,
    "luxury_goGoPodium": luxury_goGoPodium,
    "wallArt_ledVideoWall": wallArt_ledVideoWall,
    # pool
    "flooring_deckTiles": flooring_deckTiles,
    "rug_swimTowel": rug_swimTowel,
    # Framed and washed the way every wallpaper in `decor_surfaces` is, so
    # the mosaic hangs on the pool wall as a panel and not as a billboard.
    "wallpaper_poolMosaic": _as_wall_panel(wallpaper_poolMosaic),
    "wallArt_lifeguardBoard": wallArt_lifeguardBoard,
    "lighting_poolFloodlight": lighting_poolFloodlight,
    "lighting_heatLamp": lighting_heatLamp,
}
