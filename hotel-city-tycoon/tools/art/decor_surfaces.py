"""
The decor that dresses a room's surfaces: wallpaper, wall art, flooring, rugs
and lighting.

These forty pieces are the player's whole vocabulary for making one bedroom
look richer than the bedroom next door, so the only thing that matters about
them is that the *ladder* is visible. A player who has just bought
`wallpaper_striped` has to see, in the half-second the camera passes the room,
that it is a rung above `wallpaper_plain` — and that is a question about shape
and material, not about hue. ART-0 §9 says it outright: an expensive piece is
told apart by its form, not by being the same form painted shinier.

So the escalation here is built into the geometry. A plain panel is a flat
rectangle; a gilded one grows a moulded bead; the top of the range grows a
cornice, a dado rail and raised panels, and is architecture rather than
pattern. A bare bulb is one cord and one circle; a crystal chandelier is three
tiers, six arms and a curtain of drops. Colour follows the shape, never leads.

Two constraints from the render contract shape every routine below, and both
are easy to get wrong in a way that only shows in the game:

*   **Where the art sits in its canvas.** `gen_decor.py` anchors wallpaper,
    wall art, flooring and rugs at their centre, and lighting at its *top* —
    so a lamp must start its cord at `y = 0` or it hangs from nothing.
*   **The piece is composited at 0.55.** A 96x72 panel is 53x40 on screen, so
    a pattern repeat finer than about six logical pixels is a grey smear.
    Every stripe, tile and motif here is coarse on purpose.

Floors and rugs are drawn as *bands*: the camera is flat and front-on, so a
floor is never a square seen from above. It is a strip of material, exactly as
`room_shell` paints the room's own floor.
"""
from __future__ import annotations

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    alpha, shade, tint, mix, math,
)

# --------------------------------------------------------------- geometry
#
# Every category shares one footprint so that two pieces in the same slot
# swap cleanly — ART-0 §9 asks for one scale and one anchor per category, and
# a rug that is a different size from the rug it replaces makes the room jump.

#: The wall panel, inside a 96x72 canvas. Nearly edge to edge: the piece is
#: shrunk to 55% in the room, so a timid panel becomes a postage stamp.
PANEL_X, PANEL_Y, PANEL_W, PANEL_H = 5.0, 4.0, 86.0, 64.0

#: The floor band, inside a 72x72 canvas — wide and short, centred on the
#: canvas because the renderer hangs floor pieces from their middle.
BAND_X, BAND_W = 2.0, 68.0
# A floor covering is held by the BOTTOM of its canvas (decorArt.ts anchors
# flooring and rug at (0.5, 1)), so the strip has to be drawn down there.
# Centred at 36 it looked right on a sprite sheet and floated ten pixels above
# the carpet in the game — the one place the preview and the renderer had
# always disagreed.
BAND_CY = 62.0

#: Lighting hangs in a 72x48 canvas from the top edge.
LIGHT_CX = 36.0

#: Two golds and a bronze. Keeping them here rather than reaching for
#: `P['gold']` at every call is what stops the expensive half of the
#: catalogue from drifting into three different metals.
GOLD = P["gold"]
GOLD_DK = P["goldDk"]
GOLD_HI = tint(P["gold"], 0.42)


# ----------------------------------------------------------- wall helpers

def _panel(c: Canvas, fill, r: float = 3.0) -> tuple[float, float, float, float]:
    """The wallpaper ground: one flat rectangle with the standard prop line."""
    c.rrect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, r=r, fill=fill, ink=P["ink"], lw=LW_PROP)
    return PANEL_X, PANEL_Y, PANEL_W, PANEL_H


def _clipped_line(c: Canvas, p0, p1, rect, colour, lw: float) -> None:
    """
    A line trimmed to a rectangle, by Liang–Barsky.

    Pillow has no clip region, so a lattice drawn across a panel spills over
    its edges and out onto the wall — which is exactly what happened the first
    time the velvet was drawn. Trimming the segment before it is stroked is
    cheaper than compositing a masked layer, and it keeps every quilting line
    a single stroke with the right rounded ends.
    """
    x0, y0 = p0
    x1, y1 = p1
    rx, ry, rw, rh = rect
    dx, dy = x1 - x0, y1 - y0
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, x0 - rx), (dx, rx + rw - x0), (-dy, y0 - ry), (dy, ry + rh - y0)):
        if p == 0:
            if q < 0:
                return
            continue
        t = q / p
        if p < 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
    if t0 > t1:
        return
    c.line([(x0 + dx * t0, y0 + dy * t0), (x0 + dx * t1, y0 + dy * t1)], colour, lw)


def _bead(c: Canvas, inset: float, colour, lw: float = LW_DETAIL, r: float = 2.0) -> None:
    """
    An inset moulding line inside the panel.

    This single mark is what separates a cheap wall covering from a dressed
    one: a bead means somebody put a frame on the wall, and the eye reads that
    before it reads the colour.
    """
    c.rrect(PANEL_X + inset, PANEL_Y + inset, PANEL_W - inset * 2, PANEL_H - inset * 2,
            r=r, ink=colour, lw=lw)


def _cornice(c: Canvas, colour, h: float = 5.0) -> None:
    """A moulded rail across the top of the panel — the top-tier signature."""
    c.rrect(PANEL_X - 1.0, PANEL_Y - 1.0, PANEL_W + 2.0, h, r=1.6,
            fill=colour, ink=P["ink"], lw=LW_DETAIL)
    c.rect(PANEL_X, PANEL_Y + h - 2.2, PANEL_W, 1.2, fill=alpha(P["ink"], 0.18))


def _rosette(c: Canvas, cx: float, cy: float, r: float, colour=GOLD) -> None:
    """A carved boss: four lobes and a centre. The cheapest 'this cost money'."""
    for a in range(4):
        ang = math.radians(45 + a * 90)
        c.circle(cx + math.cos(ang) * r * 0.62, cy + math.sin(ang) * r * 0.62,
                 r * 0.52, fill=colour, ink=P["ink"], lw=LW_FACE)
    c.circle(cx, cy, r * 0.56, fill=tint(colour, 0.30), ink=P["ink"], lw=LW_FACE)


def _damask_motif(c: Canvas, cx: float, cy: float, s: float, colour, edge=None) -> None:
    """
    One repeat of a damask: a pointed lozenge with two side leaves.

    Outlined in a darker tone of the *wall* rather than in ink — nine
    ink-outlined motifs on one panel read as a net thrown over it, which is
    what pattern must never do. The leaves are set clear of the lozenge: when
    they touch it the whole motif collapses into a plain diamond at 55%.
    """
    edge = edge or shade(colour, 0.30)
    c.poly([(cx, cy - 8.0 * s), (cx + 4.4 * s, cy), (cx, cy + 8.0 * s), (cx - 4.4 * s, cy)],
           fill=colour, ink=edge, lw=LW_FACE)
    # The leaves sit high on the lozenge and are lozenges themselves. Set on
    # its waist as ellipses they read, unmistakably, as a pair of eyes.
    for side in (-1, 1):
        c.poly([(cx + side * 3.0 * s, cy - 2.0 * s), (cx + side * 6.6 * s, cy - 4.6 * s),
                (cx + side * 7.4 * s, cy - 1.6 * s), (cx + side * 4.0 * s, cy + 0.2 * s)],
               fill=colour, ink=edge, lw=LW_FACE)


def _art_frame(c: Canvas, w: float, h: float, colour, lw: float = LW_PROP,
               depth: float = 2.6) -> tuple[float, float, float, float]:
    """
    A picture frame centred on the wall canvas, and the picture area inside it.

    Returns the inner rectangle, so every framed piece below composes the same
    way: frame, mount, image. The frame is drawn as a filled rectangle with the
    image punched into it rather than as four sticks, because four sticks leave
    hairline gaps at the corners once the sprite is scaled to 55%.
    """
    x, y = 48.0 - w / 2, 36.0 - h / 2
    c.rrect(x, y, w, h, r=2.2, fill=colour, ink=P["ink"], lw=lw)
    ix, iy = x + depth, y + depth
    iw, ih = w - depth * 2, h - depth * 2
    return ix, iy, iw, ih


def _crest(c: Canvas, cx: float, top_y: float) -> None:
    """
    A carved crest sitting on top of an expensive frame.

    This started life as a brass picture light, and a picture light drawn flat
    and front-on is a bar on two struts — which is a suitcase handle, every
    time. A crest says the same thing (somebody paid a carver) with a shape
    that cannot be misread, and it does not promise a light the room has not
    got.
    """
    c.pie(cx, top_y + 1.0, 9.0, 8.0, 180, 360, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    for a in (215, 250, 290, 325):
        ang = math.radians(a)
        c.line([(cx + math.cos(ang) * 2.5, top_y + 1.0 + math.sin(ang) * 2.2),
                (cx + math.cos(ang) * 7.6, top_y + 1.0 + math.sin(ang) * 6.8)],
               alpha(GOLD_DK, 0.9), 0.9)
    for side in (-1, 1):
        c.circle(cx + side * 9.6, top_y - 0.6, 2.6, fill=GOLD_HI, ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 12.0, top_y - 1.2, 24.0, 2.6, r=1.2, fill=GOLD, ink=P["ink"], lw=LW_FACE)


# ---------------------------------------------------------- floor helpers

def _band(c: Canvas, h: float, fill, r: float = 2.0, w: float = BAND_W,
          lw: float = LW_PROP) -> tuple[float, float, float, float]:
    """
    A strip of floor, centred. Returns its rectangle.

    The lighter sliver along the top edge is the same trick `room_shell` uses
    on the room's own floor: one tone change is enough to say "this surface is
    lying down" without drawing a single perspective line.
    """
    x = 36.0 - w / 2
    y = BAND_CY - h / 2
    c.rrect(x, y, w, h, r=r, fill=fill, ink=P["ink"], lw=lw)
    c.rect(x + 1.4, y + 1.0, w - 2.8, h * 0.22, fill=alpha(tint(fill, 0.34), 0.55))
    return x, y, w, h


def _fringe(c: Canvas, x: float, y: float, w: float, h: float, colour) -> None:
    """
    Knotted ends on a hand-made rug.

    Five tassels a side, not fifteen: at 55% each tassel is barely two pixels,
    and a comb of them turns into a grey blur along the edge.
    """
    for side in (0, 1):
        ex = x - 2.4 if side == 0 else x + w
        for i in range(5):
            ty = y + 2.0 + i * (h - 4.0) / 4
            c.line([(ex, ty), (ex + 2.4, ty)], colour, 1.0)


def _medallion(c: Canvas, cx: float, cy: float, rx: float, ry: float,
               fill, edge, ink_lw: float = LW_FACE) -> None:
    """The lozenge at the centre of every woven rug worth the name."""
    c.poly([(cx, cy - ry), (cx + rx, cy), (cx, cy + ry), (cx - rx, cy)],
           fill=fill, ink=edge, lw=ink_lw)


# ------------------------------------------------------- lighting helpers

def _cord(c: Canvas, cx: float, drop: float, colour=None) -> None:
    """A flex from the ceiling. Always starts at y=0 — the anchor is the top."""
    c.line([(cx, 0.0), (cx, drop)], colour or P["ink2"], LW_DETAIL)


def _chain(c: Canvas, cx: float, drop: float, links: int = 3) -> None:
    """
    A chain instead of a flex: the same drop, but visibly a fitting.

    Drawn as a stem with beads on it rather than as interlocking ovals. Real
    links are two pixels of hole at the size this ships, and two pixels of
    hole is a smudge.
    """
    c.line([(cx, 0.0), (cx, drop)], GOLD_DK, 1.4)
    for i in range(links):
        c.circle(cx, 2.6 + i * (drop - 4.0) / max(1, links), 1.5,
                 fill=GOLD, ink=P["ink"], lw=LW_FACE)


def _ceiling_plate(c: Canvas, cx: float, w: float = 14.0, colour=None) -> None:
    """The rose the fitting screws into, so the cord meets something."""
    c.rrect(cx - w / 2, 0.0, w, 3.6, r=1.4, fill=colour or P["metal"],
            ink=P["ink"], lw=LW_DETAIL)


def _glow(c: Canvas, cx: float, cy: float, r: float, colour=None, steps: int = 3) -> None:
    """
    The halo under a lit fitting.

    Three flat rings rather than a gradient: ART-0 §8 allows a small glow and
    forbids anything that looks photographic, and stacked transparency is the
    only kind of light this style has.
    """
    colour = colour or P["creamHi"]
    # Four rings at low opacity rather than three at higher: on a navy wall
    # three steps show as three hard-edged discs, and the fitting looks like
    # it is sitting on a stack of coasters.
    steps = max(2, steps + 1)
    for i in range(steps, 0, -1):
        c.ellipse(cx, cy, r * i / steps, r * i / steps * 0.82,
                  fill=alpha(colour, 0.055 + 0.030 * (steps - i)))


def _candle(c: Canvas, cx: float, cy: float, s: float = 1.0) -> None:
    """A candle cup and its flame — the unit a chandelier is counted in."""
    c.rrect(cx - 2.0 * s, cy - 5.2 * s, 4.0 * s, 5.6 * s, r=1.2 * s,
            fill=P["white"], ink=P["ink"], lw=LW_FACE)
    c.ellipse(cx, cy - 7.4 * s, 1.9 * s, 2.8 * s, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    c.ellipse(cx, cy - 7.8 * s, 0.8 * s, 1.2 * s, fill=P["white"])


def _drop(c: Canvas, cx: float, cy: float, s: float = 1.0) -> None:
    """One hanging crystal: a teardrop with a highlight down one side."""
    c.poly([(cx, cy - 3.4 * s), (cx + 1.8 * s, cy + 0.4 * s), (cx, cy + 3.4 * s),
            (cx - 1.8 * s, cy + 0.4 * s)], fill=P["glass"], ink=P["ink"], lw=LW_FACE)
    c.line([(cx - 0.5 * s, cy - 1.8 * s), (cx - 0.5 * s, cy + 1.4 * s)],
           alpha(P["white"], 0.8), 0.8)


def _star(c: Canvas, cx: float, cy: float, r: float, fill=None, ink=None,
          lw: float = LW_FACE) -> None:
    """A five-pointed star, points up."""
    pts = []
    for i in range(10):
        ang = math.pi / 5 * i - math.pi / 2
        rad = r if i % 2 == 0 else r * 0.44
        pts.append((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad))
    c.poly(pts, fill=fill or GOLD, ink=ink, lw=lw)


# =========================================================== W A L L P A P E R

def wallpaper_plain(c: Canvas) -> None:
    """
    Tier 1. Painted plaster and a skirting: the wall a room starts with.

    Deliberately the emptiest thing in the catalogue. Every rung above it has
    to be visibly *more*, and that only works if the bottom rung is honestly
    bare rather than quietly decorated.
    """
    base = P["wallSky"]
    _panel(c, base)
    # A skirting board along the foot. One mark, and it is the mark that keeps
    # a flat rectangle from reading as a blank swatch.
    c.rrect(PANEL_X + 2.0, PANEL_Y + PANEL_H - 7.0, PANEL_W - 4.0, 4.4, r=1.4,
            fill=P["linen"], ink=P["ink"], lw=LW_DETAIL)


def wallpaper_striped(c: Canvas) -> None:
    """
    Tier 2. Regency stripes — the first pattern, and the coarsest one possible.

    Ten stripes across 86 pixels is four and a half pixels each on screen. Any
    finer and the wall goes grey; this is the practical floor for pattern in
    the whole game.
    """
    base = P["linen"]
    _panel(c, base)
    stripe = mix(P["wallSky"], P["roomBlue"], 0.35)
    # Five stripes and four gaps, all one width: the run has to start and end
    # on a stripe or the panel looks cropped off its own pattern.
    field = PANEL_W - 4.0
    band = field / 9
    for i in range(5):
        c.rect(PANEL_X + 2.0 + i * band * 2, PANEL_Y + 2.0, band, PANEL_H - 4.0,
               fill=alpha(stripe, 0.75))
    # A picture rail caps the stripes, which is what real striped paper does
    # and what stops the panel reading as a barcode.
    c.rrect(PANEL_X + 1.0, PANEL_Y + 1.0, PANEL_W - 2.0, 4.0, r=1.2,
            fill=P["white"], ink=P["ink"], lw=LW_DETAIL)


def wallpaper_damask(c: Canvas) -> None:
    """
    Tier 3. A repeating damask on lilac: the first paper with a *motif* rather
    than a rhythm, laid out on a dropped grid so it reads as woven.
    """
    base = P["wallLilac"]
    _panel(c, base)
    motif = mix(base, P["white"], 0.62)
    edge = shade(P["lavender"], 0.30)
    for row in range(3):
        y = PANEL_Y + 12.0 + row * 20.0
        # A half-step offset on alternate rows: an aligned grid looks printed
        # by a machine, a dropped one looks like cloth.
        offset = 0.0 if row % 2 == 0 else 14.0
        for col in range(3):
            x = PANEL_X + 15.0 + col * 28.0 + offset
            if x > PANEL_X + PANEL_W - 10.0:
                continue
            _damask_motif(c, x, y, 0.9, motif, edge)
    _bead(c, 3.0, alpha(edge, 0.85))


def wallpaper_velvet(c: Canvas) -> None:
    """
    Tier 4. Buttoned velvet: the point where the wall stops being paper.

    The quilting is the whole idea — a lattice of soft diamonds with a gold
    button at each crossing. It is padded, so the panel gets a rounder corner
    and a soft sheen down the middle rather than a flat fill.
    """
    base = shade(P["wallGrape"], 0.18)
    _panel(c, base, r=5.0)
    inner = (PANEL_X + 2.0, PANEL_Y + 2.0, PANEL_W - 4.0, PANEL_H - 4.0)
    # No sheen. Velvet does catch the light in a broad band, but any wash
    # large enough to read as one reads first as a pale disc floating on the
    # wall — the quilting and the buttons carry the material on their own.
    seam = alpha(shade(base, 0.45), 0.85)
    # The lattice: two families of diagonals, clipped to the padding so the
    # diamonds run off its edge like real buttoned upholstery.
    for i in range(-4, 8):
        x0 = PANEL_X + i * 18.0
        _clipped_line(c, (x0, PANEL_Y + PANEL_H), (x0 + PANEL_H, PANEL_Y), inner, seam, 1.0)
        _clipped_line(c, (x0, PANEL_Y), (x0 + PANEL_H, PANEL_Y + PANEL_H), inner, seam, 1.0)
    for row in range(3):
        for col in range(5):
            bx = PANEL_X + 7.0 + col * 18.0 + (9.0 if row % 2 else 0.0)
            by = PANEL_Y + 8.0 + row * 18.0
            if bx > PANEL_X + PANEL_W - 5.0:
                continue
            c.circle(bx, by, 1.9, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    _bead(c, 2.6, alpha(GOLD_DK, 0.9), lw=LW_DETAIL, r=3.5)


def wallpaper_gilded(c: Canvas) -> None:
    """
    Tier 5. Gilt-framed silk. The first piece with real *moulding*: a bead all
    the way round, a rosette in each corner, and a sprig repeat inside it.
    """
    base = P["wallSand"]
    _panel(c, base)
    c.rrect(PANEL_X + 4.0, PANEL_Y + 4.0, PANEL_W - 8.0, PANEL_H - 8.0, r=2.4,
            fill=tint(base, 0.30), ink=GOLD_DK, lw=LW_DETAIL)
    sprig = alpha(GOLD_DK, 0.55)
    for row in range(2):
        for col in range(3):
            _damask_motif(c, PANEL_X + 21.0 + col * 22.0, PANEL_Y + 22.0 + row * 22.0,
                          0.62, sprig)
    for cx in (PANEL_X + 9.0, PANEL_X + PANEL_W - 9.0):
        for cy in (PANEL_Y + 9.0, PANEL_Y + PANEL_H - 9.0):
            _rosette(c, cx, cy, 3.6)


def wallpaper_mural(c: Canvas) -> None:
    """
    Tier 6. A painted scene wrapped round the room — hills, a lake and a low
    sun, in the same flat bands the game's own backdrop uses so the mural
    belongs to this world rather than to a stock photograph.
    """
    x, y, w, h = _panel(c, P["skyHi"])
    ix, iy, iw, ih = x + 3.0, y + 3.0, w - 6.0, h - 6.0
    c.rrect(ix, iy, iw, ih, r=2.0, fill=P["skyHi"])
    c.circle(ix + iw * 0.74, iy + ih * 0.26, 7.0, fill=P["cream"])
    # Two ranks of hills, the far one paler: the whole depth cue, and it costs
    # two polygons rather than a perspective grid.
    c.poly([(ix, iy + ih * 0.62), (ix + iw * 0.30, iy + ih * 0.30),
            (ix + iw * 0.62, iy + ih * 0.66), (ix, iy + ih * 0.66)],
           fill=P["treeFar"])
    c.poly([(ix + iw * 0.34, iy + ih * 0.68), (ix + iw * 0.66, iy + ih * 0.34),
            (ix + iw, iy + ih * 0.70), (ix + iw, iy + ih * 0.72), (ix + iw * 0.34, iy + ih * 0.72)],
           fill=P["treeNear"])
    c.rect(ix, iy + ih * 0.70, iw, ih * 0.30, fill=P["water"])
    for hx, hy, hw in ((0.16, 0.80, 0.30), (0.56, 0.88, 0.22)):
        c.rrect(ix + iw * (hx - hw / 2), iy + ih * hy - 0.9, iw * hw, 1.8, r=0.9,
                fill=alpha(P["white"], 0.65))
    # Gulls: a shallow double curve each, small enough to stay a bird and not
    # become a pair of eyebrows.
    for bx, by in ((ix + iw * 0.26, iy + ih * 0.17), (ix + iw * 0.40, iy + ih * 0.11)):
        c.arc(bx - 2.2, by, 2.2, 1.8, 200, 340, P["ink2"], 0.9)
        c.arc(bx + 2.2, by, 2.2, 1.8, 200, 340, P["ink2"], 0.9)
    _bead(c, 2.4, GOLD_DK, lw=LW_DETAIL)


def wallpaper_handpaintedsilk(c: Canvas) -> None:
    """
    Tier 7. Hand-painted silk: a chinoiserie branch with blossom and a bird.

    What makes it read as *painted by a person* is that the ornament is
    asymmetric and drawn once, where every cheaper paper repeats. That is a
    shape argument, so it survives being shrunk to 55%.
    """
    base = mix(P["wallMint"], P["linen"], 0.35)
    _panel(c, base)
    # No warp texture. Two attempts at a woven ground both read as stripes,
    # and stripes are tier 2: the silk has to say "painted", so the ground
    # stays a flat field and every mark on it is part of the painting.
    branch = P["woodDk"]
    c.line([(PANEL_X + 10.0, PANEL_Y + PANEL_H - 4.0), (PANEL_X + 22.0, PANEL_Y + 40.0),
            (PANEL_X + 30.0, PANEL_Y + 24.0), (PANEL_X + 46.0, PANEL_Y + 12.0)], branch, 1.6)
    c.line([(PANEL_X + 26.0, PANEL_Y + 32.0), (PANEL_X + 40.0, PANEL_Y + 34.0)], branch, 1.2)
    c.line([(PANEL_X + 34.0, PANEL_Y + 19.0), (PANEL_X + 30.0, PANEL_Y + 8.0)], branch, 1.2)
    for lx, ly in ((PANEL_X + 36.0, PANEL_Y + 34.0), (PANEL_X + 25.0, PANEL_Y + 38.0),
                   (PANEL_X + 44.0, PANEL_Y + 15.0)):
        c.ellipse(lx, ly, 3.6, 2.0, fill=P["leaf"], ink=P["greenDk"], lw=LW_FACE)
    for bx, by in ((PANEL_X + 30.0, PANEL_Y + 8.0), (PANEL_X + 41.0, PANEL_Y + 30.0),
                   (PANEL_X + 22.0, PANEL_Y + 44.0)):
        for a in range(5):
            ang = math.radians(a * 72 - 90)
            c.circle(bx + math.cos(ang) * 2.7, by + math.sin(ang) * 2.7, 2.1,
                     fill=P["wallRose"], ink=P["ink"], lw=LW_FACE)
        c.circle(bx, by, 1.5, fill=GOLD)
    # The bird, perched on the branch and facing into the panel.
    bx, by = PANEL_X + 58.0, PANEL_Y + 22.0
    c.ellipse(bx, by, 6.2, 4.6, fill=P["glass"], ink=P["ink"], lw=LW_FACE)
    c.circle(bx + 5.0, by - 3.6, 3.4, fill=P["glass"], ink=P["ink"], lw=LW_FACE)
    c.poly([(bx + 8.2, by - 3.8), (bx + 11.4, by - 2.8), (bx + 8.2, by - 2.0)],
           fill=GOLD, ink=P["ink"], lw=LW_FACE)
    c.poly([(bx - 5.4, by - 0.8), (bx - 13.0, by + 3.4), (bx - 4.6, by + 2.6)],
           fill=P["glassDk"], ink=P["ink"], lw=LW_FACE)
    c.ellipse(bx + 0.6, by + 0.4, 3.4, 2.2, fill=P["glassDk"], ink=P["ink"], lw=LW_FACE)
    c.circle(bx + 5.6, by - 4.2, 0.9, fill=P["ink"])
    _bead(c, 3.2, alpha(GOLD_DK, 0.8))


def wallpaper_gildedpanelling(c: Canvas) -> None:
    """
    Tier 8. Not a covering at all: joinery.

    A cornice, a dado rail and two raised panels with gilt beads. This is the
    one piece in the category whose silhouette changes — the wall gains
    horizontal architecture — and that is precisely why it reads as the top of
    the ladder from across a room.
    """
    base = P["wallSand"]
    _panel(c, base, r=2.0)
    dado_y = PANEL_Y + PANEL_H - 16.0
    # Below the rail the wall is a deeper colour: panelling is two zones, and
    # that horizontal division is most of what the eye reads from a distance.
    c.rect(PANEL_X + 1.0, dado_y, PANEL_W - 2.0, PANEL_H - (dado_y - PANEL_Y) - 1.0,
           fill=mix(base, P["wood"], 0.30))
    _cornice(c, P["linen"], h=6.0)
    c.rrect(PANEL_X, dado_y - 1.6, PANEL_W, 3.6, r=1.2,
            fill=P["linen"], ink=P["ink"], lw=LW_DETAIL)
    field_h = dado_y - PANEL_Y - 15.0
    for i in range(3):
        px = PANEL_X + 6.0 + i * 26.0
        c.rrect(px, PANEL_Y + 11.0, 22.0, field_h, r=1.6,
                fill=P["creamHi"], ink=P["ink"], lw=LW_DETAIL)
        c.rrect(px + 2.6, PANEL_Y + 13.6, 16.8, field_h - 5.2, r=1.0, ink=GOLD, lw=LW_DETAIL)
        _rosette(c, px + 11.0, PANEL_Y + 11.0 + field_h / 2, 3.4)
    for i in range(3):
        c.rrect(PANEL_X + 6.0 + i * 26.0, dado_y + 4.4, 22.0, 7.4, r=1.2,
                fill=mix(base, P["wood"], 0.10), ink=alpha(P["ink"], 0.7), lw=LW_FACE)


def wallpaper_animatedAurora(c: Canvas) -> None:
    """
    Tier 99. The fantasy rung: a night sky that moves.

    Everything else in the category is a surface; this one is a light source,
    so it is allowed the glow ART-0 §8 otherwise rations. Three ribbons built
    from sine curves, each a flat translucent band — no gradient, because a
    gradient here would be the one photographic thing in the game.
    """
    base = shade(P["wallNavy"], 0.42)
    _panel(c, base, r=3.0)
    for sx, sy, r in ((14.0, 13.0, 1.6), (32.0, 8.0, 1.2), (52.0, 11.0, 1.5),
                      (70.0, 8.0, 1.2), (78.0, 20.0, 1.5), (22.0, 25.0, 1.2)):
        c.circle(PANEL_X + sx, PANEL_Y + sy, r, fill=P["white"])
    _star(c, PANEL_X + 62.0, PANEL_Y + 17.0, 3.6, fill=P["creamHi"])
    # The ribbons go over the stars, so the sky is behind the light rather
    # than punched through it. Each is a translucent band with a brighter
    # upper half — two flat tones, which is all the "glow" this style has.
    for i, (colour, amp, lift, thick) in enumerate((
            (P["water"], 5.0, 0.32, 9.0),
            (P["mint"], 6.5, 0.48, 12.0),
            (P["hairPink"], 4.5, 0.66, 8.0))):
        top, bottom = [], []
        for step in range(13):
            t = step / 12
            x = PANEL_X + 2.0 + t * (PANEL_W - 4.0)
            y = PANEL_Y + PANEL_H * lift + math.sin(t * 3.4 + i * 1.7) * amp
            top.append((x, y))
            bottom.append((x, y + thick))
        c.poly(top + bottom[::-1], fill=alpha(colour, 0.38))
        c.poly(top + [(p[0], p[1] + thick * 0.40) for p in top[::-1]],
               fill=alpha(tint(colour, 0.50), 0.72))
    _bead(c, 2.4, alpha(P["glass"], 0.55), lw=LW_DETAIL)


# ============================================================= W A L L A R T

def wallArt_poster(c: Canvas) -> None:
    """
    Tier 1. A paper poster stuck up with tape — no frame, and the missing
    frame is the point: it is what makes every framed piece above it read as
    an upgrade without a word of text.
    """
    x, y, w, h = 48.0 - 23.0, 36.0 - 28.0, 46.0, 56.0
    c.rrect(x, y, w, h, r=1.4, fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    c.rect(x + 4.0, y + 4.0, w - 8.0, h - 20.0, fill=P["skyHi"])
    c.circle(x + w * 0.68, y + 14.0, 5.6, fill=P["cream"])
    c.poly([(x + 4.0, y + h - 16.0), (x + w * 0.42, y + 16.0), (x + w * 0.72, y + h - 16.0)],
           fill=P["treeNear"])
    c.poly([(x + w * 0.46, y + h - 16.0), (x + w * 0.74, y + 24.0), (x + w - 4.0, y + h - 16.0)],
           fill=P["treeFar"])
    for i in range(2):
        c.rect(x + 6.0, y + h - 12.0 + i * 4.4, (w - 12.0) * (1.0 - i * 0.38), 2.0,
               fill=alpha(P["ink2"], 0.55))
    # Tape at two corners, at an angle, so the sheet reads as stuck not hung.
    for tx in (x + 2.0, x + w - 10.0):
        c.poly([(tx, y - 2.0), (tx + 8.0, y - 2.0), (tx + 6.0, y + 4.0), (tx - 2.0, y + 4.0)],
               fill=alpha(P["white"], 0.75), ink=alpha(P["ink2"], 0.5), lw=LW_FACE)


def wallArt_print(c: Canvas) -> None:
    """
    Tier 2. A framed print: a thin dark frame and a generous white mount.

    The mount is the upgrade. A picture with air around it looks bought from a
    shop rather than torn from a magazine.
    """
    ix, iy, iw, ih = _art_frame(c, 56.0, 44.0, P["ink2"], depth=2.4)
    c.rect(ix, iy, iw, ih, fill=P["white"])
    px, py, pw, ph = ix + 5.0, iy + 4.0, iw - 10.0, ih - 8.0
    c.rect(px, py, pw, ph, fill=P["wallSky"], ink=alpha(P["ink2"], 0.6), lw=LW_FACE)
    # A flat graphic print: three shapes, no scene. Cheap art has no depth.
    c.circle(px + pw * 0.34, py + ph * 0.40, 6.4, fill=P["coral"])
    c.rect(px + pw * 0.52, py + ph * 0.28, pw * 0.30, ph * 0.52, fill=P["lavender"])
    c.rect(px, py + ph * 0.76, pw, ph * 0.24, fill=P["mint"])


def wallArt_painting(c: Canvas) -> None:
    """
    Tier 3. An oil in a wooden frame: the first piece with a painted *scene*,
    and the first with a moulding profile — a bevel inside the frame face.
    """
    ix, iy, iw, ih = _art_frame(c, 62.0, 48.0, P["wood"], depth=4.0)
    c.rrect(48.0 - 27.0, 36.0 - 20.0, 54.0, 40.0, r=1.4, ink=P["woodDk"], lw=LW_FACE)
    c.rect(ix, iy, iw, ih, fill=P["skyHi"], ink=P["ink"], lw=LW_FACE)
    c.circle(ix + iw * 0.24, iy + ih * 0.28, 5.0, fill=P["creamHi"])
    c.poly([(ix, iy + ih * 0.66), (ix + iw * 0.40, iy + ih * 0.28),
            (ix + iw * 0.78, iy + ih * 0.70), (ix, iy + ih * 0.70)], fill=P["treeFar"])
    c.poly([(ix + iw * 0.42, iy + ih * 0.72), (ix + iw * 0.76, iy + ih * 0.40),
            (ix + iw, iy + ih * 0.74), (ix + iw, iy + ih * 0.76), (ix + iw * 0.42, iy + ih * 0.76)],
           fill=P["treeNear"])
    c.rect(ix, iy + ih * 0.74, iw, ih * 0.26, fill=P["green"])


def wallArt_sculptureWall(c: Canvas) -> None:
    """
    Tier 4. A metal sunburst mounted straight onto the plaster.

    The jump here is dimensional, not decorative: after three flat rectangles
    the category produces something with no frame and a spiky silhouette, and
    that contrast is worth more than any amount of extra detail inside a box.
    """
    cx, cy = 48.0, 36.0
    # No halo behind it. A contact shadow that big reads as a stain on the
    # plaster; a wall-mounted object gets its depth from its own outline.
    for i in range(12):
        ang = math.radians(i * 30)
        long_ray = i % 2 == 0
        r0, r1 = 8.0, 25.0 if long_ray else 18.0
        wdt = 2.6 if long_ray else 2.0
        nx, ny = math.cos(ang), math.sin(ang)
        px, py = -ny * wdt, nx * wdt
        c.poly([(cx + nx * r0 + px, cy + ny * r0 + py),
                (cx + nx * r1, cy + ny * r1),
                (cx + nx * r0 - px, cy + ny * r0 - py)],
               fill=GOLD if long_ray else GOLD_DK, ink=P["ink"], lw=LW_FACE)
    c.circle(cx, cy, 9.0, fill=GOLD, ink=P["ink"], lw=LW_PROP)
    c.circle(cx, cy, 5.0, fill=P["ink2"], ink=P["ink"], lw=LW_FACE)
    c.circle(cx - 1.8, cy - 2.0, 1.8, fill=alpha(P["white"], 0.6))


def wallArt_masterpiece(c: Canvas) -> None:
    """
    Tier 5. A gallery piece: heavy carved gilt frame, an oval mount, and its
    own picture light. Three separate signals of expense, all structural.
    """
    ix, iy, iw, ih = _art_frame(c, 66.0, 50.0, GOLD, depth=5.0)
    c.rrect(48.0 - 33.0, 36.0 - 25.0, 66.0, 50.0, r=2.2, ink=GOLD_DK, lw=LW_FACE)
    c.rect(ix, iy, iw, ih, fill=P["ink2"], ink=P["ink"], lw=LW_FACE)
    # The canvas: an abstract in three planes, so it reads as *art* rather
    # than as a photograph of something.
    c.ellipse(48.0, 36.0, iw * 0.40, ih * 0.42, fill=P["wallSand"])
    c.circle(48.0 - 5.0, 36.0 - 4.0, 6.6, fill=P["coral"])
    c.poly([(ix + 4.0, iy + ih - 3.0), (48.0 + 6.0, iy + 6.0), (ix + iw - 4.0, iy + ih - 3.0)],
           fill=alpha(P["lavender"], 0.85))
    c.circle(48.0 + 8.0, 36.0 + 5.0, 4.4, fill=P["mint"])
    for cx0 in (48.0 - 29.0, 48.0 + 29.0):
        for cy0 in (36.0 - 21.0, 36.0 + 21.0):
            _rosette(c, cx0, cy0, 3.4, GOLD_HI)
    _crest(c, 48.0, 36.0 - 25.0)


def wallArt_commissionedportrait(c: Canvas) -> None:
    """
    Tier 6. Somebody's face, painted to order, in an oval gilt surround.

    A portrait is the one subject that cannot be mass-produced, so the whole
    tier rests on the sitter being legible: chibi head, the game's own face
    vocabulary, and a collar to say the picture has a body in it.
    """
    x, y, w, h = 48.0 - 24.0, 36.0 - 30.0, 48.0, 60.0
    c.rrect(x, y, w, h, r=4.0, fill=GOLD, ink=P["ink"], lw=LW_PROP)
    c.rrect(x + 3.0, y + 3.0, w - 6.0, h - 6.0, r=3.0, ink=GOLD_DK, lw=LW_FACE)
    c.ellipse(48.0, 36.0, 17.0, 23.0, fill=P["wallSand"], ink=P["ink"], lw=LW_DETAIL)
    # The sitter. Shoulders first so the head sits on top of them.
    c.rrect(48.0 - 11.0, 36.0 + 8.0, 22.0, 16.0, r=6.0, fill=P["roomBlueDk"])
    c.rrect(48.0 - 3.4, 36.0 + 8.0, 6.8, 9.0, r=2.0, fill=P["skin2"])
    c.poly([(48.0 - 5.0, 36.0 + 8.0), (48.0, 36.0 + 14.0), (48.0 + 5.0, 36.0 + 8.0)],
           fill=P["white"])
    c.circle(48.0, 36.0 - 2.0, 9.4, fill=P["skin2"], ink=P["ink"], lw=LW_DETAIL)
    c.pie(48.0, 36.0 - 2.0, 9.4, 9.4, 180, 360, fill=P["hairBrown"])
    c.ellipse(48.0, 36.0 - 3.6, 9.3, 3.8, fill=P["hairBrown"])
    c.ellipse(48.0, 36.0 - 2.4, 5.8, 2.4, fill=P["skin2"])
    for side in (-1, 1):
        c.ellipse(48.0 + side * 3.4, 36.0 + 0.6, 1.3, 1.7, fill=P["ink"])
        c.ellipse(48.0 + side * 5.8, 36.0 + 3.4, 1.6, 1.0, fill=alpha(P["blush"], 0.6))
    c.arc(48.0, 36.0 + 2.6, 2.0, 2.2, 15, 165, P["ink"], LW_FACE)
    for cx0 in (x + 6.0, x + w - 6.0):
        _rosette(c, cx0, y + 6.0, 3.2, GOLD_HI)
    c.rrect(48.0 - 9.0, y + h - 5.2, 18.0, 4.0, r=1.2, fill=GOLD_HI, ink=P["ink"], lw=LW_FACE)


def wallArt_originallandscape(c: Canvas) -> None:
    """
    Tier 7. The biggest picture in the game: a wide original in a deep gilt
    frame, with its own light. Where the tier-3 painting has one rank of hills
    this has four planes and a foreground tree, because a wider canvas is only
    worth buying if there is visibly more painting in it.
    """
    ix, iy, iw, ih = _art_frame(c, 84.0, 54.0, GOLD, depth=5.4)
    c.rrect(48.0 - 42.0, 36.0 - 27.0, 84.0, 54.0, r=2.2, ink=GOLD_DK, lw=LW_FACE)
    c.rrect(ix - 1.4, iy - 1.4, iw + 2.8, ih + 2.8, r=1.2, fill=P["linen"])
    c.rect(ix, iy, iw, ih, fill=P["skyHi"], ink=P["ink"], lw=LW_FACE)
    c.circle(ix + iw * 0.70, iy + ih * 0.24, 6.2, fill=P["creamHi"])
    # Cloud, not haze: a band of white across the sky reads as a scanning
    # artefact. Two soft lumps read as weather.
    for cx0, cy0, rx0 in ((ix + iw * 0.26, iy + ih * 0.20, 7.0),
                          (ix + iw * 0.36, iy + ih * 0.24, 5.0)):
        c.ellipse(cx0, cy0, rx0, rx0 * 0.46, fill=alpha(P["white"], 0.7))
    c.poly([(ix, iy + ih * 0.60), (ix + iw * 0.26, iy + ih * 0.24),
            (ix + iw * 0.54, iy + ih * 0.62), (ix, iy + ih * 0.62)], fill=P["cityFar"])
    c.poly([(ix + iw * 0.30, iy + ih * 0.64), (ix + iw * 0.58, iy + ih * 0.30),
            (ix + iw * 0.92, iy + ih * 0.66), (ix + iw * 0.30, iy + ih * 0.66)],
           fill=P["treeFar"])
    c.rect(ix, iy + ih * 0.64, iw, ih * 0.14, fill=P["water"])
    c.rect(ix + iw * 0.14, iy + ih * 0.70, iw * 0.30, 1.6, fill=alpha(P["white"], 0.65))
    c.rect(ix, iy + ih * 0.78, iw, ih * 0.22, fill=P["green"])
    c.rect(ix, iy + ih * 0.78, iw, 2.0, fill=P["leaf"])
    # A tree in the near ground, the only object with an outline: it is what
    # tells the eye which plane is closest without any perspective at all.
    tx = ix + iw * 0.16
    c.rect(tx - 1.4, iy + ih * 0.62, 2.8, ih * 0.24, fill=P["woodDk"])
    c.circle(tx, iy + ih * 0.58, 7.0, fill=P["greenDk"], ink=P["ink"], lw=LW_FACE)
    c.circle(tx - 4.0, iy + ih * 0.66, 4.6, fill=P["green"])
    for cx0 in (48.0 - 38.0, 48.0 + 38.0):
        for cy0 in (36.0 - 23.0, 36.0 + 23.0):
            _rosette(c, cx0, cy0, 3.6, GOLD_HI)
    _crest(c, 48.0, 36.0 - 27.0)


# ============================================================= F L O O R I N G

def flooring_concrete(c: Canvas) -> None:
    """
    Tier 1. A poured slab: two expansion joints and a couple of chips. The
    floor a hotel has before anybody spends money on it.
    """
    x, y, w, h = _band(c, 24.0, P["concrete"])
    for i in (1, 2):
        c.line([(x + w * i / 3, y + 1.6), (x + w * i / 3, y + h - 1.6)],
               alpha(shade(P["concrete"], 0.30), 0.8), 1.0)
    for cx0, cy0, r in ((x + 12.0, y + 15.0, 1.4), (x + 40.0, y + 8.0, 1.2),
                        (x + 52.0, y + 17.0, 1.5)):
        c.ellipse(cx0, cy0, r, r * 0.7, fill=alpha(shade(P["concrete"], 0.22), 0.7))


def flooring_carpet(c: Canvas) -> None:
    """
    Tier 2. Fitted carpet: a thicker band with a soft rounded edge and a pile
    that catches the light in rows. Softness is the upgrade, so the silhouette
    itself is rounder than the slab it replaces.
    """
    base = mix(P["carpet"], P["wallRose"], 0.30)
    x, y, w, h = _band(c, 26.0, base, r=4.0)
    # The pile: a fine stagger of flecks at very low contrast. Full-width rows
    # read as a striped rug and bright dashes read as confetti; what a carpet
    # actually has is an even mottle with no direction in it at all.
    fleck = alpha(tint(base, 0.55), 0.18)
    for row in range(5):
        ry = y + 5.0 + row * 3.8
        for i in range(12):
            # The stagger is arithmetic, not random: a strict grid of flecks
            # reads as a keyboard, and the art has to be identical on every
            # run, so the jitter comes out of the indices themselves.
            fx = x + 5.0 + i * 5.2 + ((i * 7 + row * 3) % 5) * 0.9
            if fx > x + w - 6.0:
                continue
            c.line([(fx, ry), (fx + 1.6 + (i % 3) * 0.7, ry)], fleck, 1.2)
    c.rrect(x + 1.6, y + 1.6, w - 3.2, h - 3.2, r=3.0, ink=alpha(shade(base, 0.28), 0.7),
            lw=LW_FACE)


def flooring_oak(c: Canvas) -> None:
    """
    Tier 3. Oak boards. Staggered end joints are the entire trick: a grid of
    aligned rectangles reads as tiling, an offset one reads as timber.
    """
    x, y, w, h = _band(c, 26.0, P["wood"])
    rows = 3
    depth = (h - 3.2) / rows
    for row in range(rows):
        ry = y + 1.6 + row * depth
        if row:
            c.line([(x + 1.4, ry), (x + w - 1.4, ry)], alpha(P["woodDk"], 0.9), 1.2)
        # One end joint per course, well away from the one above it. The first
        # version put three per course and the floor read as brickwork: what
        # separates boards from bricks is that boards are long.
        jx = x + 18.0 + (row % 2) * 30.0
        c.line([(jx, ry + 0.6), (jx, ry + depth - 0.6)], alpha(P["woodDk"], 0.9), 1.0)
        # Grain: one pale streak and one dark, both well inside the course.
        c.rect(x + 5.0 + row * 7.0, ry + depth * 0.34, w * 0.34, 1.2,
               fill=alpha(P["woodPale"], 0.55))
        c.rect(x + w * 0.52 - row * 5.0, ry + depth * 0.66, w * 0.24, 1.0,
               fill=alpha(P["woodDk"], 0.40))


def flooring_marble(c: Canvas) -> None:
    """
    Tier 4. Marble slabs: pale stone, wide joints, and veins that wander
    across a joint the way real stone does — the cue that says one block was
    cut into pieces rather than printed in a factory.
    """
    x, y, w, h = _band(c, 26.0, tint(P["tile"], 0.35))
    for i in (1, 2, 3):
        c.line([(x + w * i / 4, y + 1.4), (x + w * i / 4, y + h - 1.4)], P["tileDk"], 1.4)
    # Two veins, and both cross a joint. That crossing is the whole difference
    # between stone that was cut into slabs and tiles that were printed.
    # Two short veins that fade before the far edge. One drawn corner to
    # corner reads as a crack in the picture rather than as grain in stone.
    vein = alpha(mix(P["tileDk"], P["ink2"], 0.40), 0.60)
    c.line([(x + 3.0, y + 8.0), (x + 15.0, y + 11.0), (x + 27.0, y + 7.0),
            (x + 38.0, y + 10.0)], vein, 1.1)
    c.line([(x + 30.0, y + 19.0), (x + 44.0, y + 16.0), (x + w - 4.0, y + 19.0)],
           alpha(vein, 0.55), 0.9)
    c.rect(x + 3.0, y + 3.0, w * 0.22, 1.6, fill=alpha(P["white"], 0.85))


def flooring_mosaic(c: Canvas) -> None:
    """
    Tier 5. Mosaic: a laid pattern rather than a material, so the value is in
    the *design* — a two-colour chequer with a bordered field and a run of
    accent tiles down the middle.
    """
    base = P["tileDk"]
    x, y, w, h = _band(c, 26.0, base)
    tile = 6.2
    cols = int((w - 6.0) // tile)
    rows = 3
    for row in range(rows):
        for col in range(cols):
            tx = x + 3.0 + col * tile
            ty = y + 3.4 + row * tile
            if row == 1 and col % 3 == 1:
                colour = P["coral"]
            elif (row + col) % 2 == 0:
                colour = P["glass"]
            else:
                colour = P["white"]
            c.rrect(tx, ty, tile - 1.0, tile - 1.0, r=0.8, fill=colour)
    c.rrect(x + 1.8, y + 1.8, w - 3.6, h - 3.6, r=1.4, ink=alpha(P["ink2"], 0.7), lw=LW_FACE)


def flooring_obsidian(c: Canvas) -> None:
    """
    Tier 6. Polished black stone. The only floor in the range that is darker
    than the room, which is why it needs a hard specular streak: without one
    it is a hole in the picture rather than a surface.
    """
    base = mix(P["black"], P["ink"], 0.45)
    x, y, w, h = _band(c, 26.0, base)
    for i in (1, 2):
        c.line([(x + w * i / 3, y + 1.4), (x + w * i / 3, y + h - 1.4)],
               alpha(P["metalDk"], 0.5), 1.0)
    # Three parallel streaks of the same rake, close together. Two crossing
    # slashes read as a warning sign rather than as a polish.
    for i, a in enumerate((0.22, 0.14, 0.10)):
        sx = x + 8.0 + i * 6.0
        c.poly([(sx, y + h - 4.0), (sx + 10.0, y + 4.0), (sx + 13.0, y + 4.0),
                (sx + 3.0, y + h - 4.0)], fill=alpha(P["glass"], a))
    c.rect(x + 2.6, y + 2.6, w - 5.2, 1.4, fill=alpha(P["glass"], 0.35))


def flooring_inlaidparquet(c: Canvas) -> None:
    """
    Tier 7. Inlaid parquet: chevrons in two woods inside a banded border.

    Every cheaper wood floor is straight boards, so turning the grain forty-
    five degrees is the whole statement — it is visibly cut and fitted by hand.
    """
    x, y, w, h = _band(c, 28.0, P["woodDk"])
    field = (x + 4.0, y + 4.0, w - 8.0, h - 8.0)
    fx, fy, fw, fh = field
    c.rect(fx, fy, fw, fh, fill=P["wood"])
    # Chevrons drawn as thick strokes rather than as tessellated
    # parallelograms: at this size the tessellation collapsed into vertical
    # stripes, and a stroked Λ keeps the turn in the grain visible. Each
    # limb is clipped to the field, so the inlay has a cut edge and the
    # border stays a border instead of being painted over the corners.
    half = 6.5
    for i in range(-1, int(fw // (half * 2)) + 2):
        px = fx + i * half * 2
        for j, colour in ((0, P["woodPale"]), (1, mix(P["woodDk"], P["wood"], 0.35))):
            a = (px + j * half, fy + fh)
            b = (px + half + j * half, fy)
            d = (px + half * 2 + j * half, fy + fh)
            _clipped_line(c, a, b, field, colour, 4.0)
            _clipped_line(c, b, d, field, colour, 4.0)
    c.rrect(x + 2.6, y + 2.6, w - 5.2, h - 5.2, r=1.2, ink=alpha(GOLD_DK, 0.85), lw=LW_FACE)


def flooring_onyxfloor(c: Canvas) -> None:
    """
    Tier 8. Backlit onyx: honey stone with dramatic veining, a brass inlay
    strip round the edge, and a glow at the joints. The most expensive floor
    should be the only one that emits any light at all.
    """
    base = mix(P["cream"], P["wood"], 0.30)
    x, y, w, h = _band(c, 28.0, base)
    c.rect(x + 2.0, y + 2.0, w - 4.0, h - 4.0, fill=tint(base, 0.22))
    # The light that makes it onyx rather than marble: a warm band lying along
    # the slab, drawn under the veins so the stone reads as lit from within
    # rather than as a smudge left on top of it.
    c.rrect(x + 5.0, y + 5.0, w - 10.0, h - 10.0, r=6.0, fill=alpha(P["white"], 0.40))
    # Onyx is banded, not fractured: the grain runs the length of the slab in
    # broad parallel waves. Angular veins crossing each other read as a
    # cracked pane, which is what the first pass looked like.
    for i, (dy, a, lw) in enumerate(((7.0, 0.55, 1.6), (13.0, 0.35, 1.2),
                                     (20.0, 0.45, 1.4), (24.0, 0.25, 1.0))):
        pts = [(x + 3.0 + k * (w - 6.0) / 6,
                y + dy + math.sin(k * 0.9 + i * 1.3) * 2.2) for k in range(7)]
        c.line(pts, alpha(P["woodDk"], a), lw)
    c.rrect(x + 2.2, y + 2.2, w - 4.4, h - 4.4, r=1.4, ink=GOLD, lw=LW_DETAIL)


# ======================================================================= R U G

def rug_mat(c: Canvas) -> None:
    """
    Tier 1. A doormat: small, thin, one colour, one border. Sized well under
    the band the other rugs use, because 'this one is smaller' is the plainest
    possible statement of where it sits on the ladder.

    Coir rather than the grey it started as: on a wooden bedroom floor the grey
    version read as a paving slab somebody had left indoors.
    """
    base = mix(P["woodPale"], P["concrete"], 0.30)
    x, y, w, h = _band(c, 15.0, base, r=1.6, w=42.0)
    c.rrect(x + 2.4, y + 2.4, w - 4.8, h - 4.8, r=1.0, ink=alpha(shade(base, 0.34), 0.9),
            lw=LW_FACE)
    for i in range(6):
        c.line([(x + 6.0 + i * 5.4, y + 4.6), (x + 6.0 + i * 5.4, y + h - 4.6)],
               alpha(shade(base, 0.26), 0.7), 1.0)


def rug_woolRug(c: Canvas) -> None:
    """
    Tier 2. A chunky wool rug: wider, thicker, and striped at the ends. Still
    no pattern in the field — that is what tier 3 buys.
    """
    base = mix(P["mint"], P["linen"], 0.25)
    x, y, w, h = _band(c, 19.0, base, r=3.0, w=54.0)
    # Two woven bands at each end and one down the middle: a kilim stripe, and
    # the only pattern a rug at this price has.
    for bx in (x + 4.0, x + w - 8.0):
        c.rect(bx, y + 2.4, 4.0, h - 4.8, fill=alpha(P["greenDk"], 0.60))
    c.rect(x + 4.0, BAND_CY - 1.6, w - 8.0, 3.2, fill=alpha(P["greenDk"], 0.30))
    c.rrect(x + 1.8, y + 1.8, w - 3.6, h - 3.6, r=2.0, ink=alpha(shade(base, 0.34), 0.85),
            lw=LW_FACE)


def rug_persianRug(c: Canvas) -> None:
    """
    Tier 3. The first woven rug: red field, cream border with a dentil run, a
    central medallion, and fringes. Four features where tier 2 has one.
    """
    base = P["carpet"]
    x, y, w, h = _band(c, 22.0, base, r=2.0, w=60.0)
    _fringe(c, x, y, w, h, P["creamHi"])
    c.rrect(x + 2.6, y + 2.6, w - 5.2, h - 5.2, r=1.4, fill=P["creamHi"],
            ink=alpha(P["ink"], 0.6), lw=LW_FACE)
    c.rrect(x + 6.4, y + 6.4, w - 12.8, h - 12.8, r=1.2, fill=base)
    for i in range(9):
        dx = x + 6.0 + i * 6.2
        if dx > x + w - 7.0:
            continue
        c.rect(dx, y + 3.8, 3.0, 2.0, fill=alpha(P["ink2"], 0.7))
        c.rect(dx, y + h - 5.8, 3.0, 2.0, fill=alpha(P["ink2"], 0.7))
    _medallion(c, 36.0, BAND_CY, 11.0, 5.6, P["cream"], P["ink"])
    _medallion(c, 36.0, BAND_CY, 5.4, 2.8, P["roomBlue"], P["ink"])


def rug_silkRug(c: Canvas) -> None:
    """
    Tier 4. Silk: the same weave, but the surface has a sheen and the pattern
    is a fine lattice rather than a block medallion. Material, not size.
    """
    base = P["lavender"]
    x, y, w, h = _band(c, 22.0, base, r=2.4, w=60.0)
    _fringe(c, x, y, w, h, GOLD_DK)
    c.rrect(x + 2.6, y + 2.6, w - 5.2, h - 5.2, r=1.6, ink=GOLD, lw=LW_DETAIL)
    lat = alpha(tint(base, 0.60), 0.9)
    inner = (x + 4.0, y + 4.0, w - 8.0, h - 8.0)
    for i in range(-2, 9):
        px = x + 4.0 + i * 8.0
        _clipped_line(c, (px, y + h), (px + h, y), inner, lat, 1.0)
        _clipped_line(c, (px, y), (px + h, y + h), inner, lat, 1.0)
    # The sheen: a straight band along the top of the pile. Drawn as an
    # ellipse it read as a white grin lying on the rug.
    c.rect(x + 5.0, y + 4.0, w - 10.0, 2.4, fill=alpha(P["white"], 0.34))
    _medallion(c, 36.0, BAND_CY, 9.0, 5.6, P["wallRose"], P["ink"])
    _medallion(c, 36.0, BAND_CY, 4.4, 2.8, tint(base, 0.55), P["ink"])


def rug_antiqueRug(c: Canvas) -> None:
    """
    Tier 5. An antique: muted, denser, and with corner spandrels framing the
    medallion. Age is drawn as *more pattern in less contrast*, which is what
    an old rug actually looks like.
    """
    base = mix(P["carpet"], P["woodDk"], 0.40)
    x, y, w, h = _band(c, 24.0, base, r=2.0, w=62.0)
    _fringe(c, x, y, w, h, P["linenSh"])
    c.rrect(x + 2.4, y + 2.4, w - 4.8, h - 4.8, r=1.4, fill=mix(P["cream"], P["woodDk"], 0.30),
            ink=alpha(P["ink"], 0.6), lw=LW_FACE)
    c.rrect(x + 7.0, y + 7.0, w - 14.0, h - 14.0, r=1.2, fill=base)
    for i in range(11):
        dx = x + 5.0 + i * 5.4
        if dx > x + w - 6.0:
            continue
        for dy in (y + 3.6, y + h - 5.6):
            _medallion(c, dx + 1.5, dy + 1.0, 2.0, 1.8, alpha(P["greenDk"], 0.75), None)
    for cx0 in (x + 12.0, x + w - 12.0):
        for cy0 in (y + 9.0, y + h - 9.0):
            c.ellipse(cx0, cy0, 3.4, 2.0, fill=alpha(P["cream"], 0.55))
    _medallion(c, 36.0, BAND_CY, 12.0, 6.4, mix(P["cream"], P["wood"], 0.35), P["ink"])
    _medallion(c, 36.0, BAND_CY, 6.6, 3.4, P["greenDk"], P["ink"])
    c.circle(36.0, BAND_CY, 1.8, fill=P["cream"])


def rug_silkrunner(c: Canvas) -> None:
    """
    Tier 6. A runner: the shape changes. It spans the full width of the slot
    and is half the height of a rug, which is the one silhouette in this
    category nothing else has, and it repeats a motif down its length.
    """
    base = mix(P["wallGrape"], P["lavender"], 0.35)
    x, y, w, h = _band(c, 16.0, base, r=2.0, w=68.0)
    _fringe(c, x, y, w, h, P["creamHi"])
    c.rrect(x + 2.0, y + 2.0, w - 4.0, h - 4.0, r=1.2, ink=GOLD, lw=LW_FACE)
    for i in range(6):
        _medallion(c, x + 7.0 + i * 10.8, BAND_CY, 3.8, 4.6,
                   alpha(P["creamHi"], 0.9), alpha(P["ink"], 0.7))
    c.rect(x + 4.0, y + 3.6, w - 8.0, 1.2, fill=alpha(P["white"], 0.40))


def rug_antiquecarpet(c: Canvas) -> None:
    """
    Tier 7. The full carpet: widest, deepest, a double border, corner
    spandrels and a two-ring medallion. It is the tier-5 antique with every
    element promoted a size, which is how a range should end.
    """
    base = mix(P["carpet"], P["wallNavy"], 0.30)
    x, y, w, h = _band(c, 30.0, base, r=2.0, w=68.0)
    _fringe(c, x, y, w, h, P["creamHi"])
    c.rrect(x + 2.2, y + 2.2, w - 4.4, h - 4.4, r=1.4, fill=mix(P["cream"], P["wood"], 0.22),
            ink=alpha(P["ink"], 0.6), lw=LW_FACE)
    c.rrect(x + 6.4, y + 6.4, w - 12.8, h - 12.8, r=1.2, fill=P["carpet"],
            ink=alpha(GOLD_DK, 0.9), lw=LW_FACE)
    c.rrect(x + 9.6, y + 9.6, w - 19.2, h - 19.2, r=1.0, fill=base)
    for i in range(12):
        dx = x + 4.6 + i * 5.4
        if dx > x + w - 6.0:
            continue
        for dy in (y + 3.4, y + h - 5.4):
            _medallion(c, dx + 1.4, dy + 1.0, 1.9, 1.7, alpha(P["greenDk"], 0.8), None)
    for cx0 in (x + 15.0, x + w - 15.0):
        for cy0 in (y + 13.0, y + h - 13.0):
            _medallion(c, cx0, cy0, 4.4, 3.0, alpha(P["cream"], 0.62), None)
    _medallion(c, 36.0, BAND_CY, 15.0, 9.0, mix(P["cream"], P["wood"], 0.30), P["ink"])
    _medallion(c, 36.0, BAND_CY, 9.4, 5.6, P["wallNavy"], P["ink"])
    _medallion(c, 36.0, BAND_CY, 4.4, 2.6, GOLD, P["ink"])


# ============================================================= L I G H T I N G

def lighting_bulb(c: Canvas) -> None:
    """
    Tier 1. A bare bulb on a flex. One cord, one glass envelope, one brass
    cap — the whole fitting is three shapes, and it needs to be, because every
    other lamp in the category is measured against it.
    """
    drop = 14.0
    _glow(c, LIGHT_CX, drop + 9.0, 15.0)
    _cord(c, LIGHT_CX, drop)
    # The glass is white, not cream. Half the hotel has cream walls, and a
    # cream bulb on a cream wall is an empty outline.
    c.rrect(LIGHT_CX - 3.0, drop - 1.4, 6.0, 5.4, r=1.2, fill=P["metalDk"],
            ink=P["ink"], lw=LW_FACE)
    c.line([(LIGHT_CX - 3.0, drop + 1.4), (LIGHT_CX + 3.0, drop + 1.4)],
           alpha(P["ink"], 0.5), 0.9)
    c.circle(LIGHT_CX, drop + 10.0, 7.4, fill=P["white"], ink=P["ink"], lw=LW_PROP)
    # The filament: the one mark that makes a white circle a lit bulb. A
    # zigzag was the first try and it read as a letter, so it is a hairpin —
    # two leads and a loop, which is what a filament actually looks like.
    for side in (-1, 1):
        c.line([(LIGHT_CX + side * 2.0, drop + 5.6), (LIGHT_CX + side * 2.0, drop + 10.0)],
               GOLD_DK, 1.0)
    c.arc(LIGHT_CX, drop + 10.0, 2.0, 2.6, 0, 180, GOLD_DK, 1.0)
    c.circle(LIGHT_CX - 2.6, drop + 7.4, 1.6, fill=alpha(P["glass"], 0.7))


def lighting_lamp(c: Canvas) -> None:
    """
    Tier 2. The bulb gets a shade. A cone is the smallest possible piece of
    'somebody chose this', and it changes the silhouette from a dot to a
    triangle — which is the only thing that matters at 55%.
    """
    drop = 11.0
    _glow(c, LIGHT_CX, drop + 22.0, 18.0)
    _cord(c, LIGHT_CX, drop)
    c.poly([(LIGHT_CX - 13.0, drop + 15.0), (LIGHT_CX + 13.0, drop + 15.0),
            (LIGHT_CX + 5.0, drop), (LIGHT_CX - 5.0, drop)],
           fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    # One cel-shaded facet on the left of the cone. Two flat tones is the
    # whole shading budget ART-0 §8 allows, and it is enough to round a shade.
    c.poly([(LIGHT_CX - 13.0, drop + 15.0), (LIGHT_CX - 6.0, drop + 15.0),
            (LIGHT_CX - 1.6, drop), (LIGHT_CX - 5.0, drop)],
           fill=alpha(P["linenSh"], 0.75))
    c.rect(LIGHT_CX - 12.4, drop + 11.0, 24.8, 1.6, fill=alpha(GOLD, 0.8))
    c.ellipse(LIGHT_CX, drop + 15.0, 13.0, 2.8, fill=P["white"], ink=P["ink"], lw=LW_FACE)
    c.circle(LIGHT_CX, drop + 16.6, 3.2, fill=GOLD, ink=P["ink"], lw=LW_FACE)


def lighting_pendant(c: Canvas) -> None:
    """
    Tier 3. A designer dome on a brass rose, with a coloured drum and a glass
    diffuser under it. Two materials and a proper ceiling fitting: the first
    lamp that looks specified rather than screwed in.
    """
    drop = 13.0
    _glow(c, LIGHT_CX, drop + 22.0, 18.0)
    _ceiling_plate(c, LIGHT_CX, 12.0, GOLD_DK)
    _cord(c, LIGHT_CX, drop, GOLD_DK)
    c.pie(LIGHT_CX, drop + 15.0, 15.0, 15.0, 180, 360,
          fill=P["coral"], ink=P["ink"], lw=LW_PROP)
    c.rect(LIGHT_CX - 15.0, drop + 13.6, 30.0, 1.6, fill=shade(P["coral"], 0.25))
    c.pie(LIGHT_CX - 5.0, drop + 14.0, 8.0, 8.0, 190, 270, fill=alpha(P["white"], 0.28))
    c.ellipse(LIGHT_CX, drop + 15.0, 15.0, 3.0, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    c.circle(LIGHT_CX, drop + 17.0, 4.4, fill=P["creamHi"], ink=P["ink"], lw=LW_FACE)


def lighting_chandelier(c: Canvas) -> None:
    """
    Tier 4. The first fitting with *arms*: a chain, a boss and three candles
    on curved brackets. Counting arms is how a player reads chandelier value,
    so from here up the tiers are literally countable.
    """
    stem = 11.0
    _glow(c, LIGHT_CX, stem + 16.0, 26.0)
    _chain(c, LIGHT_CX, stem, links=2)
    # A visible column between the chain and the arms. Without it the three
    # candles read as three separate lamps that happen to be in a row.
    c.rrect(LIGHT_CX - 2.2, stem, 4.4, 13.0, r=1.8, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    for side in (-1, 1):
        ex = LIGHT_CX + side * 19.0
        # Four points, not three: an arm with one corner in it is a zigzag,
        # and a chandelier's arms are the one part of it that must curve.
        c.line([(LIGHT_CX, stem + 4.5), (LIGHT_CX + side * 8.0, stem + 11.5),
                (LIGHT_CX + side * 14.0, stem + 11.5), (ex, stem + 7.0)], GOLD, 2.4)
        c.ellipse(ex, stem + 7.0, 5.0, 2.2, fill=GOLD, ink=P["ink"], lw=LW_FACE)
        _candle(c, ex, stem + 6.6, 1.1)
    c.ellipse(LIGHT_CX, stem + 12.0, 5.0, 2.2, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    _candle(c, LIGHT_CX, stem + 11.6, 1.1)
    c.poly([(LIGHT_CX - 5.4, stem + 13.0), (LIGHT_CX + 5.4, stem + 13.0),
            (LIGHT_CX, stem + 22.0)], fill=GOLD_DK, ink=P["ink"], lw=LW_FACE)
    c.circle(LIGHT_CX, stem + 23.8, 2.6, fill=GOLD, ink=P["ink"], lw=LW_FACE)


def lighting_crystalTiers(c: Canvas) -> None:
    """
    Tier 5. Two tiers of crystal. The arms are still countable — five now, not
    three — but the new idea is the *curtain*: strings of drops hung between
    the rings, which is the silhouette that says chandelier from far away.
    """
    top = 9.0
    _glow(c, LIGHT_CX, top + 20.0, 26.0)
    _chain(c, LIGHT_CX, top, links=2)
    c.ellipse(LIGHT_CX, top + 1.6, 5.0, 2.6, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    # Upper ring, then the swagged strings, then the lower ring on top of them.
    c.ellipse(LIGHT_CX, top + 8.0, 12.0, 3.0, fill=GOLD, ink=P["ink"], lw=LW_DETAIL)
    for i in range(5):
        t = i / 4
        x0 = LIGHT_CX - 12.0 + t * 24.0
        x1 = LIGHT_CX - 19.0 + t * 38.0
        c.line([(x0, top + 9.0), ((x0 + x1) / 2, top + 16.0), (x1, top + 19.0)],
               alpha(P["glass"], 0.9), 1.0)
    c.ellipse(LIGHT_CX, top + 19.0, 19.0, 4.0, fill=GOLD, ink=P["ink"], lw=LW_DETAIL)
    for i in range(5):
        cx0 = LIGHT_CX - 16.0 + i * 8.0
        _candle(c, cx0, top + 18.4, 0.86)
    for i in range(7):
        _drop(c, LIGHT_CX - 18.0 + i * 6.0, top + 25.0 + (2.4 if i % 2 else 0.0), 0.95)
    c.poly([(LIGHT_CX - 4.0, top + 21.0), (LIGHT_CX + 4.0, top + 21.0),
            (LIGHT_CX, top + 30.0)], fill=P["glass"], ink=P["ink"], lw=LW_FACE)


def lighting_starfield(c: Canvas) -> None:
    """
    Tier 6. A cluster of glass globes on cords of different lengths.

    A completely different idea from the crystal tiers below it in price —
    modern rather than classical — so the ladder does not read as one lamp
    getting steadily fatter. Varied drop lengths are the whole composition.
    """
    c.rrect(LIGHT_CX - 22.0, 0.0, 44.0, 3.6, r=1.4, fill=P["ink2"],
            ink=P["ink"], lw=LW_DETAIL)
    for dx, drop, r in ((-17.0, 14.0, 4.6), (-8.0, 26.0, 5.6), (0.0, 18.0, 4.2),
                        (9.0, 32.0, 6.4), (18.0, 21.0, 5.0)):
        cx0 = LIGHT_CX + dx
        _glow(c, cx0, drop + r, r * 2.6, steps=2)
        c.line([(cx0, 2.0), (cx0, drop)], P["ink2"], 0.9)
        # A brass collar, a white globe, and the same gold filament the bare
        # bulb has. The filament is what stops the glass from reading as an
        # empty ring on a cream wall — white on cream has an outline and
        # nothing inside it.
        c.rrect(cx0 - 2.0, drop - 1.4, 4.0, 3.4, r=1.0, fill=GOLD,
                ink=P["ink"], lw=LW_FACE)
        c.circle(cx0, drop + r, r, fill=P["white"], ink=P["ink"], lw=LW_DETAIL)
        for side in (-1, 1):
            c.line([(cx0 + side * r * 0.30, drop + r * 0.55),
                    (cx0 + side * r * 0.30, drop + r * 1.10)], GOLD_DK, 1.0)
        c.arc(cx0, drop + r * 1.10, r * 0.30, r * 0.36, 0, 180, GOLD_DK, 1.0)


def lighting_crystalchandelier(c: Canvas) -> None:
    """
    Tier 7. Three tiers, six candles and a full skirt of drops.

    The classical range's summit: everything the tier-5 piece has, one storey
    taller and one ring wider, plus the beaded swags between the rings that
    only a real crystal fitting has.
    """
    top = 6.0
    _glow(c, LIGHT_CX, top + 22.0, 30.0)
    c.line([(LIGHT_CX, 0.0), (LIGHT_CX, top)], GOLD_DK, LW_DETAIL)
    c.ellipse(LIGHT_CX, top + 1.0, 5.4, 2.8, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    # A crown of drops at the top, which is what a three-tier fitting has and
    # a two-tier one does not.
    for i in range(5):
        _drop(c, LIGHT_CX - 8.0 + i * 4.0, top + 6.0, 0.8)
    c.ellipse(LIGHT_CX, top + 9.0, 10.0, 2.6, fill=GOLD, ink=P["ink"], lw=LW_DETAIL)
    for ring_y, half in ((top + 16.0, 16.0), (top + 25.0, 23.0)):
        for i in range(6):
            t = i / 5
            c.line([(LIGHT_CX - half + t * half * 2, ring_y - 6.0),
                    (LIGHT_CX - half + t * half * 2 + 2.0, ring_y - 1.0)],
                   alpha(P["glass"], 0.85), 0.9)
        c.ellipse(LIGHT_CX, ring_y, half, 3.4, fill=GOLD, ink=P["ink"], lw=LW_DETAIL)
    for i in range(3):
        _candle(c, LIGHT_CX - 11.0 + i * 11.0, top + 15.4, 0.80)
    for i in range(6):
        _candle(c, LIGHT_CX - 20.0 + i * 8.0, top + 24.4, 0.86)
    for i in range(9):
        _drop(c, LIGHT_CX - 22.0 + i * 5.5, top + 31.0 + (2.6 if i % 2 else 0.0), 1.0)
    c.poly([(LIGHT_CX - 4.6, top + 27.0), (LIGHT_CX + 4.6, top + 27.0),
            (LIGHT_CX, top + 38.0)], fill=P["glass"], ink=P["ink"], lw=LW_FACE)
    c.circle(LIGHT_CX, top + 39.4, 2.0, fill=GOLD, ink=P["ink"], lw=LW_FACE)


def lighting_constellationlights(c: Canvas) -> None:
    """
    Tier 8. Stars on invisible wires, joined by the lines of a constellation.

    The most expensive fitting that is still a lamp: its value is in the
    *idea* rather than in the material, so it is drawn as a diagram in gold
    with a glow behind each star and nothing else on the ceiling at all.
    """
    c.rrect(LIGHT_CX - 16.0, 0.0, 32.0, 3.2, r=1.2, fill=P["ink2"],
            ink=P["ink"], lw=LW_DETAIL)
    stars = ((-21.0, 26.0, 4.6), (-11.0, 15.0, 3.4), (-1.0, 30.0, 5.4),
             (10.0, 19.0, 3.8), (20.0, 28.0, 4.4), (5.0, 38.0, 3.2))
    pts = [(LIGHT_CX + dx, dy) for dx, dy, _ in stars]
    for dx, dy, _ in stars:
        c.line([(LIGHT_CX + dx, 2.0), (LIGHT_CX + dx, dy)], alpha(P["ink2"], 0.55), 0.9)
    # The joining lines are the constellation; they are drawn under the stars
    # so each star sits on top of its own junction.
    for a, b in ((0, 1), (1, 2), (2, 3), (3, 4), (2, 5)):
        c.line([pts[a], pts[b]], alpha(P["ink2"], 0.45), 0.9)
    for (dx, dy, r) in stars:
        _glow(c, LIGHT_CX + dx, dy, r * 1.7, steps=2)
        _star(c, LIGHT_CX + dx, dy, r, fill=GOLD, ink=P["ink"], lw=LW_DETAIL)
        c.circle(LIGHT_CX + dx, dy, r * 0.30, fill=P["white"])


def lighting_hologram(c: Canvas) -> None:
    """
    Tier 99. A projector and the light it throws: no shade, no bulb, nothing
    physical below the ceiling plate except a hovering orb inside two rings.

    This is the only fitting in the game whose body is made of light, which is
    the point of a fantasy tier — it breaks the material rules the other
    thirty-nine pieces obey, and it can only get away with that once.
    """
    c.rrect(LIGHT_CX - 10.0, 0.0, 20.0, 5.4, r=1.8, fill=P["metalDk"],
            ink=P["ink"], lw=LW_DETAIL)
    c.rect(LIGHT_CX - 6.0, 1.4, 12.0, 1.4, fill=P["metal"])
    c.circle(LIGHT_CX, 5.6, 2.6, fill=P["water"], ink=P["ink"], lw=LW_FACE)
    # Two thin beams rather than one wide wedge. The wedge filled a third of
    # the canvas with pale blue and read as fog; two edges read as projection.
    for side in (-1, 1):
        c.poly([(LIGHT_CX + side * 1.6, 7.0), (LIGHT_CX + side * 3.2, 7.0),
                (LIGHT_CX + side * 20.0, 34.0), (LIGHT_CX + side * 16.0, 34.0)],
               fill=alpha(P["water"], 0.28))
    _glow(c, LIGHT_CX, 26.0, 15.0, P["water"], steps=2)
    # The orb: a solid body of light with two rings round it, so the fitting
    # has a silhouette instead of being a patch of haze.
    c.ellipse(LIGHT_CX, 26.0, 18.0, 6.4, ink=alpha(P["water"], 0.9), lw=LW_DETAIL)
    c.circle(LIGHT_CX, 26.0, 9.0, fill=P["glass"], ink=P["waterDk"], lw=LW_PROP)
    c.pie(LIGHT_CX, 26.0, 9.0, 9.0, 200, 340, fill=alpha(P["white"], 0.55))
    c.circle(LIGHT_CX - 3.0, 23.0, 2.4, fill=P["white"])
    c.ellipse(LIGHT_CX, 26.0, 13.0, 4.4, ink=alpha(P["waterDk"], 0.85), lw=LW_DETAIL)
    for dx, dy, r in ((-15.0, 33.0, 1.8), (14.0, 18.0, 1.5), (17.0, 32.0, 1.4),
                      (-13.0, 17.0, 1.3)):
        c.circle(LIGHT_CX + dx, dy, r, fill=P["water"])



# --------------------------------------------------------------- wall panels

def _as_wall_panel(draw):
    """
    Turn a wallpaper swatch into a panel of joinery on the wall.

    The swatches below are drawn edge to edge, which is right for a sample book
    and wrong on a wall: composited into a room, a 53x40 rectangle of flat
    colour reads as a blank screen hanging there, not as wall treatment. The
    same swatch inside a moulded panel reads as what it is — the wall has been
    panelled and papered — and the hard rectangle becomes deliberate.

    Applied by wrapping rather than by editing nine drawings, so a new
    wallpaper is framed the moment it joins the registry.
    """
    def framed(c):
        from PIL import ImageChops
        inset = 3.0
        radius = 3.5
        inner = Canvas(c.w, c.h, tier=c.tier)
        draw(inner)
        # Clip the swatch to the panel opening.
        mask = Canvas(c.w, c.h, tier=c.tier)
        mask.rrect(inset, inset, c.w - inset * 2, c.h - inset * 2, r=radius,
                   fill=(255, 255, 255, 255))
        clipped = ImageChops.multiply(inner.img.getchannel("A"), mask.img.getchannel("A"))
        # And let the room's own wall show through the paper.
        #
        # An opaque swatch is a billboard: pale blue "plain" wallpaper on a
        # lilac wall read as a television nobody had switched on. At 72% the
        # pattern still carries and the panel takes the colour of the room it
        # is in, which is what wall treatment does.
        inner.img.putalpha(clipped.point(lambda v: int(v * 0.72)))
        c.img.alpha_composite(inner.img)
        # The moulding: a raised bead outside the opening and a dark rebate on it.
        c.rrect(0.9, 0.9, c.w - 1.8, c.h - 1.8, r=radius + 2.2,
                ink=P["woodPale"], lw=LW_PROP)
        c.rrect(0.9, 0.9, c.w - 1.8, c.h - 1.8, r=radius + 2.2,
                ink=P["ink"], lw=LW_DETAIL)
        c.rrect(inset, inset, c.w - inset * 2, c.h - inset * 2, r=radius,
                ink=P["ink"], lw=LW_DETAIL)
    return framed


PIECES = {
    "wallpaper_plain":              _as_wall_panel(wallpaper_plain),
    "wallpaper_striped":            _as_wall_panel(wallpaper_striped),
    "wallpaper_damask":             _as_wall_panel(wallpaper_damask),
    "wallpaper_velvet":             _as_wall_panel(wallpaper_velvet),
    "wallpaper_gilded":             _as_wall_panel(wallpaper_gilded),
    "wallpaper_mural":              _as_wall_panel(wallpaper_mural),
    "wallpaper_handpaintedsilk":    _as_wall_panel(wallpaper_handpaintedsilk),
    "wallpaper_gildedpanelling":    _as_wall_panel(wallpaper_gildedpanelling),
    "wallpaper_animatedAurora":     _as_wall_panel(wallpaper_animatedAurora),

    "wallArt_poster":               wallArt_poster,
    "wallArt_print":                wallArt_print,
    "wallArt_painting":             wallArt_painting,
    "wallArt_sculptureWall":        wallArt_sculptureWall,
    "wallArt_masterpiece":          wallArt_masterpiece,
    "wallArt_commissionedportrait": wallArt_commissionedportrait,
    "wallArt_originallandscape":    wallArt_originallandscape,

    "flooring_concrete":            flooring_concrete,
    "flooring_carpet":              flooring_carpet,
    "flooring_oak":                 flooring_oak,
    "flooring_marble":              flooring_marble,
    "flooring_mosaic":              flooring_mosaic,
    "flooring_obsidian":            flooring_obsidian,
    "flooring_inlaidparquet":       flooring_inlaidparquet,
    "flooring_onyxfloor":           flooring_onyxfloor,

    "rug_mat":                      rug_mat,
    "rug_woolRug":                  rug_woolRug,
    "rug_persianRug":               rug_persianRug,
    "rug_silkRug":                  rug_silkRug,
    "rug_antiqueRug":               rug_antiqueRug,
    "rug_silkrunner":               rug_silkrunner,
    "rug_antiquecarpet":            rug_antiquecarpet,

    "lighting_bulb":                lighting_bulb,
    "lighting_lamp":                lighting_lamp,
    "lighting_pendant":             lighting_pendant,
    "lighting_chandelier":          lighting_chandelier,
    "lighting_crystalTiers":        lighting_crystalTiers,
    "lighting_starfield":           lighting_starfield,
    "lighting_crystalchandelier":   lighting_crystalchandelier,
    "lighting_constellationlights": lighting_constellationlights,
    "lighting_hologram":            lighting_hologram,
}
