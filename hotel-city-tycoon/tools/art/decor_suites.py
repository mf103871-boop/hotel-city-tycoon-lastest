"""
The pieces only the gem suites sell — here, the executive suite's club look.

The executive is a boardroom that happens to have a bed in it: charcoal
leather, dark walnut, brass, white linen and one navy accent, against the sand
wall it is built on. Nothing in it is gilt or crystal — that is the
presidential's register — and nothing is timber-and-rattan, which is the
deluxe's. What has to survive the 55% composite is the outline, because that
is all a bed, a lamp or a plaque has left at 40px:

*   `bed_leatherWingback` is the one bed whose headboard has *ears*: a tall
    dark board with the two top corners flared out like a club chair. The
    king's board is a cream buttoned grid, the queen's a plain pad, the
    canopy and the four-poster have posts, the floating bed has no legs, the
    sleigh has curls at both ends and the emperor is an arch in gold.
*   `lighting_bankersPendant` is the one lamp that is a flat *lens* on a
    stick: a wide shallow green shade on a brass rod. The lamp is a cream
    cone, the pendant a coral half-dome, the bulb a bare globe, the lantern a
    box on a chain, the rattan a bell, and every chandelier is branched.
*   `wallArt_worldClocks` is the one wall piece with no picture in it: a
    dark plaque wider than it is tall carrying three brass rings. Every
    other wallArt is a framed scene, an oval portrait, a spiky sunburst, a
    map or a white screen.

Anchors as everywhere: the bed stands on the bottom edge with a contact
shadow, the pendant starts its rod at y = 0, the plaque is centred through
`_art_frame`. Sizes come from `c.w` / `c.h`.
"""
from __future__ import annotations

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    shade, tint, mix, math,
)
from decor_props import _stand, _legs, _bed_body, _pillow
from decor_surfaces import _art_frame, _cord, _ceiling_plate, _glow, GOLD, GOLD_DK

#: Dark walnut. The palette's darkest wood is `woodDk`, an orange oak; pulled
#: toward the navy of `ink2` from the brown of `hairBrown` it goes the
#: cool near-black a club-room bed base and an overdoor plaque are made of.
WALNUT_DK = mix(P["hairBrown"], P["ink2"], 0.30)

#: Charcoal leather: `black` is already a navy charcoal, and lifting it a
#: little toward `concrete` keeps it a grey the ink outline still separates
#: from, rather than a second outline colour.
CHARCOAL = mix(P["black"], P["concrete"], 0.30)

#: The one accent in the room. `wallNavy` shaded a step so it stays a
#: saturated blue next to the grey of the leather rather than a twin of it.
NAVY = shade(P["wallNavy"], 0.15)

#: Bottle green for the shade: the plant green pulled toward navy, which is
#: how glass that colour looks with a bulb behind it rather than a lawn.
BOTTLE = mix(P["greenDk"], P["ink2"], 0.30)


# ------------------------------------------------------------------ the bed

def _wingback(c: Canvas, hx: float, hw: float, top: float, bottom: float) -> None:
    """
    A wingback headboard seen face-on: a tall board whose two top corners
    flare out and up into ears, with a padded inset and a run of brass nails.

    The ears are the whole silhouette. They are drawn as part of one polygon
    rather than as two lumps stuck onto a rectangle, so the outline has the
    one continuous S each side that a club chair has; the first version with
    separate lumps read as a bed with a pair of horns.
    """
    ear = 5.0
    # Each ear tip is two points three pixels apart, not one: a single
    # vertex gives a spike, and a padded board has no spikes on it.
    board = [
        (hx, bottom), (hx, top + 15.0),
        (hx - ear, top + 2.4), (hx - ear + 1.2, top + 0.4), (hx - ear + 3.6, top),
        (hx + 6.0, top + 4.0), (hx + hw / 2, top + 6.0), (hx + hw - 6.0, top + 4.0),
        (hx + hw + ear - 3.6, top), (hx + hw + ear - 1.2, top + 0.4), (hx + hw + ear, top + 2.4),
        (hx + hw, top + 15.0), (hx + hw, bottom),
    ]
    c.poly(board, fill=CHARCOAL, ink=P["ink"], lw=LW_PROP)
    # The padded panel, one tone lighter and rounded: what makes the board
    # upholstery rather than a slab of slate.
    c.rrect(hx + 4.4, top + 9.0, hw - 8.8, bottom - top - 16.0, r=4.0,
            fill=tint(CHARCOAL, 0.14), ink=P["ink"], lw=LW_FACE)
    c.line([(hx + 7.0, top + 13.0), (hx + 7.0, top + 26.0)], tint(CHARCOAL, 0.40), LW_DETAIL)
    # Nail-heads: one line of brass dots just inside the edge, at a pitch
    # coarse enough that they stay dots at 55% instead of a dotted line.
    nails = []
    for k in range(7):
        y = top + 16.0 + k * 5.2
        nails.append((hx + 2.2, y))
        nails.append((hx + hw - 2.2, y))
    for k in range(4):
        t = (k + 0.5) / 4
        x = hx + 4.0 + (hw - 8.0) * t
        # The top row follows the dip of the board's top edge.
        nails.append((x, top + 6.2 + 1.2 * math.sin(math.pi * t)))
    for x, y in nails:
        c.circle(x, y, 1.05, fill=GOLD)


def bed_leatherWingback(c: Canvas) -> None:
    """
    A low, wide bed under a tall charcoal wingback headboard, brass-nailed,
    with a white duvet turned down at the head and a folded navy throw at
    the foot, all on a dark walnut base with short square feet.

    Everything but the headboard is kept low and quiet — the mattress sits
    four pixels lower than the king's — so the ears are the tallest thing in
    the sprite by a margin, and the bed reads as "tall back, winged" from
    across the room before any of the bedding does.
    """
    cx = c.w / 2
    x0, x1 = cx - 45.0, cx + 50.0
    fy = _stand(c, cx, 50.0)
    leg_h = 5.0
    hw = 24.0
    _wingback(c, x0, hw, 7.0, fy - leg_h + 1.0)
    # Walnut feet, square-cornered, rather than the round oak ones
    # `_bed_body` would draw: a walnut bed on orange feet is two objects.
    _legs(c, (x0 + 15.0, x1 - 5.0), fy - leg_h, colour=WALNUT_DK, w=5.0, r=0.6)
    mat_y = _bed_body(c, x0 + 12.0, x1, 42.0, quilt=P["white"], base=WALNUT_DK,
                      mat_h=8.0, leg_h=leg_h, quilt_from=0.36, legs=False)
    # The turn-down. `_bed_body` folds a linen sheet over a coloured quilt;
    # over a white duvet that band vanishes, so it is redrawn in the shadow
    # linen — the underside of the fold, which is what a turned-down duvet
    # actually shows.
    qx = x0 + 12.0 + (x1 - x0 - 12.0) * 0.36
    c.rrect(qx + 0.6, mat_y - 3.2, x1 - qx - 1.2, 3.8, r=1.8,
            fill=P["linenSh"], ink=P["ink"], lw=LW_FACE)
    _pillow(c, x0 + 23.0, mat_y - 4.5, 21.0, 10.0, colour=P["white"])
    _pillow(c, x0 + 40.0, mat_y - 3.5, 19.0, 9.0, colour=P["linen"])
    # The throw: a folded navy block across the foot, taller than the duvet
    # it lies on so it reads as a layer rather than a patch of colour, with
    # the folded-over flap drawn as its own lighter band.
    tx, tw = x1 - 26.0, 23.0
    ty, th = mat_y - 4.6, 17.0
    c.rrect(tx, ty, tw, th, r=2.4, fill=NAVY, ink=P["ink"], lw=LW_DETAIL)
    c.rrect(tx, ty, tw, 6.4, r=2.4, fill=tint(NAVY, 0.16), ink=P["ink"], lw=LW_FACE)
    c.line([(tx + 2.0, ty + th - 4.0), (tx + tw - 2.0, ty + th - 4.0)],
           shade(NAVY, 0.30), LW_FACE)


# ----------------------------------------------------------------- the lamp

def lighting_bankersPendant(c: Canvas) -> None:
    """
    A banker's lamp turned into a pendant: a brass rod from a small brass
    plate, ending in a wide, shallow bottle-green glass shade with a pale
    mint underside and a cream bulb pooling light beneath it.

    The shade is a dome that is far wider than it is tall, and then an
    ellipse under it: the two together make the flat oval profile, and it is
    that flatness — a lens, not a cone or a bell — that tells it apart from
    every other shade in the category at 40px.
    """
    cx = c.w / 2
    drop = 15.0
    half, dome_h = 23.0, 9.0
    rim = drop + dome_h

    # The pool of light sits high enough that its outer ring stops short of
    # the canvas edge: a halo cut off flat along the bottom reads as a shelf.
    _glow(c, cx, rim + 7.5, 19.0, colour=P["creamHi"])
    _ceiling_plate(c, cx, 10.0, colour=GOLD)
    _cord(c, cx, drop, colour=GOLD_DK)
    # The rod over the cord: a solid brass stick with an outline, which is
    # what makes it a fitting rather than a flex.
    c.rrect(cx - 1.5, 0.0, 3.0, drop + 1.0, r=1.0, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    c.line([(cx - 0.5, 3.0), (cx - 0.5, drop - 2.0)], tint(GOLD, 0.45), 0.8)

    c.pie(cx, rim, half, dome_h, 180, 360, fill=BOTTLE, ink=P["ink"], lw=LW_PROP)
    # One cel facet on the upper left, opaque: the whole shading budget.
    c.pie(cx - 9.0, rim + 0.4, 10.0, 6.4, 192, 262, fill=tint(BOTTLE, 0.34))
    # A brass collar where the rod meets the glass.
    c.ellipse(cx, drop + 0.6, 4.2, 1.8, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    # The underside, seen from a little below: the pale inside of the glass,
    # with the rim of the dome kept as a darker band above it.
    c.rect(cx - half, rim - 1.4, half * 2, 1.6, fill=shade(BOTTLE, 0.25))
    c.ellipse(cx, rim, half, 3.4, fill=P["mint"], ink=P["ink"], lw=LW_DETAIL)
    c.circle(cx, rim + 1.6, 3.2, fill=P["creamHi"], ink=P["ink"], lw=LW_FACE)
    c.circle(cx - 1.0, rim + 0.8, 1.0, fill=P["white"])


# --------------------------------------------------------------- the plaque

def _clock(c: Canvas, cx: float, cy: float, r: float, hour: float,
           minute: float) -> None:
    """
    One brass-rimmed dial with the time drawn on it.

    The rim is a filled gold disc with the white dial punched into it, so the
    ring is a solid band rather than a stroked circle that thins to nothing
    at 55%. Hands are ink and stubby — a long thin minute hand is a hairline.
    """
    c.circle(cx, cy, r, fill=GOLD, ink=P["ink"], lw=LW_PROP)
    c.circle(cx - r * 0.30, cy - r * 0.32, r * 0.24, fill=tint(GOLD, 0.45))
    c.circle(cx, cy, r - 2.6, fill=P["white"], ink=P["ink"], lw=LW_FACE)
    for q in range(4):
        ang = math.radians(q * 90)
        c.line([(cx + math.cos(ang) * (r - 4.0), cy + math.sin(ang) * (r - 4.0)),
                (cx + math.cos(ang) * (r - 5.6), cy + math.sin(ang) * (r - 5.6))],
               P["ink2"], 0.9)
    for value, length, lw in ((hour / 12.0, r * 0.42, 1.4), (minute / 60.0, r * 0.62, 1.1)):
        ang = math.radians(value * 360.0 - 90.0)
        c.line([(cx, cy), (cx + math.cos(ang) * length, cy + math.sin(ang) * length)],
               P["ink"], lw)
    c.circle(cx, cy, 1.0, fill=GOLD_DK)


def wallArt_worldClocks(c: Canvas) -> None:
    """
    An overdoor plaque in dark walnut, wider than tall, with three brass-
    rimmed clocks in a row and a cream city label under each.

    No picture: the plaque is the frame and the clocks are the content, so
    at 40px it is three gold rings on a dark bar and nothing else. The three
    hours are far apart on the dial — nine, two and six — because three
    clocks all reading ten past ten are one clock drawn three times.
    """
    cx, cy = c.w / 2, c.h / 2
    pw, ph = 88.0, 45.0
    ix, iy, iw, ih = _art_frame(c, pw, ph, WALNUT_DK, depth=3.0)
    # The moulded edge: one lighter line inside the board, and a highlight
    # sliver along its top, which is all the relief a flat plaque gets.
    c.rrect(ix, iy, iw, ih, r=1.6, ink=tint(WALNUT_DK, 0.28), lw=LW_FACE)
    c.rect(ix + 2.0, iy + 1.2, iw - 4.0, 1.2, fill=tint(WALNUT_DK, 0.36))
    pitch = 28.0
    r = 11.5
    clock_y = cy - 3.5
    for i, (hour, minute) in enumerate(((9.0, 0.0), (2.0, 0.0), (6.0, 0.0))):
        kx = cx + (i - 1) * pitch
        _clock(c, kx, clock_y, r, hour, minute)
        # The label: a cream tag with a dash of "text" — a word at this
        # size is a dash, and the dash is enough to say the tag is written on.
        ly = clock_y + r + 2.4
        c.rrect(kx - 8.0, ly, 16.0, 6.0, r=1.2, fill=P["cream"], ink=P["ink"], lw=LW_FACE)
        c.line([(kx - 5.0 + i * 0.8, ly + 3.0), (kx + 4.6 - i * 1.2, ly + 3.0)],
               P["ink2"], 1.0)


PIECES = {
    "bed_leatherWingback":      bed_leatherWingback,
    "lighting_bankersPendant":  lighting_bankersPendant,
    "wallArt_worldClocks":      wallArt_worldClocks,
}
