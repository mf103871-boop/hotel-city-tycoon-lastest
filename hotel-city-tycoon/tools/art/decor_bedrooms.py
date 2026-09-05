"""
The pieces only the coin bedrooms sell — here, the deluxe room's loft look.

The deluxe is the top of the coin ladder, and it is a timber-and-textile room
rather than the gilt-and-crystal of the gem suites: walnut, rattan, linen and
one strong teal, nothing metallic. What has to survive the 55% composite is
the outline, because that is all a bed or a lamp has left at 40px:

*   `bed_loftSleigh` is the one bed in the catalogue with a curl at *both*
    ends. The queen has a straight padded board, the king a tall buttoned one,
    the canopy and the four-poster have posts, the floating bed has no legs and
    the emperor has an arch and gold — none of them has a scroll.
*   `lighting_loftRattan` is the one lamp that is a wide *bell* with a
    criss-cross texture. The pendant is a smooth half-dome, the lamp a
    straight cone, the lobby lantern a glazed box, and every chandelier is
    branched.

Anchors as everywhere: the bed stands on the bottom edge with a contact
shadow, the pendant starts its cord at y = 0. Sizes come from `c.w` / `c.h`.
"""
from __future__ import annotations

from PIL import ImageChops

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    shade, tint, mix,
)
from decor_props import _stand, _legs, _bed_body, _pillow
from decor_surfaces import _cord, _ceiling_plate, _glow

#: Walnut is not in the palette: the darkest wood there is `woodDk`, which is
#: an orange oak. Pulling it toward the brown of `hairBrown` gives the cool
#: dark timber a sleigh bed is made of without inventing a hex.
WALNUT = mix(P["woodDk"], P["hairBrown"], 0.55)

#: A saturated teal, between the pool water and the plant green. `wallTeal`
#: is a pastel wall colour and vanished against a cream quilt.
TEAL = mix(P["waterDk"], P["greenDk"], 0.45)


# ------------------------------------------------------------------ the bed

def _sleigh_end(c: Canvas, curl_x: float, top: float, bottom: float,
                curl_r: float, out: int) -> None:
    """
    One end of a sleigh bed, seen edge-on: a thick board that leans outward as
    it rises and finishes in a full curl on its outer side.

    `out` is the direction the scroll rolls (-1 at the head, +1 at the foot).
    The board is a polygon rather than a rectangle so its outer edge can bow
    out and come back in at the base — that S in the outline is the whole
    read; a straight plank with a circle stuck on top looked like a lollipop.
    """
    def px(u: float) -> float:
        return curl_x + out * u

    neck = top + curl_r * 2 - 1.0
    board = [
        (px(-3.0), bottom), (px(0.5), bottom - 8.0), (px(2.2), neck + 10.0),
        (px(2.6), neck),
        (px(-6.4), neck), (px(-6.8), neck + 10.0), (px(-8.0), bottom - 8.0),
        (px(-11.0), bottom),
    ]
    c.poly(board, fill=WALNUT, ink=P["ink"], lw=LW_PROP)
    # One highlight sliver down the face, following the lean.
    c.line([(px(-1.6), bottom - 10.0), (px(-0.4), neck + 10.0), (px(0.0), neck + 3.0)],
           tint(WALNUT, 0.30), LW_DETAIL)
    # The curl: a full round with a smaller round inside it, which is the only
    # spiral this line weight can carry.
    cy = top + curl_r
    c.circle(curl_x, cy, curl_r, fill=WALNUT, ink=P["ink"], lw=LW_PROP)
    c.circle(curl_x, cy, curl_r * 0.50, fill=tint(WALNUT, 0.26), ink=P["ink"], lw=LW_FACE)
    c.arc(curl_x, cy, curl_r * 0.76, curl_r * 0.76, 195, 300, tint(WALNUT, 0.34), 1.0)


def bed_loftSleigh(c: Canvas) -> None:
    """
    A walnut sleigh bed: a scroll at each end, the head one taller, a cream
    quilt, two plump linen pillows and a teal cable-knit throw across the foot
    with its fringe hanging over the rail.

    The footboard is drawn *after* the bedding so it caps the foot end; at the
    head the board goes behind the mattress like every other headboard here.
    """
    cx = c.w / 2
    x0, x1 = cx - 50.0, cx + 50.0
    fy = _stand(c, cx, 51.0)
    _sleigh_end(c, x0 + 8.0, 6.0, fy - 7.0, 7.5, -1)
    # Walnut feet rather than the oak ones `_bed_body` would draw: a walnut
    # bed on orange feet reads as two pieces of furniture.
    _legs(c, (x0 + 19.0, x1 - 18.0), fy - 7.0, colour=WALNUT, w=5.0, r=1.8)
    mat_y = _bed_body(c, x0 + 13.0, x1 - 12.0, 38.0, quilt=P["creamHi"], base=WALNUT,
                      mat_h=9.0, leg_h=6.0, quilt_from=0.36, legs=False)
    _pillow(c, x0 + 28.0, mat_y - 4.5, 22.0, 12.0, colour=P["linen"])
    _pillow(c, x0 + 47.0, mat_y - 3.5, 20.0, 11.0, colour=P["white"])
    # The throw: taller than the quilt it lies on, so it reads as a layer
    # rather than as a patch of the quilt in another colour.
    tx, tw = x1 - 41.0, 22.0
    ty, th = mat_y - 4.6, 19.0
    c.rrect(tx, ty, tw, th, r=2.6, fill=TEAL, ink=P["ink"], lw=LW_PROP)
    c.line([(tx + 1.6, ty + 6.0), (tx + tw - 1.6, ty + 6.0)], shade(TEAL, 0.30), LW_DETAIL)
    # Cable knit: two braids of chevrons. At 55% a chevron is a dash, but two
    # columns of dashes on a plain block is still visibly a knit.
    knit = tint(TEAL, 0.38)
    for bx in (tx + 6.0, tx + tw - 6.0):
        for k in range(3):
            ky = ty + 8.4 + k * 3.4
            c.line([(bx - 2.2, ky + 1.6), (bx, ky), (bx + 2.2, ky + 1.6)], knit, 1.0)
    for i in range(7):
        fx = tx + 1.8 + i * (tw - 3.6) / 6
        c.line([(fx, ty + th - 0.6), (fx, ty + th + 3.4)], knit, 1.2)
    _sleigh_end(c, x1 - 7.0, 24.0, fy - 7.0, 6.5, 1)


# ----------------------------------------------------------------- the lamp

def lighting_loftRattan(c: Canvas) -> None:
    """
    An open-weave rattan bell on a knotted jute cord, flared at the mouth like
    an upturned basket, with an amber bulb showing through the lattice.

    The weave is drawn on its own canvas and masked to the bell, the way the
    wallpaper panels are: Pillow has no clip region, and a lattice stroked
    straight onto the shade spilled past its flare and out over the wall.
    """
    cx = c.w / 2
    drop = 11.0
    bell_h = 24.0
    mouth = drop + bell_h
    honey = P["wood"]
    tan = P["woodPale"]
    jute = mix(P["woodPale"], P["metalDk"], 0.30)

    _glow(c, cx, mouth + 5.0, 21.0, colour=P["cream"])
    _ceiling_plate(c, cx, 10.0, colour=P["wood"])
    _cord(c, cx, drop, colour=jute)
    for ky in (3.6, 7.6):
        c.circle(cx, ky, 1.6, fill=shade(jute, 0.18), ink=P["ink"], lw=LW_FACE)

    # The bell profile: narrow collar, straight-ish belly, then a flare that
    # widens fast near the mouth. The flare is what makes it a basket rather
    # than the cone two tiers below it.
    prof = ((0.0, 5.0), (0.20, 7.5), (0.45, 11.0), (0.68, 15.5), (0.86, 20.5), (1.0, 24.0))
    left = [(cx - hw, drop + t * bell_h) for t, hw in prof]
    right = [(cx + hw, drop + t * bell_h) for t, hw in prof]
    outline = left + right[::-1]

    weave = Canvas(c.w, c.h, tier=c.tier)
    weave.poly(outline, fill=honey)
    # The bulb seen through the gaps: a bright disc under the lattice, so the
    # weave reads as open rather than as a pattern printed on a solid shade.
    weave.circle(cx, drop + bell_h * 0.60, 8.0, fill=P["cream"])
    weave.circle(cx, drop + bell_h * 0.60, 4.0, fill=P["creamHi"])
    lat = shade(honey, 0.42)
    y0, y1 = drop - 2.0, mouth + 2.0
    for i in range(-7, 8):
        x = cx + i * 7.0
        weave.line([(x, y0), (x + (y1 - y0), y1)], lat, 1.3)
        weave.line([(x, y0), (x - (y1 - y0), y1)], lat, 1.3)
    # Solid rattan wraps at the collar and the mouth, in the paler tan.
    weave.rect(cx - 12.0, drop, 24.0, 4.0, fill=tan)
    weave.rect(cx - 30.0, mouth - 3.6, 60.0, 3.6, fill=tan)
    weave.line([(cx - 4.0, drop + 5.0), (cx - 9.0, drop + 12.0), (cx - 14.0, drop + 18.0)],
               tint(honey, 0.40), 1.2)
    mask = Canvas(c.w, c.h, tier=c.tier)
    mask.poly(outline, fill=(255, 255, 255, 255))
    weave.img.putalpha(ImageChops.multiply(weave.img.getchannel("A"), mask.img.getchannel("A")))
    c.img.alpha_composite(weave.img)
    c.poly(outline, ink=P["ink"], lw=LW_PROP)

    # The opening, seen from a little below, and the bulb hanging in it.
    c.ellipse(cx, mouth, 24.0, 3.2, fill=tint(tan, 0.30), ink=P["ink"], lw=LW_DETAIL)
    c.circle(cx, mouth + 0.8, 3.8, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    c.circle(cx - 1.2, mouth - 0.4, 1.2, fill=P["creamHi"])


PIECES = {
    "bed_loftSleigh":       bed_loftSleigh,
    "lighting_loftRattan":  lighting_loftRattan,
}
