"""
Everything the player buys that *stands on a floor*: beds, seating, tables,
plants, the luxuries, and the working equipment of the service rooms.

Two things separate these sprites from the room art in `rooms_*.py`.

The first is the anchor. `src/render/decorArt.ts` hangs every one of these
categories from `(0.5, 1)`, so the drawing has to reach the bottom edge of its
canvas — a bed whose legs stop four pixels short floats four pixels above the
carpet, and nothing in a sprite sheet shows that. Every piece here therefore
measures down from `c.h` rather than up from a top margin, and every piece
carries a contact shadow at that line, which is what seats it on the floor.

The second is that the tier number is the design brief, not a colour swap.
ART-0 §9 asks for the expensive version of a piece to differ in *shape and
material*: `seating_stool` is three legs and a disc, `seating_throne` is a
crowned high back with gilt arms, and no amount of recolouring gets from one to
the other. Each ladder in this file therefore grows a new silhouette per tier —
a headboard becomes posts becomes a canopy — while keeping the category's
scale, its outline weights and its shadow logic identical, so a room furnished
across four tiers still looks furnished by one shop.

Sizes come from `gen_decor.SLOT_SIZE`: beds get 104x64, the floor pieces 72x72,
and the service equipment 96x72. Nothing here assumes those numbers directly —
the drawings are laid out from `c.w` and `c.h` — because the equipment slot in
particular is wider than the furniture one and the same routine has to survive
being handed either.
"""
from __future__ import annotations

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    alpha, shade, tint, math,
)


# ------------------------------------------------------------------ toolkit
#
# The marks every category shares. They exist so that a bed leg, a chair leg
# and a washing machine foot are the same drawing at three sizes — ART-0 §9
# asks pieces in one catalogue to share their shadow and scale logic, and the
# cheapest way to guarantee that is to have one routine draw them.

# One pipeline rule shapes every fill below: `Canvas` draws with alpha
# *replacing* rather than blending, so a translucent shape does not shade what
# it covers — it cuts a translucent hole through it. Highlights and shadows on
# a solid object are therefore opaque `tint()` and `shade()`, and `alpha()` is
# kept for the two places translucency is the point: a contact shadow, and real
# glass with the room showing through it.

def _stand(c: Canvas, cx: float, half_w: float, a: float = 0.15) -> float:
    """
    Seat a piece on the floor and hand back the floor line.

    The ellipse is centred a hair above the bottom edge so its lower half is
    clipped: what survives is the crescent of dark that appears where an object
    meets a floor, which is all ART-0 §8 wants from a contact shadow.
    """
    c.contact_shadow(cx, c.h - 1.2, half_w, max(2.0, half_w * 0.17), a=a)
    return c.h


def _legs(c: Canvas, xs, top: float, colour=None, w: float = 4.0,
          r: float = 1.6, foot: float = 0.0) -> None:
    """Straight legs from `top` down to the floor, one per x in `xs`."""
    colour = colour or P["woodDk"]
    for x in xs:
        c.rrect(x - w / 2, top, w, c.h - top, r=r, fill=colour,
                ink=P["ink"], lw=LW_DETAIL)
        if foot:
            # A wider pad at the bottom reads as a turned foot rather than as a
            # stick that has been sawn off, and it thickens the contact line.
            c.rrect(x - (w + foot) / 2, c.h - 2.6, w + foot, 2.6, r=1.2,
                    fill=shade(colour, 0.18), ink=P["ink"], lw=LW_FACE)


def _splay_leg(c: Canvas, x: float, top: float, lean: float, w: float = 3.4,
               colour=None) -> None:
    """A tapered leg that kicks outwards — the mid-century and cot look."""
    colour = colour or P["woodDk"]
    c.poly([(x - w / 2, top), (x + w / 2, top),
            (x + lean + w * 0.34, c.h), (x + lean - w * 0.34, c.h)],
           fill=colour, ink=P["ink"], lw=LW_DETAIL)


def _blade(c: Canvas, x: float, y: float, ang: float, length: float,
           width: float, fill, ink=True, droop: float = 0.10) -> None:
    """
    One leaf, as a pointed lens swept along `ang`.

    Pillow has no rotation for an ellipse and a rotated bitmap would soften the
    outline that every other shape in the game keeps crisp, so a leaf is built
    as a polygon: a sine-swelled width along the leaf's own axis. That also
    lets a frond curve, which a rotated ellipse could never do.
    """
    ca, sa = math.cos(ang), math.sin(ang)
    n = 8
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        half = width * math.sin(math.pi * t) ** 0.7
        # An arch, so fronds bend under their own weight instead of radiating
        # like a starburst. A fern needs far more of it than a palm.
        sag = length * droop * t * t
        px = x + ca * length * t - sa * 0.0
        py = y + sa * length * t + sag
        left.append((px - sa * half, py + ca * half))
        right.append((px + sa * half, py - ca * half))
    c.poly(left + right[::-1], fill=fill, ink=P["ink"] if ink else None, lw=LW_DETAIL)


def _pot(c: Canvas, cx: float, top: float, top_w: float, bot_w: float,
         colour=None, rim: bool = True) -> None:
    """A tapered plant pot standing on the floor, with a rim lip."""
    colour = colour or P["coral"]
    c.poly([(cx - top_w / 2, top), (cx + top_w / 2, top),
            (cx + bot_w / 2, c.h), (cx - bot_w / 2, c.h)],
           fill=colour, ink=P["ink"], lw=LW_PROP)
    if rim:
        c.rrect(cx - top_w / 2 - 1.6, top - 3.2, top_w + 3.2, 4.4, r=1.6,
                fill=tint(colour, 0.16), ink=P["ink"], lw=LW_PROP)
    # Soil, so the plant grows out of something rather than out of a colour.
    c.rrect(cx - top_w / 2 + 0.6, top - 1.8, top_w - 1.2, 2.6, r=1.0,
            fill=shade(P["woodDk"], 0.34))


def _box(c: Canvas, x: float, y: float, w: float, h: float, fill,
         r: float = 2.4, panel: bool = True) -> None:
    """
    The carcass every appliance and cabinet is built on.

    The inset panel is one flat lighter rectangle rather than a gradient: it is
    what stops a white machine from reading as a blank card, and it is the only
    modelling ART-0 §8 allows.
    """
    c.rrect(x, y, w, h, r=r, fill=fill, ink=P["ink"], lw=LW_PROP)
    if panel:
        c.rrect(x + 1.8, y + 1.8, w - 3.6, h * 0.34, r=max(1.0, r - 1.0),
                fill=tint(fill, 0.24))


def _towels(c: Canvas, x: float, y: float, w: float, n: int = 3,
            step: float = 4.4) -> None:
    """
    A stack of folded linen: the housekeeping department's whole vocabulary.

    The stack is built downwards from `y` and each towel is nearly as tall as
    its step, because a folded towel drawn two pixels thick is a pinstripe.
    """
    for k in range(n):
        c.rrect(x, y - k * step, w, step - 0.8, r=1.4,
                fill=P["linen"] if k % 2 == 0 else P["glass"],
                ink=P["ink"], lw=LW_FACE)


def _buttons(c: Canvas, x0: float, x1: float, y: float, n: int,
             colour=None) -> None:
    """Upholstery buttons — the mark that turns padding into tufting."""
    colour = colour or P["ink2"]
    for i in range(n):
        c.circle(x0 + (x1 - x0) * (i + 0.5) / n, y, 1.0, fill=colour)


def _bottles(c: Canvas, x0: float, x1: float, base: float, n: int = 4,
             h: float = 9.0) -> None:
    """A row of bottles on a shelf, the shorthand for a bar."""
    hues = (P["green"], P["coral"], P["gold"], P["glassDk"], P["lavender"])
    for i in range(n):
        bx = x0 + (x1 - x0) * (i + 0.5) / n
        col = hues[i % len(hues)]
        c.rrect(bx - 2.4, base - h, 4.8, h, r=1.8, fill=col, ink=P["ink"], lw=LW_FACE)
        # The neck: two pixels wide is the narrowest mark in the catalogue and
        # the only reason a coloured rectangle reads as a bottle at all.
        c.rrect(bx - 1.0, base - h - 3.0, 2.0, 3.4, r=0.8, fill=shade(col, 0.24))


def _screen(c: Canvas, x: float, y: float, w: float, h: float, glow=None) -> None:
    """A lit screen: dark bezel, bright face, one diagonal glint."""
    glow = glow or P["glassDk"]
    c.rrect(x, y, w, h, r=2.0, fill=P["ink2"], ink=P["ink"], lw=LW_PROP)
    c.rrect(x + 1.6, y + 1.6, w - 3.2, h - 3.2, r=1.2, fill=glow)
    c.line([(x + w * 0.18, y + h * 0.82), (x + w * 0.52, y + h * 0.18)],
           tint(glow, 0.55), LW_DETAIL)


# ------------------------------------------------------------------ the bed
#
# The most important sprite in the catalogue: it is the first thing a guest
# room gets, and `hcstyle._draw_sleeper` lies a guest on top of it. So the head
# end is always on the left, where the sleeping sprite puts its head, and the
# quilt never rises so high that a pillow drawn over it has nowhere to sit.

def _bed_body(c: Canvas, x0: float, x1: float, mat_y: float, *, quilt,
              base=None, mat_h: float = 8.0, leg_h: float = 6.0,
              leg_w: float = 5.0, quilt_from: float = 0.38,
              legs: bool = True, hem=None) -> float:
    """
    Legs, divan, mattress and a quilt turned back over a sheet.

    Returns the mattress top, because every headboard and post in this section
    has to meet it. The quilt starts a third of the way along so that the white
    of the mattress still shows at the head — a bed covered end to end in one
    colour loses the layering that makes it read as bedding rather than as a
    slab, which is exactly what the first version of this looked like.
    """
    base = base or P["woodDk"]
    fy = c.h
    mat_b = mat_y + mat_h
    leg_top = fy - leg_h

    if legs:
        for lx in (x0 + leg_w * 0.9, x1 - leg_w * 0.9):
            c.rrect(lx - leg_w / 2, leg_top - 1.0, leg_w, leg_h + 1.0, r=1.8,
                    fill=P["woodDk"], ink=P["ink"], lw=LW_DETAIL)

    c.rrect(x0 + 2.2, mat_b - 2.0, (x1 - x0) - 4.4, leg_top - mat_b + 3.0, r=2.2,
            fill=base, ink=P["ink"], lw=LW_PROP)
    c.rrect(x0, mat_y, x1 - x0, mat_h, r=2.8, fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    c.line([(x0 + 3.0, mat_y + mat_h * 0.62), (x1 - 3.0, mat_y + mat_h * 0.62)],
           P["linenSh"], LW_DETAIL)

    qx = x0 + (x1 - x0) * quilt_from
    c.rrect(qx, mat_y - 3.6, x1 - qx, mat_h + 8.2, r=3.4,
            fill=quilt, ink=P["ink"], lw=LW_PROP)
    # The sheet turned back over the top edge of the quilt, running its whole
    # length. The first version folded it down at the head end instead and read
    # as a third pillow standing on the mattress; along the top it is
    # immediately what it is, and it is white because a tinted band the same
    # hue as the quilt vanishes at 1x.
    c.rrect(qx + 0.6, mat_y - 3.2, x1 - qx - 1.2, 3.8, r=1.8,
            fill=P["linen"], ink=P["ink"], lw=LW_FACE)
    if hem:
        c.rrect(qx + 3.0, mat_b + 4.0, x1 - qx - 6.0, 1.8, r=0.9, fill=hem)
    for k in range(2):
        fx = qx + (x1 - qx) * (0.46 + k * 0.26)
        c.line([(fx, mat_y + 3.0), (fx, mat_b + 3.6)],
               shade(quilt, 0.22), LW_DETAIL)
    return mat_y


def _pillow(c: Canvas, cx: float, cy: float, w: float, h: float, colour=None) -> None:
    colour = colour or P["white"]
    c.rrect(cx - w / 2, cy - h / 2, w, h, r=h * 0.44, fill=colour,
            ink=P["ink"], lw=LW_PROP)
    c.arc(cx, cy + h * 0.10, w * 0.30, h * 0.26, 200, 340, P["linenSh"], LW_FACE)


def bed_cot(c: Canvas) -> None:
    """
    A child's cot: short, barred at both ends, and obviously not for an adult.
    The bars are the whole read, so there are only four of them and each is
    thick enough to survive the 1x downsample.
    """
    cx = c.w / 2
    x0, x1 = cx - 28.0, cx + 28.0
    _stand(c, cx, 29.0)
    # Both ends are barred and the bars run the full height of the cot: a cot
    # is a box a child cannot climb out of, and that is the entire silhouette.
    for ex in (x0, x1 - 5.0):
        c.rrect(ex, 22.0, 5.0, 32.0, r=2.2, fill=P["mintDk"], ink=P["ink"], lw=LW_PROP)
    for end in (x0 + 4.0, x1 - 19.0):
        c.rrect(end, 22.0, 15.0, 4.0, r=1.8, fill=P["mint"], ink=P["ink"], lw=LW_DETAIL)
        for i in range(3):
            c.rrect(end + 1.4 + i * 5.4, 25.0, 2.6, 22.0, r=1.2,
                    fill=P["mint"], ink=P["ink"], lw=LW_FACE)
    _bed_body(c, x0 + 3.0, x1 - 3.0, 44.0, quilt=P["creamHi"], base=P["mintDk"],
              mat_h=6.0, leg_h=5.0, leg_w=4.0, quilt_from=0.30)
    _pillow(c, x0 + 21.0, 41.0, 15.0, 8.0)


def bed_single(c: Canvas) -> None:
    """One sleeper, one pillow, a plain plank headboard. The baseline."""
    cx = c.w / 2
    x0, x1 = cx - 39.0, cx + 39.0
    _stand(c, cx, 40.0)
    # The headboard runs down behind the mattress to the divan. Stopping it at
    # the mattress line left it hanging on the wall like a picture.
    c.rrect(x0, 22.0, 11.0, 34.0, r=3.0, fill=P["wood"], ink=P["ink"], lw=LW_PROP)
    c.rrect(x0 + 2.4, 24.4, 6.2, 12.0, r=2.0, fill=tint(P["wood"], 0.26))
    _bed_body(c, x0 + 6.0, x1, 42.0, quilt=P["glass"], base=P["wood"])
    _pillow(c, x0 + 20.0, 38.0, 20.0, 9.0)


def bed_queen(c: Canvas) -> None:
    """Wider, padded, two pillows: the first bed that looks bought rather than issued."""
    cx = c.w / 2
    x0, x1 = cx - 47.0, cx + 47.0
    _stand(c, cx, 48.0)
    c.rrect(x0, 18.0, 15.0, 38.0, r=5.0, fill=P["lavender"], ink=P["ink"], lw=LW_PROP)
    c.rrect(x0 + 2.6, 21.0, 9.8, 22.0, r=3.6, fill=tint(P["lavender"], 0.22),
            ink=P["ink"], lw=LW_FACE)
    _bed_body(c, x0 + 9.0, x1, 40.0, quilt=P["wallLilac"], base=P["woodDk"], mat_h=9.0)
    _pillow(c, x0 + 24.0, 35.0, 21.0, 10.0)
    _pillow(c, x0 + 42.0, 36.0, 19.0, 9.0, colour=P["linen"])


def bed_king(c: Canvas) -> None:
    """
    A tall buttoned headboard and a folded runner across the foot — the two
    marks a hotel uses to say "this room costs more" without changing the room.
    """
    cx = c.w / 2
    x0, x1 = cx - 50.0, cx + 50.0
    _stand(c, cx, 51.0)
    # A tall padded headboard with a stitched border and buttons in a grid.
    # Three buttons in a column read as the controls of a machine; a grid
    # reads as upholstery, which is the whole difference here.
    c.rrect(x0, 12.0, 20.0, 44.0, r=6.0, fill=P["cream"], ink=P["ink"], lw=LW_PROP)
    c.rrect(x0 + 2.6, 15.0, 14.8, 30.0, r=4.4, fill=P["creamHi"], ink=P["ink"], lw=LW_FACE)
    for row in range(2):
        _buttons(c, x0 + 3.6, x0 + 16.4, 23.0 + row * 10.0, 3)
    _bed_body(c, x0 + 11.0, x1, 38.0, quilt=P["roomBlue"], base=P["woodDk"],
              mat_h=9.0, leg_h=7.0, quilt_from=0.34)
    c.rrect(x1 - 26.0, 36.4, 24.0, 15.0, r=2.6, fill=P["cream"], ink=P["ink"], lw=LW_DETAIL)
    _pillow(c, x0 + 27.0, 33.0, 23.0, 11.0)
    _pillow(c, x0 + 47.0, 34.0, 21.0, 10.0, colour=P["linen"])


def bed_canopy(c: Canvas) -> None:
    """
    Four posts and a fabric roof. The canopy is drawn first and full-width so
    the piece reads as one object from across the room; the two drapes are only
    at the ends, because a curtain in the middle would hide the bed the player
    just paid for.
    """
    cx = c.w / 2
    x0, x1 = cx - 48.0, cx + 48.0
    _stand(c, cx, 49.0)
    for px in (x0 + 3.0, x1 - 3.0):
        c.rrect(px - 2.4, 9.0, 4.8, 44.0, r=2.0, fill=P["white"], ink=P["ink"], lw=LW_PROP)
    c.rrect(x0 - 1.0, 4.0, (x1 - x0) + 2.0, 8.0, r=3.0,
            fill=P["wallRose"], ink=P["ink"], lw=LW_PROP)
    # A scalloped valance: five pies hanging off the canopy's lower edge.
    for i in range(5):
        vx = x0 + (x1 - x0) * (i + 0.5) / 5
        c.pie(vx, 11.0, (x1 - x0) / 10.0, 4.0, 0, 180,
              fill=P["wallRose"], ink=P["ink"], lw=LW_FACE)
    for px, side in ((x0 + 4.0, 1), (x1 - 4.0, -1)):
        c.rrect(px - 4.0 * (1 - side) / 2 - 3.0 * (1 + side) / 2, 12.0, 7.0, 30.0,
                r=3.0, fill=shade(P["wallRose"], 0.10), ink=P["ink"], lw=LW_DETAIL)
    _bed_body(c, x0 + 6.0, x1 - 6.0, 40.0, quilt=P["wallRose"], base=P["creamHi"],
              mat_h=8.0, leg_h=5.0, quilt_from=0.36)
    _pillow(c, x0 + 24.0, 35.0, 20.0, 10.0)
    _pillow(c, x0 + 41.0, 36.0, 18.0, 9.0, colour=P["linen"])


def bed_floating(c: Canvas) -> None:
    """
    A platform bed with a recessed plinth and a light strip under it.
    The trick is entirely in the negative space: the plinth is a third of the
    bed's width, so the mattress reads as hovering, and the cyan band is the
    only glow in the catalogue.
    """
    cx = c.w / 2
    x0, x1 = cx - 50.0, cx + 50.0
    _stand(c, cx, 44.0, a=0.10)
    c.rrect(x0 + 22.0, c.h - 9.0, (x1 - x0) - 44.0, 9.0, r=2.0,
            fill=P["ink2"], ink=P["ink"], lw=LW_PROP)
    c.rrect(x0 + 24.0, c.h - 7.4, (x1 - x0) - 48.0, 2.2, r=1.1, fill=P["water"])
    c.ellipse(cx, c.h - 4.5, 40.0, 4.0, fill=alpha(P["water"], 0.22))
    # A low slab headboard: modern furniture states its material and stops.
    c.rrect(x0, 24.0, 13.0, 28.0, r=2.4, fill=P["metalDk"], ink=P["ink"], lw=LW_PROP)
    c.rect(x0 + 3.0, 27.0, 7.0, 1.4, fill=tint(P["metalDk"], 0.55))
    # A slate quilt, not a white one: with a white mattress under it and a
    # white sheet folded over it, a pale quilt turned the whole bed into one
    # undifferentiated block.
    _bed_body(c, x0 + 8.0, x1, 40.0, quilt=P["glassDk"], base=P["metalDk"],
              mat_h=9.0, legs=False, quilt_from=0.36, hem=P["water"])
    _pillow(c, x0 + 24.0, 35.0, 21.0, 10.0)
    _pillow(c, x0 + 42.0, 36.5, 18.0, 9.0, colour=P["glass"])


def bed_fourposter(c: Canvas) -> None:
    """
    Turned posts to the ceiling with ball finials and a crossbeam, but no
    fabric — which is what tells it apart from the canopy one tier below.
    """
    cx = c.w / 2
    x0, x1 = cx - 48.0, cx + 48.0
    _stand(c, cx, 49.0)
    c.rrect(x0 + 5.0, 8.0, (x1 - x0) - 10.0, 4.6, r=2.2,
            fill=P["woodDk"], ink=P["ink"], lw=LW_PROP)
    for px in (x0 + 5.0, x1 - 5.0):
        c.rrect(px - 3.0, 8.0, 6.0, 46.0, r=2.4, fill=P["wood"], ink=P["ink"], lw=LW_PROP)
        # Two turned rings and a finial: the whole of "carved" at this scale.
        for ry in (20.0, 34.0):
            c.rrect(px - 4.2, ry, 8.4, 2.8, r=1.3, fill=P["woodDk"], ink=P["ink"], lw=LW_FACE)
        c.circle(px, 5.6, 3.4, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    _bed_body(c, x0 + 8.0, x1 - 8.0, 39.0, quilt=P["carpet"], base=P["woodDk"],
              mat_h=9.0, leg_h=6.0, quilt_from=0.36, hem=P["gold"])
    _pillow(c, x0 + 25.0, 34.0, 22.0, 10.0)
    _pillow(c, x0 + 43.0, 35.0, 19.0, 9.0, colour=P["creamHi"])


def bed_emperorbed(c: Canvas) -> None:
    """
    The top of the ladder, and deliberately too much: an arched tufted
    headboard taller than the bed is long, gilt posts, a gold-hemmed quilt and
    three pillows. Every other bed reads at a glance; this one is allowed to
    take a second look, because that second look is what the player bought.
    """
    cx = c.w / 2
    x0, x1 = cx - 50.0, cx + 50.0
    _stand(c, cx, 51.0)
    # Headboard: a rounded arch, drawn as a pie capping a rectangle so the
    # crown is a true half-round rather than a rounded corner pretending.
    # It is wide and the gold trim is one continuous inner line — an early
    # version paired two finials across a narrow arch and the whole headboard
    # read as a face looking back at the player.
    hb_x, hb_w = x0, 32.0
    c.pie(hb_x + hb_w / 2, 16.0, hb_w / 2, 10.0, 180, 360,
          fill=P["carpet"], ink=P["ink"], lw=LW_PROP)
    c.rrect(hb_x, 15.0, hb_w, 39.0, r=3.0, fill=P["carpet"], ink=P["ink"], lw=LW_PROP)
    c.rrect(hb_x + 3.4, 11.6, hb_w - 6.8, 34.0, r=8.0,
            fill=tint(P["carpet"], 0.14), ink=P["gold"], lw=LW_DETAIL)
    for row in range(3):
        _buttons(c, hb_x + 6.0, hb_x + hb_w - 6.0, 20.0 + row * 8.0, 3, colour=P["goldDk"])
    c.circle(hb_x + hb_w / 2, 5.4, 3.4, fill=P["gold"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(x1 - 4.6, 22.0, 4.4, 32.0, r=2.0, fill=P["gold"], ink=P["ink"], lw=LW_DETAIL)
    c.circle(x1 - 2.4, 19.0, 3.2, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    _bed_body(c, hb_x + 5.0, x1, 36.0, quilt=P["creamHi"], base=P["goldDk"],
              mat_h=10.0, leg_h=7.0, leg_w=6.0, quilt_from=0.34,
              hem=P["gold"])
    c.rrect(x1 - 30.0, 34.0, 28.0, 17.0, r=2.8, fill=P["carpet"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(x1 - 27.0, 40.0, 22.0, 1.6, r=0.8, fill=P["gold"])
    _pillow(c, hb_x + 24.0, 31.0, 24.0, 12.0)
    _pillow(c, hb_x + 45.0, 32.0, 21.0, 11.0, colour=P["cream"])


# -------------------------------------------------------------------- seating
#
# All seven sit on the same 72x72 tile and share a seat height near y=48, so a
# room that mixes a stool and a loveseat still has one line of sitting.

def seating_stool(c: Canvas) -> None:
    """Three splayed legs and a disc. Nothing else is a stool."""
    cx = c.w / 2
    _stand(c, cx, 15.0)
    for x, lean in ((cx - 10.0, -3.5), (cx, 0.0), (cx + 10.0, 3.5)):
        _splay_leg(c, x, 50.0, lean, w=4.2)
    c.line([(cx - 12.0, 61.0), (cx + 12.0, 61.0)], P["woodDk"], 1.8)
    c.rrect(cx - 14.0, 44.0, 28.0, 7.0, r=3.4, fill=P["wood"], ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx, 45.4, 11.0, 1.8, fill=tint(P["wood"], 0.30))


def seating_armchair(c: Canvas) -> None:
    """A single tub chair: back, two arms, one cushion, four short legs."""
    cx = c.w / 2
    _stand(c, cx, 22.0)
    body = P["roomBlue"]
    _legs(c, (cx - 15.0, cx + 15.0), 62.0, w=4.2)
    c.rrect(cx - 18.0, 28.0, 36.0, 30.0, r=8.0, fill=body, ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 13.0, 31.0, 26.0, 17.0, r=6.0, fill=tint(body, 0.20),
            ink=P["ink"], lw=LW_FACE)
    for side in (-1, 1):
        c.rrect(cx + side * 20.0 - 5.0, 40.0, 10.0, 20.0, r=4.6,
                fill=shade(body, 0.14), ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 17.0, 46.0, 34.0, 9.0, r=3.4, fill=P["creamHi"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 18.0, 54.0, 36.0, 8.0, r=2.4, fill=shade(body, 0.22),
            ink=P["ink"], lw=LW_PROP)


def seating_loveseat(c: Canvas) -> None:
    """Two seats: the back is split by a single seam, which is the whole read."""
    cx = c.w / 2
    _stand(c, cx, 29.0)
    body = P["mintDk"]
    _legs(c, (cx - 22.0, cx + 22.0), 62.0, w=4.2)
    c.rrect(cx - 27.0, 30.0, 54.0, 28.0, r=7.0, fill=body, ink=P["ink"], lw=LW_PROP)
    for side in (-1, 1):
        c.rrect(cx + side * 13.0 - 11.0, 33.0, 22.0, 15.0, r=5.0,
                fill=tint(body, 0.22), ink=P["ink"], lw=LW_FACE)
    for side in (-1, 1):
        c.rrect(cx + side * 29.0 - 5.0, 40.0, 10.0, 20.0, r=4.6,
                fill=shade(body, 0.16), ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 26.0, 46.0, 52.0, 9.0, r=3.4, fill=P["mint"], ink=P["ink"], lw=LW_PROP)
    c.line([(cx, 47.0), (cx, 54.0)], shade(P["mint"], 0.30), LW_DETAIL)
    c.rrect(cx - 27.0, 54.0, 54.0, 8.0, r=2.4, fill=shade(body, 0.22),
            ink=P["ink"], lw=LW_PROP)


def seating_chaise(c: Canvas) -> None:
    """
    A day bed: one raised end, a long flat seat, a bolster. The asymmetry is
    the point — it is the first seat in the ladder you can lie on.
    """
    cx = c.w / 2
    _stand(c, cx, 31.0)
    body = P["glassDk"]
    _legs(c, (cx - 24.0, cx + 22.0), 60.0, w=4.0)
    # The back is a pad *plus* a wedge running down to the seat. A plain
    # upright block at one end read as a headboard, and the piece looked like a
    # bed that had lost its mattress.
    c.rrect(cx - 32.0, 32.0, 15.0, 24.0, r=6.0, fill=body, ink=P["ink"], lw=LW_PROP)
    c.poly([(cx - 19.0, 34.0), (cx - 19.0, 50.0), (cx - 4.0, 50.0)],
           fill=body, ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 30.0, 46.0, 60.0, 12.0, r=4.0, fill=body, ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 26.0, 47.4, 52.0, 8.0, r=3.2, fill=tint(body, 0.30),
            ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 30.0, 57.0, 60.0, 5.0, r=2.0, fill=shade(body, 0.24),
            ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 28.0, 38.0, 16.0, 9.0, r=4.4, fill=P["coral"], ink=P["ink"], lw=LW_PROP)


def seating_throne(c: Canvas) -> None:
    """
    A crowned high back, gilt arms on turned posts, crimson velvet. The back
    reaches nearly to the top of the tile: height *is* the status signal, and
    the three points of the crown say it before any colour does.
    """
    cx = c.w / 2
    _stand(c, cx, 22.0)
    c.rrect(cx - 17.0, 14.0, 34.0, 46.0, r=4.0, fill=P["goldDk"], ink=P["ink"], lw=LW_PROP)
    for i, dx in enumerate((-11.0, 0.0, 11.0)):
        h = 9.0 if i == 1 else 6.5
        c.poly([(cx + dx - 5.0, 15.0), (cx + dx, 15.0 - h), (cx + dx + 5.0, 15.0)],
               fill=P["gold"], ink=P["ink"], lw=LW_DETAIL)
        c.circle(cx + dx, 15.0 - h - 1.2, 1.6, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 13.0, 19.0, 26.0, 30.0, r=4.0, fill=P["carpet"], ink=P["ink"], lw=LW_DETAIL)
    for row in range(3):
        _buttons(c, cx - 11.0, cx + 11.0, 24.0 + row * 8.0, 2)
    for side in (-1, 1):
        c.rrect(cx + side * 19.0 - 3.0, 36.0, 6.0, 24.0, r=2.4,
                fill=P["gold"], ink=P["ink"], lw=LW_DETAIL)
        c.circle(cx + side * 19.0, 35.0, 3.0, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 20.0, 48.0, 40.0, 10.0, r=3.0, fill=P["carpet"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 20.0, 56.0, 40.0, 7.0, r=2.4, fill=P["goldDk"], ink=P["ink"], lw=LW_PROP)
    _legs(c, (cx - 15.0, cx + 15.0), 62.0, colour=P["gold"], w=5.0, foot=2.4)


def seating_velvetchaise(c: Canvas) -> None:
    """
    The chaise again, upholstered: a scrolled end, deep tufting, gilt cabriole
    legs. Same footprint as tier 4 so a room can swap one for the other, but
    every surface has been re-made — which is the ART-0 §9 rule for a precious
    version, as against a recoloured one.
    """
    cx = c.w / 2
    _stand(c, cx, 32.0)
    body = P["lavender"]
    for x, lean in ((cx - 26.0, -3.4), (cx + 24.0, 3.4)):
        _splay_leg(c, x, 58.0, lean, w=4.2, colour=P["gold"])
    # A low tufted back along the long side, then the scroll end over it. With
    # the seat alone the piece read as a sun lounger; the back is what makes it
    # a chaise longue rather than something poolside.
    c.rrect(cx - 30.0, 32.0, 38.0, 16.0, r=6.0, fill=shade(body, 0.14),
            ink=P["ink"], lw=LW_PROP)
    _buttons(c, cx - 26.0, cx + 4.0, 38.0, 4, colour=P["goldDk"])
    # The scroll end: a full round on top of the arm, the shape a plain
    # rectangle can never fake.
    c.circle(cx - 23.0, 36.0, 9.0, fill=body, ink=P["ink"], lw=LW_PROP)
    c.circle(cx - 23.0, 36.0, 4.0, fill=tint(body, 0.28), ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 32.0, 36.0, 18.0, 22.0, r=5.0, fill=body, ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 32.0, 43.0, 64.0, 16.0, r=5.0, fill=body, ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 26.0, 45.0, 56.0, 10.0, r=4.0, fill=tint(body, 0.22),
            ink=P["ink"], lw=LW_FACE)
    # One row of buttons, not two: two rows on a seat this deep read as spots
    # on the fabric rather than as tufting pulling it in.
    _buttons(c, cx - 22.0, cx + 26.0, 50.0, 5, colour=P["goldDk"])
    c.rrect(cx - 32.0, 57.0, 64.0, 3.2, r=1.5, fill=P["gold"])
    c.rrect(cx - 16.0, 36.0, 16.0, 9.0, r=4.4, fill=P["creamHi"], ink=P["ink"], lw=LW_PROP)


def seating_salonset(c: Canvas) -> None:
    """
    Not one seat but a set: a settee with a matching footstool beside it. The
    top of the ladder buys *furniture in company*, which is a silhouette no
    single chair can have, and it is why this tile is the busiest one here.
    """
    cx = c.w / 2
    _stand(c, cx - 9.0, 26.0)
    _stand(c, cx + 24.0, 11.0)
    body = P["wallSand"]
    _legs(c, (cx - 30.0, cx - 4.0), 58.0, colour=P["gold"], w=3.6)
    # A settee built like the loveseat two tiers down — back, arms, one long
    # seat — so the pair reads as a *set*. Two round back cushions were tried
    # first and the settee stared back at the player.
    c.rrect(cx - 34.0, 26.0, 38.0, 26.0, r=7.0, fill=body, ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 30.0, 29.0, 30.0, 13.0, r=5.0, fill=tint(body, 0.26),
            ink=P["ink"], lw=LW_FACE)
    _buttons(c, cx - 28.0, cx - 2.0, 35.0, 3, colour=P["goldDk"])
    for side in (-1, 1):
        c.rrect(cx - 15.0 + side * 19.0 - 4.5, 36.0, 9.0, 20.0, r=4.2,
                fill=shade(body, 0.16), ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 32.0, 44.0, 34.0, 9.0, r=3.0, fill=P["creamHi"], ink=P["ink"], lw=LW_PROP)
    c.line([(cx - 15.0, 45.5), (cx - 15.0, 51.5)], shade(P["creamHi"], 0.26), LW_DETAIL)
    c.rrect(cx - 34.0, 51.0, 38.0, 7.0, r=2.4, fill=shade(body, 0.22),
            ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 29.0, 37.0, 10.0, 9.0, r=3.0, fill=P["coral"], ink=P["ink"], lw=LW_DETAIL)
    # The stool, lower and rounder, so the pair reads as two objects.
    _legs(c, (cx + 15.0, cx + 33.0), 60.0, colour=P["gold"], w=3.6)
    c.rrect(cx + 11.0, 47.0, 26.0, 11.0, r=5.0, fill=body, ink=P["ink"], lw=LW_PROP)
    c.rrect(cx + 14.0, 48.6, 20.0, 5.0, r=2.4, fill=tint(body, 0.24))


# ---------------------------------------------------------------------- table
#
# Tables share a top height near y=40 with a clear underside, so a chair from
# the seating ladder can be parked at one without the two silhouettes fighting.

def table_sideTable(c: Canvas) -> None:
    """A round top on one pedestal with a cross foot: the smallest useful table."""
    cx = c.w / 2
    _stand(c, cx, 14.0)
    c.rrect(cx - 3.6, 44.0, 7.2, 22.0, r=2.6, fill=P["woodDk"], ink=P["ink"], lw=LW_PROP)
    # A disc foot rather than a bar: a straight cross piece under a straight
    # column read as an I-beam, which is not a mood any hotel room wants.
    c.ellipse(cx, 66.0, 13.0, 4.0, fill=P["woodDk"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 17.0, 39.0, 34.0, 7.0, r=3.4, fill=P["wood"], ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx, 40.8, 13.0, 1.8, fill=tint(P["wood"], 0.30))


def table_deskWood(c: Canvas) -> None:
    """A working desk: a drawer stack on one side, a knee hole on the other."""
    cx = c.w / 2
    _stand(c, cx, 28.0)
    _legs(c, (cx - 24.0,), 44.0, w=5.0)
    c.rrect(cx + 4.0, 42.0, 22.0, 26.0, r=2.4, fill=P["wood"], ink=P["ink"], lw=LW_PROP)
    for k in range(3):
        c.rrect(cx + 6.0, 44.4 + k * 7.6, 18.0, 6.4, r=1.4,
                fill=tint(P["wood"], 0.16), ink=P["ink"], lw=LW_FACE)
        c.rect(cx + 13.0, 47.0 + k * 7.6, 4.0, 1.2, fill=P["ink2"])
    c.rrect(cx - 28.0, 36.0, 56.0, 6.4, r=2.4, fill=P["woodDk"], ink=P["ink"], lw=LW_PROP)
    c.rect(cx - 25.0, 37.4, 50.0, 1.6, fill=tint(P["woodDk"], 0.32))
    # A closed book and a pen cup: two marks, so the desk is a desk in use.
    c.rrect(cx - 22.0, 31.0, 13.0, 5.0, r=1.2, fill=P["coral"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 5.0, 29.0, 7.0, 7.0, r=1.6, fill=P["metal"], ink=P["ink"], lw=LW_FACE)
    for dx, col in ((-2.4, P["coral"]), (0.0, P["roomBlue"]), (2.0, P["green"])):
        c.line([(cx - 1.5 + dx, 29.0), (cx - 1.0 + dx, 25.0)], col, LW_DETAIL)


def table_glassTable(c: Canvas) -> None:
    """
    Glass and chrome. The top is translucent, so the lower shelf shows through
    it — the one place in this file where an alpha fill is doing real work.
    """
    cx = c.w / 2
    _stand(c, cx, 22.0)
    for side in (-1, 1):
        c.rrect(cx + side * 20.0 - 2.0, 43.6, 4.0, 24.4, r=1.6,
                fill=P["metal"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - 22.0, 65.0, 44.0, 4.0, r=1.8, fill=P["metalDk"], ink=P["ink"], lw=LW_DETAIL)
    # Both slabs are genuinely translucent, which this pipeline gives by cutting
    # a translucent hole — exactly what a glass table should do to the room
    # behind it, and the reason the legs stop clear of them.
    c.rrect(cx - 17.5, 54.0, 35.0, 4.0, r=1.6, fill=alpha(P["glass"], 0.75),
            ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 24.0, 38.0, 48.0, 5.6, r=2.4, fill=alpha(P["glass"], 0.72),
            ink=P["ink"], lw=LW_PROP)
    c.line([(cx - 16.0, 42.0), (cx - 8.0, 39.4)], alpha(P["white"], 0.8), LW_DETAIL)


def table_marbleTable(c: Canvas) -> None:
    """A thick marble slab on two blocks. Weight is the whole idea."""
    cx = c.w / 2
    _stand(c, cx, 26.0)
    for side in (-1, 1):
        c.rrect(cx + side * 17.0 - 6.0, 44.0, 12.0, 24.0, r=2.0,
                fill=P["linenSh"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 26.0, 36.0, 52.0, 8.0, r=2.6, fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    # Two veins, and only two: marble is told by a couple of confident strokes.
    # They deliberately do not meet — a pair that met in the middle drew a
    # chevron, and the slab read as an arrow rather than as stone.
    c.line([(cx - 20.0, 41.4), (cx - 6.0, 38.6)], shade(P["linen"], 0.28), LW_DETAIL)
    c.line([(cx + 4.0, 41.8), (cx + 19.0, 39.6)], shade(P["linen"], 0.20), LW_FACE)
    c.rrect(cx - 26.0, 43.0, 52.0, 2.0, r=1.0, fill=shade(P["linen"], 0.14))


def table_crystalTable(c: Canvas) -> None:
    """
    A faceted crystal base under a glass top. The facets are three flat
    polygons meeting on a centre line — a gradient would say "glass" to a
    renderer and "mud" to a phone.
    """
    cx = c.w / 2
    _stand(c, cx, 20.0, a=0.12)
    top_y = 38.0
    # Three facets: a light face, a dark face and the outlined silhouette over
    # both. Drawing the divider as a line put a round cap at each end of it,
    # and two dark dots on a pale base looked like damage.
    c.poly([(cx - 15.0, 69.0), (cx, 69.0), (cx, 44.0), (cx - 8.0, 44.0)],
           fill=tint(P["glass"], 0.40))
    c.poly([(cx, 69.0), (cx + 15.0, 69.0), (cx + 8.0, 44.0), (cx, 44.0)],
           fill=P["glassDk"])
    c.poly([(cx - 15.0, 69.0), (cx + 15.0, 69.0), (cx + 8.0, 44.0), (cx - 8.0, 44.0)],
           ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 26.0, top_y, 52.0, 6.0, r=2.6, fill=alpha(P["glass"], 0.78),
            ink=P["ink"], lw=LW_PROP)
    for sx, sy, r in ((cx - 19.0, 33.0, 2.2), (cx + 16.0, 31.0, 1.6)):
        c.line([(sx - r, sy), (sx + r, sy)], P["white"], LW_DETAIL)
        c.line([(sx, sy - r), (sx, sy + r)], P["white"], LW_DETAIL)


def table_marbleconsole(c: Canvas) -> None:
    """
    A hall console: marble top, gilded frieze, fluted legs, and an urn on it.
    Taller and narrower than the tables below it, because a console is the one
    table you stand at rather than sit at.
    """
    cx = c.w / 2
    _stand(c, cx, 24.0)
    for side in (-1, 1):
        lx = cx + side * 19.0
        c.rrect(lx - 3.0, 40.0, 6.0, 28.0, r=1.4, fill=P["gold"], ink=P["ink"], lw=LW_DETAIL)
        for k in range(2):
            c.line([(lx - 1.4 + k * 2.8, 43.0), (lx - 1.4 + k * 2.8, 64.0)],
                   P["goldDk"], LW_FACE)
        c.rrect(lx - 4.4, 66.0, 8.8, 3.0, r=1.2, fill=P["goldDk"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 22.0, 36.0, 44.0, 5.0, r=1.4, fill=P["gold"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - 24.0, 31.0, 48.0, 6.0, r=2.4, fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    c.line([(cx - 16.0, 35.2), (cx - 4.0, 32.8)], shade(P["linen"], 0.28), LW_FACE)
    c.line([(cx + 4.0, 35.4), (cx + 15.0, 33.4)], shade(P["linen"], 0.20), LW_FACE)
    c.ellipse(cx, 25.0, 6.4, 7.0, fill=P["carpet"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 2.6, 16.0, 5.2, 6.0, r=1.4, fill=P["carpet"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - 4.6, 14.0, 9.2, 3.0, r=1.2, fill=P["goldDk"], ink=P["ink"], lw=LW_FACE)


def table_writingdesk(c: Canvas) -> None:
    """
    An escritoire: pigeonholes over the writing surface, drawers under it, and
    a sheet of paper waiting. The hutch is what makes it the top of the table
    ladder — it is the only one of the seven with furniture *on* the furniture.
    """
    cx = c.w / 2
    _stand(c, cx, 27.0)
    for side in (-1, 1):
        lx = cx + side * 22.0
        c.rrect(lx - 3.0, 46.0, 6.0, 22.0, r=1.6, fill=P["woodDk"], ink=P["ink"], lw=LW_DETAIL)
        c.rrect(lx - 4.6, 66.4, 9.2, 2.8, r=1.2, fill=P["wood"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 24.0, 46.0, 48.0, 10.0, r=1.8, fill=P["wood"], ink=P["ink"], lw=LW_PROP)
    for side in (-1, 1):
        c.rrect(cx + side * 11.5 - 9.0, 48.0, 18.0, 6.0, r=1.2,
                fill=tint(P["wood"], 0.18), ink=P["ink"], lw=LW_FACE)
        c.rect(cx + side * 11.5 - 2.0, 50.6, 4.0, 1.2, fill=P["ink2"])
    c.rrect(cx - 26.0, 40.0, 52.0, 6.0, r=2.2, fill=P["woodDk"], ink=P["ink"], lw=LW_PROP)
    # The hutch: six pigeonholes, big enough that each stays a hole at 1x.
    c.rrect(cx - 22.0, 20.0, 44.0, 20.0, r=2.0, fill=P["wood"], ink=P["ink"], lw=LW_PROP)
    for i in range(3):
        for k in range(2):
            c.rrect(cx - 19.0 + i * 13.0, 22.4 + k * 8.0, 11.0, 6.4, r=1.0,
                    fill=shade(P["wood"], 0.30))
    c.rrect(cx - 24.0, 17.0, 48.0, 4.0, r=1.6, fill=P["woodDk"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - 8.0, 34.0, 12.0, 6.0, r=1.0, fill=P["white"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx + 8.0, 33.0, 6.0, 7.0, r=1.4, fill=P["ink2"], ink=P["ink"], lw=LW_FACE)


# ---------------------------------------------------------------------- plant
#
# Green is the accent that appears in every room type, so these seven have to
# differ by *plant*, not by pot: a rosette, an arch, a fan, a cloud, a spray.

def plant_succulent(c: Canvas) -> None:
    """A fat rosette in a little cup. The smallest thing in the catalogue."""
    cx = c.w / 2
    _stand(c, cx, 11.0)
    _pot(c, cx, 56.0, 18.0, 14.0, colour=P["creamHi"])
    for ang, ln in ((-2.75, 11.0), (-2.35, 13.0), (-1.9, 15.0),
                    (-1.25, 15.0), (-0.8, 13.0), (-0.4, 11.0)):
        _blade(c, cx, 55.0, ang, ln, 4.0, P["green"])
    c.circle(cx, 44.0, 4.2, fill=P["leaf"], ink=P["ink"], lw=LW_DETAIL)


def plant_fern(c: Canvas) -> None:
    """Arching fronds from a low pot — a shape, not a bush."""
    cx = c.w / 2
    _stand(c, cx, 13.0)
    _pot(c, cx, 54.0, 22.0, 17.0, colour=P["glassDk"])
    # Narrow blades and a lot of them. The first pass used six fat ones and the
    # plant read as an agave: a fern is told by the *number* of fronds.
    for ang, ln in ((-3.05, 20.0), (-2.72, 25.0), (-2.38, 28.0), (-1.98, 29.0),
                    (-1.58, 28.0), (-1.18, 26.0), (-0.78, 22.0), (-0.30, 18.0)):
        _blade(c, cx, 53.0, ang, ln, 2.2, P["leaf"], droop=0.40)
    for ang, ln in ((-2.55, 16.0), (-1.95, 18.0), (-1.30, 16.0)):
        _blade(c, cx, 53.0, ang, ln, 2.2, P["green"], droop=0.30)


def plant_palm(c: Canvas) -> None:
    """
    A trunk and five big fronds. The trunk is what makes it a palm rather than
    a large fern, so it is drawn thick and with two collar rings.
    """
    cx = c.w / 2
    _stand(c, cx, 14.0)
    _pot(c, cx, 56.0, 22.0, 18.0, colour=P["wood"])
    c.rrect(cx - 2.6, 24.0, 5.2, 30.0, r=2.0, fill=P["woodDk"], ink=P["ink"], lw=LW_DETAIL)
    for ry in (34.0, 44.0):
        c.rrect(cx - 3.6, ry, 7.2, 2.4, r=1.0, fill=shade(P["woodDk"], 0.24))
    for ang, ln in ((-3.05, 22.0), (-2.45, 24.0), (-1.57, 22.0),
                    (-0.70, 24.0), (-0.10, 22.0)):
        _blade(c, cx, 25.0, ang, ln, 5.4, P["leaf"])
    c.circle(cx, 24.0, 3.0, fill=P["green"], ink=P["ink"], lw=LW_FACE)


def plant_bonsai(c: Canvas) -> None:
    """
    A shallow tray, a trunk with a bend in it, and two canopy pads. The bend is
    the whole species: a straight trunk with a blob on top is a lollipop.
    """
    cx = c.w / 2
    _stand(c, cx, 17.0)
    c.rrect(cx - 17.0, 58.0, 34.0, 8.0, r=2.0, fill=P["carpet"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 13.0, 65.0, 26.0, 4.0, r=1.4, fill=shade(P["carpet"], 0.24),
            ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 14.0, 56.8, 28.0, 2.6, r=1.2, fill=shade(P["woodDk"], 0.3))
    c.line([(cx + 5.0, 57.0), (cx - 4.0, 47.0), (cx + 6.0, 37.0)], P["ink"], 5.4)
    c.line([(cx + 5.0, 57.0), (cx - 4.0, 47.0), (cx + 6.0, 37.0)], P["woodDk"], 3.4)
    c.line([(cx - 3.0, 48.0), (cx - 12.0, 43.0)], P["ink"], 4.0)
    c.line([(cx - 3.0, 48.0), (cx - 12.0, 43.0)], P["woodDk"], 2.2)
    # Three pads at three heights. Two symmetrical ones sat like ears; the
    # off-centre third is what makes the tree look pruned rather than pruned in
    # half.
    c.ellipse(cx + 9.0, 32.0, 12.0, 6.0, fill=P["green"], ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx - 14.0, 40.0, 9.0, 5.0, fill=P["leaf"], ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx - 1.0, 38.0, 7.5, 4.2, fill=P["leaf"], ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx + 11.0, 30.6, 6.0, 2.4, fill=tint(P["leaf"], 0.22))


def plant_orchidWall(c: Canvas) -> None:
    """
    Orchids in a tall ceramic: two arching stems of blooms over broad basal
    leaves. Flowers are three petals and a heart — any more and each one is
    smaller than the two-pixel floor.
    """
    cx = c.w / 2
    _stand(c, cx, 13.0)
    c.rrect(cx - 11.0, 48.0, 22.0, 21.0, r=3.0, fill=P["glass"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 8.0, 50.0, 16.0, 5.0, r=2.0, fill=tint(P["glass"], 0.45))
    c.rrect(cx - 9.0, 46.4, 18.0, 2.6, r=1.2, fill=shade(P["woodDk"], 0.3))
    for side, ln in ((-1, 13.0), (1, 14.0)):
        _blade(c, cx, 48.0, -1.57 + side * 1.15, ln, 4.4, P["green"])
    # The stems carry the flowers, so they are drawn at furniture weight: a
    # hairline stem left the blooms hanging in the air.
    for sx, tip in ((cx - 1.0, (cx - 12.0, 22.0)), (cx + 2.0, (cx + 13.0, 27.0))):
        c.line([(sx, 48.0), (sx + (tip[0] - sx) * 0.4, 34.0), tip], P["greenDk"], 1.8)
    for bx, by, r in ((cx - 12.0, 22.0, 4.4), (cx - 8.0, 30.0, 3.6),
                      (cx + 13.0, 27.0, 4.2), (cx + 9.0, 35.0, 3.4)):
        for a in (-2.6, -1.57, -0.5):
            c.circle(bx + math.cos(a) * r * 0.7, by + math.sin(a) * r * 0.7, r * 0.55,
                     fill=P["wallRose"], ink=P["ink"], lw=LW_FACE)
        c.circle(bx, by, r * 0.34, fill=P["gold"])


def plant_indoorolivetree(c: Canvas) -> None:
    """
    A tree in a terracotta urn: a slender trunk, a cloud of small leaves, and
    three olives. It is the tallest plant here, so it fills the tile top to
    bottom and earns its tier by scale as well as by shape.
    """
    cx = c.w / 2
    _stand(c, cx, 15.0)
    c.rrect(cx - 12.0, 50.0, 24.0, 19.0, r=4.0, fill=P["coral"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 14.0, 47.0, 28.0, 5.0, r=2.0, fill=tint(P["coral"], 0.18),
            ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 10.0, 55.0, 20.0, 3.0, r=1.4, fill=tint(P["coral"], 0.42))
    c.line([(cx, 50.0), (cx - 2.0, 36.0), (cx + 1.0, 26.0)], P["ink"], 5.2)
    c.line([(cx, 50.0), (cx - 2.0, 36.0), (cx + 1.0, 26.0)], P["woodDk"], 3.4)
    c.line([(cx - 1.4, 34.0), (cx - 9.0, 27.0)], P["woodDk"], 2.2)
    c.line([(cx + 0.4, 30.0), (cx + 9.0, 24.0)], P["woodDk"], 2.2)
    for dx, dy, r in ((-10.0, 24.0, 8.0), (0.0, 18.0, 10.0), (10.0, 23.0, 8.5),
                      (-3.0, 27.0, 7.0), (6.0, 29.0, 6.5)):
        c.circle(cx + dx, dy, r, fill=P["leaf"], ink=P["ink"], lw=LW_DETAIL)
    c.circle(cx - 2.0, 16.0, 5.0, fill=tint(P["leaf"], 0.22))
    # Olives around the edge of the canopy. Two of them near the middle read as
    # a pair of eyes, and the tree looked back.
    for ox, oy in ((cx - 15.0, 29.0), (cx + 3.0, 14.0), (cx + 16.0, 27.0)):
        c.circle(ox, oy, 1.8, fill=P["greenDk"], ink=P["ink"], lw=LW_FACE)


def plant_wintergarden(c: Canvas) -> None:
    """
    A whole planted trough under a glass cloche: three plants of different
    shapes on a gilded stand. Not one specimen but a garden, which is the only
    honest way to make the seventh tier of a plant ladder feel bigger than the
    sixth without simply drawing a taller tree.
    """
    cx = c.w / 2
    _stand(c, cx, 32.0)
    # A long trough on a gilt stand, planted end to end. The first attempt put
    # one big cloche in the middle and the piece read as a serving dish; the
    # garden has to be *wider* than the glass over any part of it.
    c.pie(cx + 1.0, 46.0, 12.5, 20.0, 180, 360, fill=alpha(P["glass"], 0.34))
    for ang, ln in ((-2.75, 19.0), (-2.35, 24.0), (-1.90, 26.0), (-1.45, 24.0),
                    (-1.05, 19.0)):
        _blade(c, cx - 20.0, 50.0, ang, ln, 2.8, P["leaf"])
    c.line([(cx + 2.0, 50.0), (cx + 1.0, 42.0)], P["woodDk"], 2.4)
    c.circle(cx - 3.0, 39.0, 6.0, fill=P["green"], ink=P["ink"], lw=LW_DETAIL)
    c.circle(cx + 5.0, 36.0, 6.6, fill=P["leaf"], ink=P["ink"], lw=LW_DETAIL)
    c.circle(cx + 3.5, 34.0, 3.0, fill=tint(P["leaf"], 0.26))
    for ang, ln in ((-2.1, 15.0), (-1.1, 14.0)):
        _blade(c, cx + 22.0, 50.0, ang, ln, 2.6, P["green"])
    for i, by in enumerate((33.0, 38.0, 43.0)):
        c.circle(cx + 22.0 + i * 1.2, by, 2.8, fill=P["wallRose"],
                 ink=P["ink"], lw=LW_FACE)
    # The cloche's glass was laid down before the planting; only its outline
    # and its highlight go over the top, so the plant is still inside it.
    c.arc(cx + 1.0, 46.0, 12.5, 20.0, 180, 360, P["ink"], LW_PROP)
    c.arc(cx - 3.0, 46.0, 7.5, 17.0, 188, 252, P["white"], LW_DETAIL)
    c.circle(cx + 1.0, 24.5, 2.4, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 30.0, 47.0, 60.0, 4.0, r=1.6, fill=shade(P["woodDk"], 0.3))
    c.rrect(cx - 31.0, 49.0, 62.0, 14.0, r=3.0, fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 31.0, 49.0, 62.0, 3.6, r=1.6, fill=P["gold"], ink=P["ink"], lw=LW_DETAIL)
    for lx in (cx - 25.0, cx, cx + 25.0):
        c.rrect(lx - 2.4, 62.0, 4.8, 7.0, r=1.6, fill=P["gold"], ink=P["ink"], lw=LW_FACE)


# --------------------------------------------------------------------- luxury
#
# The pieces a player buys to show off. Each one is a *machine or a monument*
# rather than furniture, so the category reads differently from seating and
# tables even before the eye gets to the gold.

def luxury_minibar(c: Canvas) -> None:
    """A glazed cabinet with the bottles showing, two glasses on top."""
    cx = c.w / 2
    _stand(c, cx, 20.0)
    _box(c, cx - 20.0, 30.0, 40.0, 38.0, P["woodDk"], r=3.0, panel=False)
    c.rrect(cx - 16.0, 34.0, 32.0, 30.0, r=2.0, fill=P["glass"],
            ink=P["ink"], lw=LW_DETAIL)
    # Two short shelves with the bottles standing *on* them. One tall rank of
    # bottles behind a single line read as a barcode.
    for sy in (48.0, 62.0):
        _bottles(c, cx - 13.0, cx + 13.0, sy, n=3, h=9.0)
        c.rrect(cx - 16.0, sy, 32.0, 1.8, r=0.9, fill=P["woodPale"])
    c.line([(cx - 10.0, 38.0), (cx - 4.0, 44.0)], tint(P["glass"], 0.60), LW_DETAIL)
    c.rrect(cx + 13.0, 44.0, 2.4, 8.0, r=1.2, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 22.0, 26.0, 44.0, 4.6, r=1.8, fill=P["woodPale"], ink=P["ink"], lw=LW_PROP)
    # Two stemmed glasses on the top, drawn big enough to have a stem at all.
    for gx in (cx - 13.0, cx - 4.0):
        c.poly([(gx - 3.6, 14.0), (gx + 3.6, 14.0), (gx + 1.4, 22.0), (gx - 1.4, 22.0)],
               fill=P["glass"], ink=P["ink"], lw=LW_FACE)
        c.rect(gx - 0.7, 21.0, 1.4, 3.4, fill=P["glassDk"])
        c.rrect(gx - 3.0, 24.0, 6.0, 1.8, r=0.9, fill=P["glassDk"], ink=P["ink"], lw=LW_FACE)


def luxury_fireplace(c: Canvas) -> None:
    """
    A mantel, a firebox and a fire. The flame is two stacked teardrops of flat
    colour — the one thing in the catalogue that is allowed to look hot, and it
    still gets an outline.
    """
    cx = c.w / 2
    _stand(c, cx, 27.0)
    c.rrect(cx - 25.0, 24.0, 50.0, 45.0, r=3.0, fill=P["linenSh"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 28.0, 19.0, 56.0, 6.0, r=2.2, fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 16.0, 34.0, 32.0, 32.0, r=3.0, fill=P["ink2"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 12.0, 58.0, 24.0, 4.0, r=1.6, fill=P["woodDk"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 9.0, 54.4, 18.0, 4.0, r=1.6, fill=P["wood"], ink=P["ink"], lw=LW_FACE)
    c.poly([(cx, 38.0), (cx + 8.0, 50.0), (cx + 5.0, 57.0), (cx - 5.0, 57.0), (cx - 8.0, 50.0)],
           fill=P["coral"], ink=P["ink"], lw=LW_DETAIL)
    c.poly([(cx, 44.0), (cx + 4.4, 51.0), (cx + 2.4, 56.0), (cx - 2.4, 56.0), (cx - 4.4, 51.0)],
           fill=P["gold"])
    # A clock on the mantel — the shelf has to hold something or it is a ledge.
    c.circle(cx + 15.0, 14.0, 4.6, fill=P["gold"], ink=P["ink"], lw=LW_DETAIL)
    c.line([(cx + 15.0, 14.0), (cx + 15.0, 11.0)], P["ink"], LW_FACE)
    c.rrect(cx - 20.0, 8.0, 8.0, 11.0, r=1.4, fill=P["carpet"], ink=P["ink"], lw=LW_DETAIL)


def luxury_jacuzzi(c: Canvas) -> None:
    """A round tub of blue water, a chrome rim, bubbles and a step."""
    cx = c.w / 2
    _stand(c, cx, 30.0)
    c.rrect(cx - 20.0, 60.0, 40.0, 9.0, r=2.0, fill=P["tileDk"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 28.0, 36.0, 56.0, 28.0, r=8.0, fill=P["white"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 30.0, 33.0, 60.0, 6.0, r=2.8, fill=P["metal"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 25.0, 38.4, 50.0, 18.0, r=5.0, fill=P["water"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - 21.0, 40.0, 42.0, 4.0, r=2.0, fill=tint(P["water"], 0.42))
    for bx, by, r in ((cx - 14.0, 32.0, 3.0), (cx - 5.0, 27.0, 2.2), (cx + 9.0, 30.0, 2.6),
                      (cx + 17.0, 25.0, 1.8)):
        c.circle(bx, by, r, fill=P["glass"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 16.0, 58.0, 32.0, 4.0, r=1.6, fill=P["tile"], ink=P["ink"], lw=LW_FACE)
    c.circle(cx + 22.0, 47.0, 2.2, fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)


def luxury_piano(c: Canvas) -> None:
    """
    An upright, seen face on: fallboard, keys, two candle sconces. The keyboard
    is the read, so the white keys are drawn as one band with black keys over
    it — five separate white rectangles would be five pixels of noise.
    """
    cx = c.w / 2
    _stand(c, cx, 30.0)
    c.rrect(cx - 28.0, 18.0, 56.0, 50.0, r=2.6, fill=P["black"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 24.0, 22.0, 48.0, 16.0, r=1.8, fill=shade(P["black"], 0.22),
            ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - 30.0, 15.0, 60.0, 4.4, r=1.8, fill=P["woodDk"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 26.0, 42.0, 52.0, 9.0, r=1.6, fill=P["white"], ink=P["ink"], lw=LW_PROP)
    for i in range(9):
        kx = cx - 22.0 + i * 5.4
        c.rect(kx, 42.4, 2.4, 5.4, fill=P["ink2"])
    c.rrect(cx - 28.0, 51.0, 56.0, 4.0, r=1.4, fill=P["woodDk"], ink=P["ink"], lw=LW_DETAIL)
    for side in (-1, 1):
        c.rrect(cx + side * 22.0 - 3.0, 56.0, 6.0, 12.0, r=1.4,
                fill=shade(P["black"], 0.3), ink=P["ink"], lw=LW_DETAIL)
        c.circle(cx + side * 19.0, 27.0, 2.6, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 6.0, 60.0, 12.0, 3.0, r=1.2, fill=P["gold"], ink=P["ink"], lw=LW_FACE)


def luxury_aquarium(c: Canvas) -> None:
    """A lit tank on a dark stand: water, gravel, weed, and two fish."""
    cx = c.w / 2
    _stand(c, cx, 27.0)
    c.rrect(cx - 24.0, 52.0, 48.0, 17.0, r=2.4, fill=P["black"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 20.0, 55.0, 40.0, 6.0, r=1.4, fill=shade(P["black"], 0.24))
    c.rrect(cx - 26.0, 18.0, 52.0, 34.0, r=3.0, fill=P["water"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 26.0, 14.0, 52.0, 6.0, r=2.2, fill=P["metal"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 22.0, 45.0, 44.0, 6.0, r=1.6, fill=P["woodPale"])
    for wx, h in ((cx - 16.0, 16.0), (cx - 11.0, 11.0), (cx + 15.0, 13.0)):
        c.line([(wx, 47.0), (wx + 3.0, 47.0 - h * 0.6), (wx - 1.0, 47.0 - h)],
               P["greenDk"], 2.2)
    for fx, fy, col, face in ((cx - 4.0, 28.0, P["coral"], 1), (cx + 12.0, 37.0, P["gold"], -1)):
        c.ellipse(fx, fy, 5.0, 3.4, fill=col, ink=P["ink"], lw=LW_FACE)
        c.poly([(fx - face * 4.6, fy), (fx - face * 8.4, fy - 3.0),
                (fx - face * 8.4, fy + 3.0)], fill=col, ink=P["ink"], lw=LW_FACE)
        c.circle(fx + face * 2.2, fy - 0.8, 0.9, fill=P["ink"])
    c.line([(cx - 20.0, 24.0), (cx - 20.0, 44.0)], tint(P["water"], 0.34), LW_DETAIL)


def luxury_privatebar(c: Canvas) -> None:
    """
    A bar of one's own: a gantry of bottles behind, a counter in front, a stool
    at the end. Three objects, so the piece reads as a *place* rather than as
    the minibar four tiers below it.
    """
    cx = c.w / 2
    _stand(c, cx, 32.0)
    c.rrect(cx - 26.0, 10.0, 44.0, 26.0, r=2.4, fill=P["woodDk"], ink=P["ink"], lw=LW_PROP)
    for k in range(2):
        c.rrect(cx - 23.0, 14.0 + k * 11.0, 38.0, 2.4, r=1.0, fill=P["woodPale"])
        _bottles(c, cx - 22.0, cx + 14.0, 14.0 + k * 11.0, n=3, h=8.0)
    c.rrect(cx - 28.0, 40.0, 46.0, 28.0, r=2.6, fill=P["carpet"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 24.0, 44.0, 38.0, 20.0, r=2.0, fill=tint(P["carpet"], 0.22))
    for k in range(2):
        c.line([(cx - 24.0, 48.0 + k * 12.0), (cx + 14.0, 48.0 + k * 12.0)],
               P["gold"], LW_DETAIL)
    c.rrect(cx - 30.0, 36.0, 50.0, 5.0, r=2.0, fill=P["woodPale"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx + 22.0, 50.0, 12.0, 4.0, r=2.0, fill=P["wood"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx + 26.0, 53.0, 4.0, 16.0, r=1.6, fill=P["metalDk"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx + 23.0, 66.0, 10.0, 3.0, r=1.4, fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)


def luxury_gallerypiece(c: Canvas) -> None:
    """
    A museum vitrine: a white plinth, a glass case, one gold object inside, and
    a rope. The rope is what says "gallery" — nothing else in a hotel room is
    fenced off from the guest.
    """
    cx = c.w / 2
    _stand(c, cx, 22.0)
    c.rrect(cx - 16.0, 40.0, 32.0, 29.0, r=2.0, fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 18.0, 36.0, 36.0, 5.0, r=1.6, fill=P["linenSh"], ink=P["ink"], lw=LW_PROP)
    # The case is filled first and outlined last, with the exhibit painted in
    # between: a translucent fill laid over the exhibit would have cut it
    # straight back out again.
    c.rrect(cx - 14.0, 10.0, 28.0, 27.0, r=2.0, fill=alpha(P["glass"], 0.28))
    # A tapered stone stand with a gold ring balanced on it. An earlier version
    # stacked a ball on a wedge and the vitrine read as a keyhole.
    c.poly([(cx - 7.0, 34.0), (cx + 7.0, 34.0), (cx + 4.5, 27.0), (cx - 4.5, 27.0)],
           fill=P["linenSh"], ink=P["ink"], lw=LW_FACE)
    c.circle(cx, 19.0, 7.0, fill=P["gold"], ink=P["ink"], lw=LW_PROP)
    c.circle(cx, 19.0, 3.0, fill=P["linen"], ink=P["ink"], lw=LW_FACE)
    c.arc(cx, 19.0, 5.0, 5.0, 150, 250, tint(P["gold"], 0.55), LW_DETAIL)
    c.rrect(cx - 14.0, 10.0, 28.0, 27.0, r=2.0, ink=P["ink"], lw=LW_DETAIL)
    c.line([(cx - 9.0, 33.0), (cx - 3.0, 15.0)], tint(P["glass"], 0.55), LW_DETAIL)
    for px in (cx - 26.0, cx + 26.0):
        c.rrect(px - 1.8, 48.0, 3.6, 21.0, r=1.4, fill=P["goldDk"], ink=P["ink"], lw=LW_DETAIL)
        c.circle(px, 46.4, 2.4, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    c.arc(cx, 46.0, 26.0, 12.0, 20, 160, P["carpet"], 2.2)


def luxury_goldStatue(c: Canvas) -> None:
    """
    The prestige piece: a gilt figure on a marble plinth, holding a star up.
    It borrows the cast's proportions — big head, short limbs — so it reads as
    a statue *of this game's people* rather than as a generic trophy.
    """
    cx = c.w / 2
    _stand(c, cx, 19.0)
    c.rrect(cx - 17.0, 52.0, 34.0, 17.0, r=2.0, fill=P["linenSh"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 19.0, 48.0, 38.0, 5.0, r=1.8, fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 13.0, 44.0, 26.0, 5.0, r=1.6, fill=P["goldDk"], ink=P["ink"], lw=LW_DETAIL)
    c.poly([(cx - 10.0, 44.0), (cx + 10.0, 44.0), (cx + 6.0, 24.0), (cx - 6.0, 24.0)],
           fill=P["gold"], ink=P["ink"], lw=LW_PROP)
    c.poly([(cx - 10.0, 44.0), (cx - 1.0, 44.0), (cx - 1.0, 24.0), (cx - 6.0, 24.0)],
           fill=tint(P["gold"], 0.24))
    # One arm raised with the star, one at the side: a statue reads as a pose,
    # and two arms doing different things is the cheapest pose there is.
    c.line([(cx - 5.0, 27.0), (cx - 11.0, 36.0)], P["ink"], 4.6)
    c.line([(cx - 5.0, 27.0), (cx - 11.0, 36.0)], P["gold"], 3.0)
    c.line([(cx + 5.0, 27.0), (cx + 12.0, 19.0)], P["ink"], 4.6)
    c.line([(cx + 5.0, 27.0), (cx + 12.0, 19.0)], P["gold"], 3.0)
    c.circle(cx, 18.0, 7.0, fill=P["gold"], ink=P["ink"], lw=LW_PROP)
    c.pie(cx, 18.0, 7.0, 7.0, 180, 360, fill=P["goldDk"])
    star = []
    for i in range(10):
        ang = math.pi / 5 * i - math.pi / 2
        rad = 6.4 if i % 2 == 0 else 2.8
        star.append((cx + 14.0 + math.cos(ang) * rad, 13.0 + math.sin(ang) * rad))
    c.poly(star, fill=P["creamHi"], ink=P["ink"], lw=LW_FACE)


# ------------------------------------------------------------------ appliance
#
# The working machines of the back of house. These have a different job from
# the furniture above: a guest room is furnished with comfort, a laundry is
# fitted with equipment, and the player has to feel that difference. So the
# vocabulary changes — control strips, dials, vents, steel and glass — and the
# only soft thing allowed in the category is the linen being processed.
#
# The equipment slot is 96x72 but these routines are laid out from `c.w`, since
# the same drawing has to survive being handed the 72x72 furniture tile.

def _bay(c: Canvas) -> tuple[float, float]:
    """Centre line and half-width available to a machine on its tile."""
    return c.w / 2, min(c.w * 0.46, 42.0)


def appliance_ironingBoard(c: Canvas) -> None:
    """
    A board on splayed legs with the iron parked on it. The board's tapered
    nose is the whole silhouette, so it is drawn as a polygon rather than as a
    rounded rectangle that happens to be long.
    """
    cx, half = _bay(c)
    _stand(c, cx, half * 0.7)
    c.line([(cx - half * 0.5, 38.0), (cx + half * 0.2, 69.0)], P["metalDk"], 2.6)
    c.line([(cx + half * 0.5, 38.0), (cx - half * 0.2, 69.0)], P["metalDk"], 2.6)
    # The nose is short and blunt. Drawn as a long point the board turned into
    # an arrow, and an arrow in a hotel means something else entirely.
    c.poly([(cx - half, 34.0), (cx + half * 0.72, 34.0), (cx + half, 37.0),
            (cx + half, 40.0), (cx + half * 0.72, 43.0), (cx - half, 43.0)],
           fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    for i in range(3):
        c.line([(cx - half + 8.0 + i * 11.0, 35.6), (cx - half + 8.0 + i * 11.0, 41.4)],
               P["glassDk"], LW_DETAIL)
    c.poly([(cx - half + 3.0, 33.5), (cx - half + 21.0, 33.5), (cx - half + 23.0, 26.5),
            (cx - half + 5.0, 26.5)], fill=P["roomBlue"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - half + 8.0, 21.5, 11.0, 5.4, r=2.0, fill=P["ink2"], ink=P["ink"], lw=LW_FACE)
    c.arc(cx - half + 26.0, 33.0, 9.0, 8.0, 200, 20, P["ink2"], LW_DETAIL)


def _drum_machine(c: Canvas, cx: float, half: float, *, body, door_fill,
                  dial=None, top=None) -> tuple[float, float]:
    """
    The shared carcass of a washer and a dryer: a boxy body, a control strip
    with dials, a big round glass door, and two feet. Returns the door centre,
    so each machine can put its own contents behind the glass.
    """
    x0, x1 = cx - half, cx + half
    top_y = 20.0
    c.rrect(x0 + 3.0, c.h - 4.0, 6.0, 4.0, r=1.2, fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)
    c.rrect(x1 - 9.0, c.h - 4.0, 6.0, 4.0, r=1.2, fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)
    _box(c, x0, top_y, x1 - x0, c.h - top_y - 2.0, body, r=3.0, panel=False)
    c.rrect(x0 + 3.0, top_y + 3.0, (x1 - x0) - 6.0, 9.0, r=2.0,
            fill=top or P["metal"], ink=P["ink"], lw=LW_DETAIL)
    for i in range(3):
        c.circle(x0 + 9.0 + i * 7.0, top_y + 7.5, 2.0,
                 fill=dial or P["coral"], ink=P["ink"], lw=LW_FACE)
    c.rrect(x1 - 16.0, top_y + 5.0, 12.0, 4.4, r=1.4, fill=P["ink2"], ink=P["ink"], lw=LW_FACE)
    door_cy = top_y + (c.h - 2.0 - top_y) * 0.62
    r = min(half * 0.52, (c.h - top_y) * 0.34)
    c.circle(cx, door_cy, r, fill=P["metal"], ink=P["ink"], lw=LW_PROP)
    c.circle(cx, door_cy, r - 3.0, fill=door_fill, ink=P["ink"], lw=LW_DETAIL)
    return door_cy, r


def appliance_washer(c: Canvas) -> None:
    """A front loader mid-cycle: water in the drum and a sock going round."""
    cx, half = _bay(c)
    _stand(c, cx, half)
    door_cy, r = _drum_machine(c, cx, half, body=P["white"], door_fill=P["glass"],
                               dial=P["roomBlue"])
    c.pie(cx, door_cy, r - 3.0, r - 3.0, 20, 160, fill=P["water"])
    c.rrect(cx - 4.0, door_cy - 3.0, 7.0, 5.0, r=2.0, fill=P["linen"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx + 1.0, door_cy + 1.0, 5.0, 4.0, r=1.8, fill=P["coral"], ink=P["ink"], lw=LW_FACE)
    c.line([(cx - r * 0.6, door_cy - r * 0.4), (cx - r * 0.2, door_cy - r * 0.72)],
           tint(P["glass"], 0.60), LW_DETAIL)


def appliance_dryer(c: Canvas) -> None:
    """
    The washer's twin, told apart by what it is doing: a warm door, a vent
    hose out of the side, and folded towels waiting on the lid. Two machines
    that differ only in colour would be a bug, not a pair.
    """
    cx, half = _bay(c)
    _stand(c, cx, half)
    # The vent hose loops inside the tile's own edge rather than off the side of
    # the machine: the equipment slot is wider than the furniture one, and this
    # routine has to survive being handed either.
    half -= 5.0
    c.arc(cx + half + 1.0, 34.0, 8.0, 12.0, 250, 90, P["metalDk"], 2.6)
    door_cy, r = _drum_machine(c, cx, half, body=P["warmWhite"], door_fill=P["creamHi"],
                               dial=P["coral"], top=P["linenSh"])
    for k in range(3):
        c.arc(cx, door_cy + 1.0, r - 5.0 + k * 0.2, r - 5.0, 200 + k * 40, 300 + k * 40,
              P["goldDk"], LW_DETAIL)
    c.rrect(cx - 5.0, door_cy - 4.0, 9.0, 6.0, r=2.4, fill=P["linen"], ink=P["ink"], lw=LW_FACE)
    _towels(c, cx - half + 7.0, 15.0, 17.0, n=2)


def appliance_treadmill(c: Canvas) -> None:
    """
    A running deck with a console on two uprights. The deck is a wedge because
    a treadmill *is* a wedge — that is the machine's own shape, not perspective
    creeping in through the back door.
    """
    cx, half = _bay(c)
    _stand(c, cx, half)
    x0, x1 = cx - half, cx + half
    # A rear foot, then the deck, then the motor cowl at the front: built from
    # the floor up, because the first version drew the deck as a flat lozenge
    # lying on the ground and it read as a rug with a lamp standing on it.
    c.rrect(x1 - 13.0, c.h - 10.0, 10.0, 10.0, r=2.0, fill=P["metalDk"],
            ink=P["ink"], lw=LW_DETAIL)
    # A thick deck, sloping down to the back, with the belt inset into it. Thin
    # it and the machine's one recognisable line disappears.
    c.poly([(x0 + 12.0, 46.0), (x1 - 2.0, 54.0), (x1 - 2.0, 63.0), (x0 + 12.0, 55.0)],
           fill=P["metal"], ink=P["ink"], lw=LW_PROP)
    c.poly([(x0 + 16.0, 48.4), (x1 - 6.0, 55.8), (x1 - 6.0, 60.4), (x0 + 16.0, 53.0)],
           fill=P["ink2"], ink=P["ink"], lw=LW_FACE)
    c.rrect(x0 + 2.0, 42.0, 24.0, c.h - 42.0, r=4.0, fill=P["metal"],
            ink=P["ink"], lw=LW_PROP)
    c.rrect(x0 + 5.0, 45.0, 18.0, 5.0, r=1.6, fill=tint(P["metal"], 0.45))
    # The upright rises out of the motor cowl; the handrail runs back from it
    # and drops onto the deck, which is what stops it reading as a signpost.
    c.rrect(x0 + 10.0, 22.0, 6.0, 22.0, r=2.4, fill=P["metalDk"],
            ink=P["ink"], lw=LW_DETAIL)
    c.rrect(x0 + 13.0, 30.0, 32.0, 3.6, r=1.8, fill=P["metal"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(x0 + 41.0, 31.0, 4.0, 21.0, r=1.8, fill=P["metal"], ink=P["ink"], lw=LW_DETAIL)
    _screen(c, x0 + 1.0, 10.0, 28.0, 14.0, glow=P["glassDk"])
    c.circle(x0 + 32.0, 18.0, 2.8, fill=P["coral"], ink=P["ink"], lw=LW_FACE)


def appliance_weightRack(c: Canvas) -> None:
    """An A-frame rack: a barbell across the top, two tiers of dumbbells."""
    cx, half = _bay(c)
    _stand(c, cx, half)
    for side in (-1, 1):
        c.poly([(cx + side * (half - 4.0) - 2.4, 26.0), (cx + side * (half - 4.0) + 2.4, 26.0),
                (cx + side * half + 2.0, c.h), (cx + side * half - 3.0, c.h)],
               fill=P["metalDk"], ink=P["ink"], lw=LW_PROP)
    for y in (40.0, 56.0):
        c.rrect(cx - half + 2.0, y, half * 2.0 - 4.0, 4.0, r=1.6,
                fill=P["metal"], ink=P["ink"], lw=LW_DETAIL)
    for y, n, r in ((38.0, 3, 4.2), (54.0, 3, 3.4)):
        for i in range(n):
            dx = cx - half + 8.0 + i * (half * 2.0 - 16.0) / max(1, n - 1)
            c.line([(dx - 4.0, y - r * 0.2), (dx + 4.0, y - r * 0.2)], P["metalDk"], 2.0)
            for s in (-1, 1):
                c.circle(dx + s * 5.4, y - r * 0.2, r, fill=P["ink2"], ink=P["ink"], lw=LW_FACE)
    c.line([(cx - half + 1.0, 24.0), (cx + half - 1.0, 24.0)], P["metalDk"], 2.6)
    for s in (-1, 1):
        c.rrect(cx + s * (half - 7.0) - 2.4, 19.0, 4.8, 10.0, r=1.4,
                fill=P["ink2"], ink=P["ink"], lw=LW_FACE)


def appliance_espressoBar(c: Canvas) -> None:
    """
    A two-group espresso machine on its counter: portafilters, a steam wand, a
    row of cups warming on top. The cups are what makes it a *bar* rather than
    a box with a spout.
    """
    cx, half = _bay(c)
    _stand(c, cx, half)
    c.rrect(cx - half, 46.0, half * 2.0, c.h - 46.0, r=2.4,
            fill=P["woodDk"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - half + 3.0, 50.0, half * 2.0 - 6.0, 10.0, r=1.6,
            fill=tint(P["woodDk"], 0.16), ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - half - 1.0, 40.0, half * 2.0 + 2.0, 5.0, r=1.8,
            fill=P["linenSh"], ink=P["ink"], lw=LW_PROP)
    body_x, body_w = cx - half * 0.84, half * 1.36
    c.rrect(body_x, 16.0, body_w, 24.0, r=4.0, fill=P["coral"], ink=P["ink"], lw=LW_PROP)
    c.rrect(body_x + 2.5, 18.0, body_w - 5.0, 7.0, r=2.0, fill=P["metal"],
            ink=P["ink"], lw=LW_FACE)
    c.rrect(body_x + 4.0, 27.0, body_w - 8.0, 7.0, r=1.6, fill=P["ink2"],
            ink=P["ink"], lw=LW_DETAIL)
    # Two group heads with a portafilter under each and a cup catching the
    # shot. Without the cup the heads read as feet and the machine as a stove.
    for i in range(2):
        gx = body_x + body_w * (0.32 + i * 0.36)
        c.rrect(gx - 3.4, 34.0, 6.8, 4.0, r=1.2, fill=P["metal"], ink=P["ink"], lw=LW_FACE)
        c.rrect(gx - 5.0, 37.0, 10.0, 2.4, r=1.0, fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)
        c.rrect(gx - 2.8, 34.6, 5.6, 5.4, r=1.4, fill=P["white"], ink=P["ink"], lw=LW_FACE)
    c.line([(body_x + body_w - 3.0, 30.0), (body_x + body_w + 3.0, 39.0)],
           P["metalDk"], 2.0)
    # Cups warming on the lid, with a handle each: three plain squares up here
    # read as buttons rather than as crockery.
    for i in range(3):
        cxp = body_x + 8.0 + i * 9.0
        c.rrect(cxp - 3.2, 9.6, 6.4, 6.0, r=1.6, fill=P["white"], ink=P["ink"], lw=LW_FACE)
        c.arc(cxp + 3.4, 12.6, 2.2, 2.0, 270, 90, P["ink"], LW_FACE)
    # A milk jug at the end of the counter, handle and all.
    jx = cx + half * 0.66
    c.rrect(jx, 32.0, 9.0, 10.0, r=1.6, fill=P["metal"], ink=P["ink"], lw=LW_DETAIL)
    c.arc(jx + 10.0, 37.0, 3.4, 3.0, 270, 90, P["ink"], LW_FACE)


def appliance_prepStation(c: Canvas) -> None:
    """
    A stainless prep bench: a board and a pot on the top, pans on the shelf
    below, and a knife rail above. Steel and a single warm accent, so a kitchen
    never gets mistaken for a laundry.
    """
    cx, half = _bay(c)
    _stand(c, cx, half)
    # Two full-height posts carry both the bench and an over-shelf. Hanging the
    # shelf on nothing left a rack of knives floating in mid-air, which is the
    # one thing a kitchen must not look like.
    for lx in (cx - half + 5.0, cx + half - 5.0):
        c.rrect(lx - 2.4, 16.0, 4.8, c.h - 16.0, r=1.8,
                fill=P["metalDk"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - half + 2.0, 20.0, half * 2.0 - 4.0, 4.0, r=1.4,
            fill=P["metal"], ink=P["ink"], lw=LW_DETAIL)
    for i in range(2):
        px = cx - half + 14.0 + i * 20.0
        c.rrect(px - 7.0, 12.0, 14.0, 8.0, r=1.8, fill=P["metal"], ink=P["ink"], lw=LW_FACE)
        c.rect(px + 6.0, 14.0, 6.0, 1.6, fill=P["ink2"])
    c.rrect(cx - half, 40.0, half * 2.0, 6.0, r=2.0, fill=P["metal"], ink=P["ink"], lw=LW_PROP)
    c.rect(cx - half + 3.0, 41.4, half * 2.0 - 6.0, 1.6, fill=tint(P["metal"], 0.50))
    c.rrect(cx - half + 3.0, 60.0, half * 2.0 - 6.0, 4.0, r=1.4,
            fill=P["metalDk"], ink=P["ink"], lw=LW_DETAIL)
    for i in range(2):
        bx = cx - half + 13.0 + i * 20.0
        c.rrect(bx - 8.0, 52.0, 16.0, 8.0, r=1.8, fill=P["linenSh"],
                ink=P["ink"], lw=LW_FACE)
    # On the bench: a board with something being chopped, and a covered pot.
    c.rrect(cx - half + 7.0, 36.0, 19.0, 4.4, r=1.4, fill=P["wood"], ink=P["ink"], lw=LW_DETAIL)
    c.circle(cx - half + 12.0, 34.0, 2.4, fill=P["coral"], ink=P["ink"], lw=LW_FACE)
    c.circle(cx - half + 18.0, 34.4, 2.0, fill=P["green"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx + half * 0.22, 30.0, 17.0, 10.0, r=2.0, fill=P["ink2"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx + half * 0.22 - 2.0, 27.6, 21.0, 3.0, r=1.2, fill=P["metal"],
            ink=P["ink"], lw=LW_FACE)
    c.circle(cx + half * 0.22 + 8.5, 26.4, 1.6, fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)


def appliance_arcadeCabinet(c: Canvas) -> None:
    """
    An upright cabinet: lit marquee, a screen with something happening on it,
    a joystick and two buttons. The angled control panel is the machine's own
    shape, the same licence the treadmill's deck takes.
    """
    cx, half = _bay(c)
    hw = min(half, 26.0)
    _stand(c, cx, hw)
    c.rrect(cx - hw, 8.0, hw * 2.0, c.h - 8.0, r=3.0, fill=P["wallGrape"],
            ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - hw + 2.0, 10.0, hw * 2.0 - 4.0, 8.0, r=2.0, fill=P["coral"],
            ink=P["ink"], lw=LW_DETAIL)
    for i in range(3):
        c.circle(cx - hw + 8.0 + i * 8.0, 14.0, 1.6, fill=P["creamHi"])
    _screen(c, cx - hw + 4.0, 20.0, hw * 2.0 - 8.0, 20.0, glow=P["ink2"])
    # A two-tone alien and a ship: the cheapest picture that reads as a game.
    c.rrect(cx - 7.0, 25.0, 8.0, 5.0, r=1.0, fill=P["leaf"])
    c.rect(cx - 9.0, 27.0, 2.0, 3.0, fill=P["leaf"])
    c.rect(cx + 1.0, 27.0, 2.0, 3.0, fill=P["leaf"])
    c.poly([(cx + 4.0, 36.0), (cx + 10.0, 36.0), (cx + 7.0, 31.0)], fill=P["gold"])
    c.poly([(cx - hw + 2.0, 44.0), (cx + hw - 2.0, 44.0), (cx + hw - 2.0, 50.0),
            (cx - hw + 2.0, 50.0)], fill=P["ink2"], ink=P["ink"], lw=LW_DETAIL)
    c.circle(cx - 8.0, 47.0, 2.6, fill=P["coral"], ink=P["ink"], lw=LW_FACE)
    c.line([(cx - 8.0, 47.0), (cx - 8.0, 42.6)], P["ink"], 1.8)
    for i in range(2):
        c.circle(cx + 4.0 + i * 7.0, 47.5, 2.2, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - hw + 3.0, 54.0, hw * 2.0 - 6.0, 12.0, r=1.8,
            fill=shade(P["wallGrape"], 0.24), ink=P["ink"], lw=LW_DETAIL)


# -------------------------------------------------------------------- storage
#
# What the hotel keeps its things in. Shelves, carts, lockers and cases — every
# one of them is a *container*, so each shows its contents: a locker with a
# closed door and nothing else is a filing cabinet.

def storage_linenShelf(c: Canvas) -> None:
    """Open shelving stacked with folded linen. The stacks are the piece."""
    cx, half = _bay(c)
    _stand(c, cx, half)
    c.rrect(cx - half, 16.0, half * 2.0, c.h - 16.0, r=2.4,
            fill=P["woodPale"], ink=P["ink"], lw=LW_PROP)
    for k in range(3):
        y = 16.0 + (k + 1) * (c.h - 16.0) / 3.0
        c.rrect(cx - half + 1.5, y - 2.6, half * 2.0 - 3.0, 2.6, r=1.0,
                fill=P["woodDk"], ink=P["ink"], lw=LW_FACE)
        for i in range(3):
            _towels(c, cx - half + 5.0 + i * (half * 2.0 - 10.0) / 3.0,
                    y - 6.0, (half * 2.0 - 10.0) / 3.0 - 4.0, n=2, step=4.0)
    c.rrect(cx - half - 1.0, 12.0, half * 2.0 + 2.0, 5.0, r=2.0,
            fill=P["wood"], ink=P["ink"], lw=LW_PROP)


def storage_supplyCart(c: Canvas) -> None:
    """
    The housekeeping trolley: a bagged frame, a shelf of bottles, towels on
    top and a push handle. It is the one storage piece that moves, so the
    castors are drawn big enough to be read as wheels.
    """
    cx, half = _bay(c)
    _stand(c, cx, half * 0.9)
    for wx in (cx - half + 8.0, cx + half - 8.0):
        c.circle(wx, c.h - 4.0, 3.6, fill=P["ink2"], ink=P["ink"], lw=LW_DETAIL)
        c.circle(wx, c.h - 4.0, 1.4, fill=P["metal"])
    c.rrect(cx - half + 2.0, 34.0, half * 2.0 - 4.0, c.h - 42.0, r=2.4,
            fill=P["roomBlue"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - half + 5.0, 38.0, half * 1.0, c.h - 50.0, r=1.6,
            fill=tint(P["roomBlue"], 0.24), ink=P["ink"], lw=LW_DETAIL)
    for i in range(3):
        c.rrect(cx + 2.0 + i * 6.0, 44.0, 4.4, 9.0, r=1.4,
                fill=(P["coral"], P["gold"], P["glass"])[i], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - half + 1.0, 30.0, half * 2.0 - 2.0, 4.6, r=1.8,
            fill=P["metal"], ink=P["ink"], lw=LW_PROP)
    _towels(c, cx - half + 5.0, 28.0, 16.0, n=3)
    _towels(c, cx + 2.0, 28.0, 14.0, n=2)
    # A push handle: an upright with a grip across it. An L of pipe read as
    # plumbing, and a trolley is defined by the thing you push it with.
    c.rrect(cx + half - 5.0, 18.0, 4.0, 14.0, r=1.6, fill=P["metalDk"],
            ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx + half - 16.0, 15.0, 15.0, 4.0, r=2.0, fill=P["metal"],
            ink=P["ink"], lw=LW_DETAIL)
    # The rubbish sack, hung off the end: the detail that names the trade.
    c.poly([(cx - half - 4.0, 40.0), (cx - half + 5.0, 40.0), (cx - half + 7.0, 60.0),
            (cx - half - 6.0, 60.0)], fill=P["ink2"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - half - 5.0, 38.0, 11.0, 4.0, r=1.8, fill=P["metalDk"],
            ink=P["ink"], lw=LW_FACE)


def storage_luggageRack(c: Canvas) -> None:
    """A folding rack with webbing straps and a case standing beside it."""
    cx, half = _bay(c)
    _stand(c, cx, half * 0.9)
    for s in (-1, 1):
        c.line([(cx + s * 6.0, 40.0), (cx + s * 20.0, c.h - 1.0)], P["ink"], 4.2)
        c.line([(cx + s * 6.0, 40.0), (cx + s * 20.0, c.h - 1.0)], P["woodDk"], 2.6)
    c.line([(cx - 14.0, 54.0), (cx + 14.0, 54.0)], P["woodDk"], 2.0)
    c.rrect(cx - 22.0, 36.0, 44.0, 5.0, r=1.8, fill=P["woodDk"], ink=P["ink"], lw=LW_PROP)
    for i in range(3):
        c.rrect(cx - 18.0 + i * 12.0, 34.4, 7.0, 3.0, r=1.2,
                fill=P["carpet"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 16.0, 20.0, 30.0, 15.0, r=2.4, fill=P["wood"], ink=P["ink"], lw=LW_PROP)
    c.line([(cx - 16.0, 27.0), (cx + 14.0, 27.0)], P["goldDk"], LW_DETAIL)
    c.arc(cx - 1.0, 20.0, 5.0, 4.0, 180, 360, P["ink"], LW_DETAIL)
    # The spare case is placed off the tile's edge, not off the rack, so it is
    # still on the tile when the slot is the narrower 72 wide.
    sx = cx + half - 17.0
    c.rrect(sx, 48.0, 16.0, 21.0, r=2.4, fill=P["carpet"], ink=P["ink"], lw=LW_PROP)
    c.line([(sx, 56.0), (sx + 16.0, 56.0)], P["gold"], LW_DETAIL)
    c.arc(sx + 8.0, 48.0, 4.0, 3.4, 180, 360, P["ink"], LW_DETAIL)


def storage_lockers(c: Canvas) -> None:
    """
    Three steel lockers: vents, handles, one door ajar. The open door is what
    stops the bank reading as a filing cabinet — and what says the room it
    stands in belongs to the staff.
    """
    cx, half = _bay(c)
    _stand(c, cx, half)
    top_y = 14.0
    c.rrect(cx - half, top_y, half * 2.0, c.h - top_y, r=2.4,
            fill=P["metalDk"], ink=P["ink"], lw=LW_PROP)
    w = (half * 2.0 - 6.0) / 3.0
    for i in range(3):
        dx = cx - half + 3.0 + i * w
        c.rrect(dx, top_y + 3.0, w - 2.0, c.h - top_y - 6.0, r=1.6,
                fill=P["metal"], ink=P["ink"], lw=LW_DETAIL)
        for k in range(3):
            c.line([(dx + 3.0, top_y + 8.0 + k * 3.0), (dx + w - 5.0, top_y + 8.0 + k * 3.0)],
                   P["metalDk"], LW_DETAIL)
        c.rrect(dx + w - 6.0, top_y + 24.0, 2.4, 7.0, r=1.0, fill=P["ink2"],
                ink=P["ink"], lw=LW_FACE)
    # The open one: a dark interior with a coat on a peg.
    ox = cx - half + 3.0 + 2.0 * w
    c.rrect(ox, top_y + 3.0, w - 2.0, c.h - top_y - 6.0, r=1.6, fill=P["ink2"],
            ink=P["ink"], lw=LW_DETAIL)
    c.rrect(ox + 3.0, top_y + 12.0, w - 8.0, 22.0, r=2.0, fill=P["coral"],
            ink=P["ink"], lw=LW_FACE)
    c.rrect(ox + w - 4.0, top_y + 3.0, 3.0, c.h - top_y - 6.0, r=1.2, fill=P["metal"],
            ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - half - 1.0, c.h - 4.0, half * 2.0 + 2.0, 4.0, r=1.4,
            fill=P["ink2"], ink=P["ink"], lw=LW_FACE)


def storage_toolRack(c: Canvas) -> None:
    """A pegboard on a stand with the tools hung on it and a bin below."""
    cx, half = _bay(c)
    _stand(c, cx, half * 0.92)
    for lx in (cx - half + 5.0, cx + half - 5.0):
        c.rrect(lx - 2.2, 44.0, 4.4, c.h - 44.0, r=1.6, fill=P["metalDk"],
                ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - half + 2.0, 12.0, half * 2.0 - 4.0, 34.0, r=2.4,
            fill=P["woodPale"], ink=P["ink"], lw=LW_PROP)
    for row in range(3):
        for col in range(6):
            c.circle(cx - half + 8.0 + col * (half * 2.0 - 16.0) / 5.0,
                     18.0 + row * 11.0, 0.8, fill=shade(P["woodPale"], 0.26))
    # Three tools, each drawn as a filled silhouette with its own outline. Hung
    # as thin strokes they vanished into the pegboard's own colour.
    hx = cx - half + 10.0
    c.rrect(hx - 1.4, 18.0, 2.8, 14.0, r=1.2, fill=P["woodDk"], ink=P["ink"], lw=LW_FACE)
    c.rrect(hx - 5.0, 14.0, 10.0, 4.6, r=1.4, fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)
    c.poly([(cx - 7.0, 16.0), (cx + 9.0, 16.0), (cx - 7.0, 29.0)],
           fill=P["metal"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - 10.0, 14.6, 5.0, 3.6, r=1.4, fill=P["woodDk"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx + 15.0, 17.0, 3.4, 14.0, r=1.4, fill=P["metal"], ink=P["ink"], lw=LW_FACE)
    c.circle(cx + 16.7, 15.4, 3.2, fill=P["metal"], ink=P["ink"], lw=LW_FACE)
    c.circle(cx + 16.7, 15.4, 1.2, fill=P["woodPale"])
    c.rrect(cx - half + 6.0, 34.0, 14.0, 9.0, r=1.6, fill=P["coral"],
            ink=P["ink"], lw=LW_FACE)
    c.rrect(cx + 4.0, 36.0, 12.0, 7.0, r=1.4, fill=P["roomBlue"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 14.0, 52.0, 28.0, c.h - 53.0, r=2.4, fill=P["coral"],
            ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 12.0, 49.0, 24.0, 4.0, r=1.4, fill=shade(P["coral"], 0.22),
            ink=P["ink"], lw=LW_FACE)
    c.arc(cx, 49.0, 5.0, 4.4, 180, 360, P["ink"], LW_DETAIL)


def storage_miniFridge(c: Canvas) -> None:
    """A small fridge: a freezer line, a long handle, a bottle on top."""
    cx, half = _bay(c)
    hw = min(half, 24.0)
    _stand(c, cx, hw)
    c.rrect(cx - hw, 20.0, hw * 2.0, c.h - 22.0, r=3.0, fill=P["white"],
            ink=P["ink"], lw=LW_PROP)
    c.line([(cx - hw + 1.0, 33.0), (cx + hw - 1.0, 33.0)], P["ink"], LW_DETAIL)
    c.rrect(cx + hw - 6.0, 24.0, 2.6, 6.0, r=1.0, fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx + hw - 6.0, 38.0, 2.6, 16.0, r=1.2, fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - hw + 3.0, 22.0, hw * 2.0 - 6.0, 8.0, r=1.6,
            fill=P["linenSh"])
    c.rrect(cx - hw + 4.0, 40.0, 10.0, 8.0, r=1.4, fill=P["coral"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - hw + 4.0, 52.0, 7.0, 6.0, r=1.2, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    for fy2 in (c.h - 3.0,):
        c.rrect(cx - hw + 2.0, fy2 - 1.0, 5.0, 3.0, r=1.0, fill=P["ink2"])
        c.rrect(cx + hw - 7.0, fy2 - 1.0, 5.0, 3.0, r=1.0, fill=P["ink2"])
    c.rrect(cx - 4.0, 10.0, 5.0, 10.0, r=1.6, fill=P["green"], ink=P["ink"], lw=LW_FACE)
    c.rect(cx - 2.4, 7.0, 1.8, 3.4, fill=P["greenDk"])


def storage_safeCabinet(c: Canvas) -> None:
    """
    A strongbox on a plinth: a dial, a spoked handle, hinges and a bolt line.
    Heavier than everything else in the category — the outline is the same
    weight, but nothing else here is this solid a block of one colour.
    """
    cx, half = _bay(c)
    hw = min(half, 28.0)
    _stand(c, cx, hw)
    c.rrect(cx - hw, c.h - 8.0, hw * 2.0, 8.0, r=1.8, fill=P["ink2"],
            ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - hw + 2.0, 16.0, hw * 2.0 - 4.0, c.h - 24.0, r=2.6,
            fill=P["metalDk"], ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - hw + 6.0, 20.0, hw * 2.0 - 12.0, c.h - 32.0, r=2.0,
            fill=P["metal"], ink=P["ink"], lw=LW_DETAIL)
    for hy in (24.0, c.h - 16.0):
        c.rrect(cx - hw + 3.0, hy, 4.0, 4.0, r=1.0, fill=P["ink2"])
    dial_cy = 34.0
    c.circle(cx + 2.0, dial_cy, 7.0, fill=P["gold"], ink=P["ink"], lw=LW_PROP)
    c.circle(cx + 2.0, dial_cy, 3.0, fill=P["goldDk"], ink=P["ink"], lw=LW_FACE)
    for a in range(4):
        ang = a * math.pi / 4 + 0.4
        c.line([(cx + 2.0 + math.cos(ang) * 4.0, dial_cy + math.sin(ang) * 4.0),
                (cx + 2.0 + math.cos(ang) * 7.6, dial_cy + math.sin(ang) * 7.6)],
               P["goldDk"], LW_DETAIL)
    c.rrect(cx - 2.0, 48.0, 4.0, 12.0, r=1.6, fill=P["gold"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - 8.0, 52.0, 16.0, 3.4, r=1.4, fill=P["gold"], ink=P["ink"], lw=LW_DETAIL)


def storage_displayCase(c: Canvas) -> None:
    """
    A lit vitrine of small precious things — the retail end of the ladder.
    Its shelves glow, which is the only interior light in the storage category
    and the reason it reads as expensive rather than merely tidy.
    """
    cx, half = _bay(c)
    hw = min(half, 30.0)
    _stand(c, cx, hw)
    c.rrect(cx - hw, c.h - 12.0, hw * 2.0, 12.0, r=2.0, fill=P["woodDk"],
            ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - hw + 3.0, c.h - 9.0, hw * 2.0 - 6.0, 5.0, r=1.4,
            fill=tint(P["woodDk"], 0.18))
    c.rrect(cx - hw, 10.0, hw * 2.0, c.h - 22.0, r=2.4,
            fill=alpha(P["glass"], 0.42), ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - hw + 1.0, 10.0, hw * 2.0 - 2.0, 4.0, r=1.4, fill=P["gold"],
            ink=P["ink"], lw=LW_DETAIL)
    for k in range(2):
        sy = 26.0 + k * 16.0
        c.rrect(cx - hw + 2.0, sy, hw * 2.0 - 4.0, 2.4, r=1.0, fill=P["gold"])
        c.rrect(cx - hw + 4.0, sy - 3.0, hw * 2.0 - 8.0, 3.0,
                fill=alpha(P["creamHi"], 0.35))
    c.circle(cx - hw * 0.5, 22.0, 4.4, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    c.circle(cx - hw * 0.5, 22.0, 1.6, fill=P["creamHi"])
    c.rrect(cx + hw * 0.2, 17.0, 7.0, 8.0, r=1.6, fill=P["wallRose"],
            ink=P["ink"], lw=LW_FACE)
    c.rect(cx + hw * 0.2 + 2.4, 14.6, 2.2, 2.6, fill=P["goldDk"])
    c.poly([(cx - hw * 0.42, 41.0), (cx - hw * 0.08, 41.0), (cx - hw * 0.25, 33.0)],
           fill=P["glassDk"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx + hw * 0.12, 35.0, 10.0, 6.0, r=1.4, fill=P["coral"],
            ink=P["ink"], lw=LW_FACE)
    c.line([(cx - hw + 6.0, 14.0), (cx - hw + 6.0, c.h - 14.0)],
           alpha(P["white"], 0.35), LW_DETAIL)


PIECES = {
    "bed_cot": bed_cot,
    "bed_single": bed_single,
    "bed_queen": bed_queen,
    "bed_king": bed_king,
    "bed_canopy": bed_canopy,
    "bed_floating": bed_floating,
    "bed_fourposter": bed_fourposter,
    "bed_emperorbed": bed_emperorbed,

    "seating_stool": seating_stool,
    "seating_armchair": seating_armchair,
    "seating_loveseat": seating_loveseat,
    "seating_chaise": seating_chaise,
    "seating_throne": seating_throne,
    "seating_velvetchaise": seating_velvetchaise,
    "seating_salonset": seating_salonset,

    "table_sideTable": table_sideTable,
    "table_deskWood": table_deskWood,
    "table_glassTable": table_glassTable,
    "table_marbleTable": table_marbleTable,
    "table_crystalTable": table_crystalTable,
    "table_marbleconsole": table_marbleconsole,
    "table_writingdesk": table_writingdesk,

    "plant_succulent": plant_succulent,
    "plant_fern": plant_fern,
    "plant_palm": plant_palm,
    "plant_bonsai": plant_bonsai,
    "plant_orchidWall": plant_orchidWall,
    "plant_indoorolivetree": plant_indoorolivetree,
    "plant_wintergarden": plant_wintergarden,

    "luxury_minibar": luxury_minibar,
    "luxury_fireplace": luxury_fireplace,
    "luxury_jacuzzi": luxury_jacuzzi,
    "luxury_piano": luxury_piano,
    "luxury_aquarium": luxury_aquarium,
    "luxury_privatebar": luxury_privatebar,
    "luxury_gallerypiece": luxury_gallerypiece,
    "luxury_goldStatue": luxury_goldStatue,

    "appliance_ironingBoard": appliance_ironingBoard,
    "appliance_washer": appliance_washer,
    "appliance_treadmill": appliance_treadmill,
    "appliance_dryer": appliance_dryer,
    "appliance_weightRack": appliance_weightRack,
    "appliance_espressoBar": appliance_espressoBar,
    "appliance_prepStation": appliance_prepStation,
    "appliance_arcadeCabinet": appliance_arcadeCabinet,

    "storage_linenShelf": storage_linenShelf,
    "storage_supplyCart": storage_supplyCart,
    "storage_luggageRack": storage_luggageRack,
    "storage_lockers": storage_lockers,
    "storage_toolRack": storage_toolRack,
    "storage_miniFridge": storage_miniFridge,
    "storage_safeCabinet": storage_safeCabinet,
    "storage_displayCase": storage_displayCase,
}
