"""
The pieces only the gem suites sell: the honeymoon suite, the executive, the
luxury suite and the presidential.

Each suite is a register of its own. The honeymoon is blush and white — pink
drapes, roses, petals on white bedding — and nothing in it is dark. The
executive is a boardroom that happens to have a bed in it: charcoal leather,
dark walnut, brass, white linen and one navy accent, against the sand wall it
is built on, and nothing in it is gilt or crystal. The luxury suite is the
emperor bed's room, white fur and gold braid. The presidential is crimson,
navy and a great deal of gold, and it is allowed to be too much. What has to
survive the 55% composite in every one of them is the outline, because that
is all a bed, a lamp, a rug or a plaque has left at 40px:

*   `bed_petalCanopy` is the one bed whose roof *sags*: two pink festoons
    slung between white posts, a scalloped hem following the sag and a tail
    of fabric down each end post. The built-in canopy's roof is a flat rose
    rectangle with a straight valance; the four-poster is bare posts.
*   `bed_leatherWingback` is the one bed whose headboard has *ears*: a tall
    dark board with the two top corners flared out like a club chair. The
    king's board is a cream buttoned grid, the queen's a plain pad, the
    floating bed has no legs, the sleigh has curls at both ends and the
    emperor is an arch in gold.
*   `bed_stateBed` is the one bed with a *crown* over it: a gold corona at
    the top centre, two navy drapes sweeping out from under it in a Λ behind
    the bed, and a two-step gilt plinth under everything. No other bed has a
    crown, drapes falling from one point, or a stepped base.
*   `rug_roseGarland` and `rug_ermineHearth` are the two rugs that are not
    straight-edged strips. The garland is an *oval* whose edge is a chain of
    pink blooms; the hearth rug is a white *cloud* with black dashes on it.
    Every other rug is a woven rectangle or runner with a fringe, in red,
    lavender, green, brown or coir, and the latte rug is a plain brown disc.
*   `lighting_roseChandelier` is the branched fitting whose arms end in pink
    *balls* rather than candle sticks: three glass roses on gold arms under
    a short chain. The crystal chandeliers are tiers of drops, the
    candelabra an iron ring, and the pendants are single shades.
*   `lighting_bankersPendant` is the one lamp that is a flat *lens* on a
    stick: a wide shallow green shade on a brass rod. The lamp is a cream
    cone, the pendant a coral half-dome, the bulb a bare globe, the lantern a
    box on a chain, the rattan a bell, and every chandelier is branched.
*   `wallArt_worldClocks` is the one wall piece with no picture in it: a
    dark plaque wider than it is tall carrying three brass rings.
*   `wallArt_crossedStandards` is the one wall piece that is an *X*: two
    dark poles crossed under a gold medallion, a crimson and a navy banner
    hanging from the upper arms. It has no frame, like the sunburst, but
    the sunburst is a star of rays and this is a diagonal cross carrying two
    flags. Every other wallArt is a framed scene, an oval portrait, a map, a
    white screen or a string of pennants.

Anchors as everywhere: beds and rugs stand on the bottom edge (the beds
with a contact shadow), the fittings start their rod or chain at y = 0, the
plaque is centred through `_art_frame` and the standards are centred where
`_art_frame` would put a picture. Sizes come from `c.w` / `c.h`.
"""
from __future__ import annotations

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    shade, tint, mix, math,
)
from decor_props import _stand, _legs, _bed_body, _pillow, _blade
from decor_surfaces import (
    _art_frame, _cord, _chain, _ceiling_plate, _glow, _star,
    GOLD, GOLD_DK, GOLD_HI, BAND_CY,
)

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

#: Blush. The honeymoon wall is `wallRose`, and a drape the same pink as the
#: wall it hangs in front of is invisible — a third of the way to `hairPink`
#: it still was. Two thirds of the way it is a pink the wall, the white posts
#: and the white bedding all separate from, and still a pastel.
BLUSH = mix(P["hairPink"], P["wallRose"], 0.35)

#: Rose-pink for blooms and petals: `hairPink` warmed toward coral, so a
#: three-pixel bloom on a cream rug is a dot of colour rather than a smudge.
ROSE = mix(P["hairPink"], P["coral"], 0.35)

#: Whitewashed timber for the petal bed's frame: `woodPale` most of the way to
#: white, which reads as painted wood where plain `white` read as plaster.
WHITEWASH = mix(P["woodPale"], P["white"], 0.55)

#: Crimson. `carpet` is a rose red and `wallRed` a tomato; between the two,
#: shaded a step, is the velvet a state bed is quilted in and a standard is
#: sewn from.
CRIMSON = shade(mix(P["wallRed"], P["carpet"], 0.45), 0.08)


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


def _bez(p0, p1, p2, n: int = 8) -> list[tuple[float, float]]:
    """
    Points along a quadratic curve from `p0` to `p2`, bent toward `p1`.

    Every sweep in this module — a festoon, a drape, a swagged hem — is a
    polygon, because Pillow has no curves; sampling a bezier is what keeps a
    polygon from reading as a zigzag at the joints.
    """
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1.0 - t
        pts.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
    return pts


# ===================================================== the honeymoon suite

def _festoons(c: Canvas, x0: float, x1: float, top: float, depth: float,
              colour, halves: int = 2, scallops: int = 4) -> None:
    """
    A drape slung between posts: `halves` festoons sagging `depth` below the
    rail, the hem of each one scalloped.

    The whole thing is one polygon whose lower edge is a sine sag with a
    smaller |sine| riding on it, so the scallops are part of the outline
    rather than pies stuck under a curve. That is the silhouette the piece
    lives on: the built-in canopy's roof is a flat bar with its scallops
    hung under a straight edge, and this one dips.
    """
    amp = 1.6
    # `body` is the fabric's thickness at the gathers: without it each
    # festoon tapered to nothing at its ends and the drape was two crescents
    # of string rather than one length of cloth.
    body = 2.6
    pts = [(x0, top), (x1, top)]
    n = 26
    for i in range(n * halves, -1, -1):
        u = i / (n * halves)
        ul = (u * halves) % 1.0 if i != n * halves else 0.0
        if i == 0:
            ul = 0.0
        y = (top + body + depth * math.sin(math.pi * ul)
             + amp * abs(math.sin(scallops * math.pi * ul)))
        pts.append((x0 + (x1 - x0) * u, y))
    c.poly(pts, fill=colour, ink=P["ink"], lw=LW_PROP)
    # One fold line per festoon, following the sag: the shading budget.
    for k in range(halves):
        fx0 = x0 + (x1 - x0) * (k + 0.16) / halves
        fx1 = x0 + (x1 - x0) * (k + 0.84) / halves
        c.line(_bez((fx0, top + body + 1.4), ((fx0 + fx1) / 2, top + body + depth * 1.35 - 1.0),
                    (fx1, top + body + 1.4), 10), tint(colour, 0.36), LW_FACE)


def bed_petalCanopy(c: Canvas) -> None:
    """
    A canopy bed on four slender white posts, a blush drape swagged between
    them in two festoons with a scalloped hem, a tail of the same fabric
    hanging down each end post, and white bedding with three rose petals
    dropped on the quilt.

    The posts are thin and the drape is deep, so the pink is the tallest and
    widest thing in the sprite and the posts are only what holds it up: at
    40px the read is "pink M over a white bed", which no other bed gives.
    The back pair of posts is drawn first and shorter, a little inboard, so
    four posts show above the mattress where the built-in canopy shows two.
    """
    cx = c.w / 2
    x0, x1 = cx - 48.0, cx + 48.0
    fy = _stand(c, cx, 49.0)
    rail_y = 8.0
    post_w = 3.4
    front = (x0 + 3.6, x1 - 3.6)
    # Back posts, then the rail they carry, then the front posts over it.
    for px in (x0 + 10.0, x1 - 10.0):
        c.rrect(px - post_w / 2, rail_y + 1.0, post_w, 34.0, r=1.5,
                fill=P["linenSh"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(x0 + 1.0, rail_y - 2.0, (x1 - x0) - 2.0, 3.6, r=1.6,
            fill=P["white"], ink=P["ink"], lw=LW_DETAIL)
    for px in front:
        c.rrect(px - post_w / 2, rail_y - 3.0, post_w, fy - 5.0 - rail_y + 3.0, r=1.5,
                fill=P["white"], ink=P["ink"], lw=LW_PROP)
        c.circle(px, rail_y - 4.0, 2.2, fill=P["white"], ink=P["ink"], lw=LW_FACE)
    _festoons(c, front[0], front[1], rail_y, 9.0, BLUSH)
    # The tails: the drape's ends, falling outside each end post to a point.
    # Outside, not inside — a curtain across the head end hides the pillows
    # the player is paying for.
    for px, out in ((front[0], -1), (front[1], 1)):
        tx = px + out * 1.6
        c.poly([(tx - 2.6, rail_y), (tx + 2.6, rail_y),
                (tx + 2.6 + out * 1.4, rail_y + 22.0), (tx + out * 0.4, rail_y + 26.0),
                (tx - 2.6 + out * 1.4, rail_y + 22.0)],
               fill=BLUSH, ink=P["ink"], lw=LW_DETAIL)
        c.line([(tx + out * 0.6, rail_y + 3.0), (tx + out * 0.8, rail_y + 19.0)],
               tint(BLUSH, 0.36), LW_FACE)
    # A rosette at the centre gather and one at each post, where the swags
    # are tied: the knots that make the sag a swag and not a slump.
    for kx in (front[0], cx, front[1]):
        c.circle(kx, rail_y + 0.6, 3.0, fill=ROSE, ink=P["ink"], lw=LW_FACE)
        c.circle(kx - 0.8, rail_y - 0.3, 1.0, fill=tint(ROSE, 0.55))

    leg_h = 5.0
    _legs(c, (x0 + 14.0, x1 - 14.0), fy - leg_h, colour=WHITEWASH, w=4.6, r=1.4)
    mat_y = _bed_body(c, x0 + 7.0, x1 - 7.0, 40.0, quilt=P["white"], base=WHITEWASH,
                      mat_h=8.0, leg_h=leg_h, quilt_from=0.36, legs=False)
    # The turn-down, redrawn in shadow linen: over a white quilt the white
    # fold `_bed_body` draws vanishes, and the underside of a fold is grey.
    qx = x0 + 7.0 + (x1 - x0 - 14.0) * 0.36
    c.rrect(qx + 0.6, mat_y - 3.2, x1 - 7.0 - qx - 1.2, 3.8, r=1.8,
            fill=P["linenSh"], ink=P["ink"], lw=LW_FACE)
    _pillow(c, x0 + 22.0, mat_y - 4.5, 20.0, 10.0, colour=P["white"])
    _pillow(c, x0 + 39.0, mat_y - 3.5, 18.0, 9.0, colour=BLUSH)
    # Three petals, each a small lens at its own angle. Three, scattered:
    # a row of them is a pattern, and a pattern is a printed quilt.
    for px, py, ang in ((qx + 14.0, mat_y + 5.0, -0.5),
                        (qx + 27.0, mat_y + 10.0, 0.4),
                        (qx + 40.0, mat_y + 4.0, 2.6)):
        _blade(c, px, py, ang, 5.2, 2.0, ROSE, droop=0.0)


def rug_roseGarland(c: Canvas) -> None:
    """
    An oval cream rug lying on the floor, its edge a garland of rose-pink
    blooms with green leaves between them, and an ivory heart for a field.

    Oval is the identity — every woven rug is a strip — and the garland is
    drawn *on* the rim rather than inside it, so the outline is a chain of
    bumps and not a smooth ellipse. The heart is one polygon off the
    parametric heart curve, squashed to the rug's own proportions; two discs
    and a triangle left seams the outline picked up.
    """
    cx = c.w / 2
    rx, ry = 30.0, 10.5
    bloom = 2.8
    cy = min(BAND_CY, c.h - ry - bloom + 0.6)
    cream = P["creamHi"]
    ivory = mix(P["white"], cream, 0.22)
    c.ellipse(cx, cy, rx, ry, fill=cream, ink=P["ink"], lw=LW_PROP)
    # The lighter sliver `_band` puts along the top of a strip, on an oval.
    c.pie(cx, cy - 1.0, rx - 5.0, ry - 3.6, 196, 344, fill=tint(cream, 0.45))
    # The heart: point down, lobes up, drawn before the garland so the
    # blooms sit over it if the two ever touch.
    heart = []
    for i in range(40):
        t = 2 * math.pi * i / 40
        hx = 16 * math.sin(t) ** 3
        hy = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        heart.append((cx + hx * 0.74, cy - 1.2 - hy * 0.45))
    c.poly(heart, fill=ivory, ink=shade(ROSE, 0.20), lw=LW_DETAIL)
    c.line([(cx - 4.4, cy - 4.6), (cx - 2.4, cy - 5.6)], tint(ivory, 0.6), LW_FACE)
    # The garland: blooms on the rim with a leaf on the tangent between each
    # pair. Sixteen, not thirty: at 55% a bloom is a two-pixel dot, and dots
    # closer than three pixels fuse into a pink line.
    n = 16
    for i in range(n):
        ang = 2 * math.pi * (i + 0.5) / n
        lx, ly = cx + math.cos(ang) * rx, cy + math.sin(ang) * ry
        # The tangent of an ellipse, for a leaf that follows the rim.
        tang = math.atan2(math.cos(ang) * ry, -math.sin(ang) * rx)
        _blade(c, lx - math.cos(tang) * 2.6, ly - math.sin(tang) * 2.6, tang,
               5.2, 1.7, P["leaf"], droop=0.0)
    for i in range(n):
        ang = 2 * math.pi * i / n
        bx, by = cx + math.cos(ang) * rx, cy + math.sin(ang) * ry
        c.circle(bx, by, bloom, fill=ROSE, ink=P["ink"], lw=LW_FACE)
        c.circle(bx - 0.6, by - 0.6, 0.9, fill=tint(ROSE, 0.55))


def _glass_rose(c: Canvas, cx: float, cy: float, r: float) -> None:
    """
    One blush glass rose in a gold cup, two leaves under it.

    The head is a filled disc with a spiral of two arcs in it: at 40px the
    arcs go and the disc stays, and a pink disc on a gold arm is already
    "not a candle", which is the only thing the head has to say.
    """
    for side in (-1, 1):
        _blade(c, cx + side * 1.4, cy + r * 0.7, math.radians(90 - side * 52), r * 1.25,
               r * 0.34, P["leaf"], droop=0.0)
    c.ellipse(cx, cy + r * 0.86, r * 0.72, r * 0.36, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    c.circle(cx, cy, r, fill=BLUSH, ink=P["ink"], lw=LW_PROP)
    swirl = shade(BLUSH, 0.24)
    c.arc(cx, cy, r * 0.64, r * 0.64, 30, 260, swirl, LW_FACE)
    c.arc(cx + r * 0.12, cy + r * 0.10, r * 0.30, r * 0.30, 170, 420, swirl, LW_FACE)
    c.circle(cx - r * 0.40, cy - r * 0.42, r * 0.22, fill=tint(BLUSH, 0.60))


def lighting_roseChandelier(c: Canvas) -> None:
    """
    A small gold chandelier on a short chain whose three arms end in blush
    glass roses instead of candles — two swept up and out to the sides, one
    hanging beneath the boss — with a soft pink pool of light under it.

    Same bones as the tier-4 chandelier (chain, column, two curved arms) so
    it is unmistakably a chandelier, and then every candle replaced by a
    round pink head: the silhouette is three balls on a stalk, where the
    candle fittings are a row of sticks and the crystal ones a skirt of drops.
    """
    cx = c.w / 2
    drop = 7.0
    _glow(c, cx, drop + 25.0, 18.0, colour=mix(P["wallRose"], P["hairPink"], 0.20))
    _ceiling_plate(c, cx, 11.0, colour=GOLD)
    _chain(c, cx, drop, links=2)
    c.rrect(cx - 2.0, drop, 4.0, 11.0, r=1.6, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    c.line([(cx - 0.6, drop + 1.8), (cx - 0.6, drop + 8.4)], GOLD_HI, 0.8)
    side_x, side_y = 19.0, drop + 9.0
    for side in (-1, 1):
        ex = cx + side * side_x
        # A curved arm, four points like the chandelier's, rising to the
        # rose so the head sits on the arm rather than hanging off it.
        c.line([(cx, drop + 4.0), (cx + side * 8.0, drop + 12.5),
                (cx + side * 14.5, drop + 12.5), (ex, side_y + 2.4)], P["ink"], 3.2)
        c.line([(cx, drop + 4.0), (cx + side * 8.0, drop + 12.5),
                (cx + side * 14.5, drop + 12.5), (ex, side_y + 2.4)], GOLD, 1.8)
        _glass_rose(c, ex, side_y - 2.0, 4.6)
    c.ellipse(cx, drop + 11.6, 5.0, 2.2, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    c.circle(cx - 1.6, drop + 11.0, 0.9, fill=GOLD_HI)
    c.line([(cx, drop + 12.0), (cx, drop + 17.0)], P["ink"], 2.8)
    c.line([(cx, drop + 12.0), (cx, drop + 17.0)], GOLD, 1.5)
    _glass_rose(c, cx, drop + 20.2, 4.8)


# ======================================================== the luxury suite

def rug_ermineHearth(c: Canvas) -> None:
    """
    A white fur hearth rug: a strip whose edge is a run of soft bumps rather
    than a straight hem, a thin gold braid just inside the outline, and the
    black ermine tail-tips scattered across the pile in a staggered diamond.

    The cloud edge is three passes of the same shape — ink, then gold a
    pixel in, then white a pixel further — a rounded body plus a row of
    discs along each side. Drawn as outlined discs the overlaps left a
    lattice of seams across the rim; drawn as fills, the only outline is
    the outer one. The bump radii alternate, because an even row of bumps
    is a gear.
    """
    cx = c.w / 2
    w, h = 62.0, 21.0
    bump = 3.0
    r_bump = 4.4
    y1 = c.h - 1.4
    y0 = y1 - h
    bx, by, bw, bh = cx - w / 2 + bump, y0 + bump, w - bump * 2, h - bump * 2
    discs = []
    n_long = 10
    for i in range(n_long + 1):
        t = i / n_long
        rr = r_bump + (0.5 if i % 2 else -0.4)
        discs.append((bx + bw * t, by, rr))
        discs.append((bx + bw * t, by + bh, rr - 0.2))
    for j in range(1, 3):
        yy = by + bh * j / 3
        discs.append((bx, yy, r_bump + 0.2))
        discs.append((bx + bw, yy, r_bump + 0.2))
    for colour, inset in ((P["ink"], 0.0), (GOLD, 1.3), (P["white"], 2.5)):
        c.rrect(bx - bump + inset, by - bump + inset, bw + bump * 2 - inset * 2,
                bh + bump * 2 - inset * 2, r=4.0, fill=colour)
        for dx, dy, rr in discs:
            c.circle(dx, dy, rr - inset, fill=colour)
    # The pile's underside: a shadow-linen line along the front edge, which
    # is the one mark that lays a white shape down on a floor.
    c.line([(bx + 3.0, by + bh - 0.6), (bx + bw - 3.0, by + bh - 0.6)], P["linenSh"], 1.8)
    c.line([(bx + 4.0, by + 1.4), (bx + bw * 0.42, by + 1.4)], tint(P["linenSh"], 0.5), 1.0)
    # Ermine tips: short black drops in three rows, each row shifted half a
    # pitch — a diamond scatter, and loose enough that they stay separate
    # dashes at 55% rather than a dotted line.
    pitch = 12.0
    for row in range(3):
        yy = by + bh * (0.22 + row * 0.28)
        offset = pitch / 2 if row % 2 else 0.0
        x = bx + 6.0 + offset
        while x < bx + bw - 5.0:
            c.line([(x, yy - 1.3), (x, yy + 1.3)], P["ink"], 1.6)
            c.circle(x, yy + 1.4, 1.1, fill=P["ink"])
            x += pitch


# ===================================================== the presidential suite

def _corona(c: Canvas, cx: float, top: float, half: float) -> float:
    """
    A gold crown seen face-on: a jewelled band and five points with balls on
    them. Returns the band's bottom edge, where the drapes hang from.

    The points are one polygon — five separate spikes on a bar were a comb.
    """
    band_h = 5.0
    band_y = top + 8.0
    pts = [(cx - half, band_y + 1.0)]
    for k in range(5):
        t = k / 4
        px = cx - half + half * 2 * t
        peak = top + (0.0 if k == 2 else 1.6 if k in (1, 3) else 3.2)
        pts.append((px, peak))
        if k < 4:
            pts.append((px + half / 4, band_y - 1.6))
    pts.append((cx + half, band_y + 1.0))
    c.poly(pts, fill=GOLD, ink=P["ink"], lw=LW_PROP)
    for k in range(5):
        px = cx - half + half * 2 * k / 4
        peak = top + (0.0 if k == 2 else 1.6 if k in (1, 3) else 3.2)
        c.circle(px, peak - 0.4, 1.7, fill=GOLD_HI, ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - half - 1.4, band_y, half * 2 + 2.8, band_h, r=1.8,
            fill=GOLD_DK, ink=P["ink"], lw=LW_PROP)
    for k in range(3):
        c.circle(cx + (k - 1) * half * 0.66, band_y + band_h / 2, 1.5,
                 fill=CRIMSON, ink=P["ink"], lw=LW_FACE)
    return band_y + band_h


def _drape(c: Canvas, cx: float, hang_y: float, out: int, x_edge: float,
           tie_y: float, bottom: float) -> None:
    """
    One navy drape from the corona: narrow at the crown, sweeping down and
    out across the wall, pinched by a gold tie-back, flaring to the plinth.

    `out` is the side it sweeps to. Both edges are sampled beziers joined
    into one polygon so the sweep is a curve and the pinch at the tie is a
    real waist, which is what makes a tied-back curtain read as tied.
    """
    def px(u: float) -> float:
        return cx + out * u

    span = abs(x_edge - cx)
    outer = _bez((px(9.0), hang_y), (px(span * 0.72), hang_y + 4.0),
                 (px(span - 1.0), tie_y - 1.0), 8)
    outer += [(px(span - 3.0), tie_y + 3.0), (px(span + 0.6), bottom)]
    inner = [(px(span - 10.0), bottom), (px(span - 8.4), tie_y + 3.0)]
    inner += _bez((px(span - 6.6), tie_y - 1.0), (px(span * 0.62), hang_y + 11.0),
                  (px(2.0), hang_y), 8)
    c.poly(outer + inner, fill=NAVY, ink=P["ink"], lw=LW_PROP)
    # Two fold lines along the sweep, the drape's whole shading.
    for k, off in ((0, 2.8), (1, 6.4)):
        c.line(_bez((px(9.0 - k * 4.0), hang_y + off),
                    (px(span * 0.66), hang_y + off + 6.0),
                    (px(span - 4.6 - k * 1.6), tie_y - 2.0), 8),
               tint(NAVY, 0.28), LW_FACE)
    # The tie-back: a gold cord round the waist and a tassel off it.
    c.line([(px(span - 9.6), tie_y + 0.8), (px(span - 1.4), tie_y + 0.8)], P["ink"], 2.8)
    c.line([(px(span - 9.6), tie_y + 0.8), (px(span - 1.4), tie_y + 0.8)], GOLD, 1.6)
    tx = px(span - 5.6)
    c.line([(tx, tie_y + 1.6), (tx, tie_y + 5.0)], GOLD_DK, 1.0)
    c.rrect(tx - 1.6, tie_y + 5.0, 3.2, 4.6, r=1.2, fill=GOLD, ink=P["ink"], lw=LW_FACE)


def bed_stateBed(c: Canvas) -> None:
    """
    A state bed: a wide crimson-quilted mattress on a two-step gilt dais, a
    gold crown corona high over the middle of the bed, and two navy drapes
    sweeping from under the crown down and out to the ends of the bed, tied
    back with gold cords.

    The crown is centred, as on a lit à la polonaise, rather than over the
    head end: centred, the two drapes make a Λ behind the bed that is
    symmetrical enough to read as one shape at 40px — a crown over a blue
    tent over a red bed on gold steps. The headboard is kept low for the
    same reason: a tall one would break the tent.
    """
    cx = c.w / 2
    x0, x1 = cx - 46.0, cx + 46.0
    fy = _stand(c, cx, 52.0)
    step_h = 5.2
    step2_y = fy - step_h * 2
    hang_y = _corona(c, cx, 1.0, 12.0)
    for out, edge in ((-1, x0 - 2.0), (1, x1 + 2.0)):
        _drape(c, cx, hang_y, out, edge, 33.0, step2_y + 1.0)
    # A low crimson headboard with a gold cap, behind the pillows.
    hx, hw = x0 + 8.0, 15.0
    c.rrect(hx, 22.0, hw, 18.0, r=2.4, fill=CRIMSON, ink=P["ink"], lw=LW_PROP)
    c.rrect(hx - 1.2, 20.6, hw + 2.4, 3.4, r=1.4, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    c.rrect(hx + 3.0, 26.0, hw - 6.0, 9.0, r=2.0, fill=tint(CRIMSON, 0.16), ink=GOLD_DK, lw=LW_FACE)
    # The dais: two gold steps, the lower one wider. Drawn before the divan,
    # which sits on the upper step, so the bed stands on its plinth rather
    # than in front of it.
    for k, inset in ((0, 0.0), (1, 5.0)):
        sy = fy - step_h * (2 - k)
        c.rrect(x0 + inset - 2.0, sy, (x1 - x0) - inset * 2 + 4.0, step_h + 1.0, r=1.6,
                fill=GOLD, ink=P["ink"], lw=LW_PROP)
        c.rect(x0 + inset, sy + 1.2, (x1 - x0) - inset * 2, 1.2, fill=GOLD_HI)
    mat_y = _bed_body(c, x0 + 10.0, x1 - 6.0, 36.0, quilt=CRIMSON, base=shade(CRIMSON, 0.30),
                      mat_h=9.0, leg_h=fy - step2_y + 0.4, quilt_from=0.34, legs=False,
                      hem=GOLD)
    # Quilting: a coarse diamond lattice in a lighter crimson over the quilt,
    # eight pixels apart so it is still a lattice at 55% and not a haze.
    qx = x0 + 10.0 + (x1 - x0 - 16.0) * 0.34
    qy0, qy1 = mat_y - 1.6, mat_y + 9.0 + 3.0
    lat = tint(CRIMSON, 0.30)
    k = 0
    while qx + 3.0 + k * 8.0 < x1 - 8.0:
        lx = qx + 3.0 + k * 8.0
        c.line([(lx, qy1), (lx + 6.0, qy0)], lat, LW_FACE)
        c.line([(lx, qy0), (lx + 6.0, qy1)], lat, LW_FACE)
        k += 1
    _pillow(c, hx + hw + 9.0, mat_y - 4.5, 22.0, 11.0, colour=P["white"])
    _pillow(c, hx + hw + 27.0, mat_y - 3.5, 19.0, 10.0, colour=P["creamHi"])


def _standard(c: Canvas, top, bottom, banner, out: int) -> None:
    """
    One standard: a dark pole from `bottom` to `top` with a gold spearhead
    beyond the top and a ferrule at the foot, and its banner hanging from the
    upper arm, drooping outward (`out` is the side) to a gold-fringed hem
    with one gold star on it.

    The pole is an ink line with a thinner walnut line over it — the outline
    trick for a stroke, since a polygon that thin loses its fill at 55%.
    """
    (tx, ty), (bx, by) = top, bottom
    L = math.hypot(bx - tx, by - ty)
    ux, uy = (tx - bx) / L, (ty - by) / L
    nx, ny = -uy, ux
    c.line([bottom, top], P["ink"], 4.4)
    c.line([bottom, top], WALNUT_DK, 2.6)
    c.line([(bx + nx * 0.6 + ux * 4.0, by + ny * 0.6 + uy * 4.0),
            (tx + nx * 0.6 - ux * 4.0, ty + ny * 0.6 - uy * 4.0)], tint(WALNUT_DK, 0.34), 0.8)
    # The banner: attached along the upper arm, hanging to a level hem.
    a0 = (tx + ux * -5.0, ty + uy * -5.0)
    a1 = (tx + ux * -25.0, ty + uy * -25.0)
    hem_y = ty + 30.0
    swing = out * 3.0
    outer_top, outer_hem = a0, (a0[0] + swing, hem_y)
    inner_top, inner_hem = a1, (a1[0] + swing * 0.4, hem_y)
    c.poly([outer_top, inner_top, inner_hem, outer_hem],
           fill=banner, ink=P["ink"], lw=LW_PROP)

    # One fold line a fifth of the way in from the free edge. It is placed
    # by interpolating between the two edges at each end, because a line
    # offset from the top corner alone ran outside the cloth: the free edge
    # swings, and the fold has to swing with it.
    def fold(s: float, k: float) -> tuple[float, float]:
        ox = outer_top[0] + (outer_hem[0] - outer_top[0]) * s
        oy = outer_top[1] + (outer_hem[1] - outer_top[1]) * s
        ix = inner_top[0] + (inner_hem[0] - inner_top[0]) * s
        iy = inner_top[1] + (inner_hem[1] - inner_top[1]) * s
        return (ox + (ix - ox) * k, oy + (iy - oy) * k)

    c.line([fold(0.22, 0.2), fold(0.9, 0.2)], tint(banner, 0.22), LW_FACE)
    # Fringe: gold stubs hanging off the hem, coarse enough to stay stubs.
    fx0, fx1 = a1[0] + swing * 0.4, a0[0] + swing
    for i in range(6):
        fx = fx0 + (fx1 - fx0) * (i + 0.5) / 6
        c.line([(fx, hem_y + 0.4), (fx, hem_y + 3.2)], GOLD, 1.5)
    c.line([(fx0, hem_y + 0.2), (fx1, hem_y + 0.2)], GOLD_DK, 1.2)
    star_x = (a0[0] + a1[0]) / 2 + swing * 0.6
    star_y = (a1[1] + hem_y) / 2 + 2.0
    _star(c, star_x, star_y, 5.0, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    # Spearhead: a leaf on the axis with a gold collar at its base.
    head = 8.0
    c.poly([(tx + ux * head, ty + uy * head),
            (tx + ux * 2.4 + nx * 2.8, ty + uy * 2.4 + ny * 2.8),
            (tx - ux * 0.6, ty - uy * 0.6),
            (tx + ux * 2.4 - nx * 2.8, ty + uy * 2.4 - ny * 2.8)],
           fill=GOLD, ink=P["ink"], lw=LW_FACE)
    c.circle(tx, ty, 2.2, fill=GOLD_DK, ink=P["ink"], lw=LW_FACE)
    c.circle(bx, by, 2.0, fill=GOLD, ink=P["ink"], lw=LW_FACE)


def wallArt_crossedStandards(c: Canvas) -> None:
    """
    Two ceremonial standards crossed in an X on the wall — dark poles, gold
    spearheads, a crimson banner on one and a navy on the other, each fringed
    in gold with a single gold star — a gilt laurel medallion over the
    crossing and two tassels hanging under it.

    No frame: the X is the silhouette, and it is drawn to the same footprint
    `_art_frame` would give a picture so it fills the slot the way a frame
    does. The banners hang from the *upper* arms only, and stop well above
    the lower ones, so the X stays an X under them rather than a medallion
    on two flags.
    """
    cx, cy = c.w / 2, c.h / 2
    half_w, half_h = 33.0, 23.0
    _standard(c, (cx - half_w, cy - half_h), (cx + half_w, cy + half_h), CRIMSON, -1)
    _standard(c, (cx + half_w, cy - half_h), (cx - half_w, cy + half_h), NAVY, 1)
    # The medallion: a gold disc, a ring of laurel dashes, a lighter boss.
    c.circle(cx, cy, 9.6, fill=GOLD, ink=P["ink"], lw=LW_PROP)
    for i in range(10):
        ang = math.radians(i * 36 + 18)
        rr = 7.0
        px, py = cx + math.cos(ang) * rr, cy + math.sin(ang) * rr
        tx, ty = -math.sin(ang), math.cos(ang)
        c.line([(px - tx * 1.8, py - ty * 1.8), (px + tx * 1.8, py + ty * 1.8)],
               mix(P["greenDk"], GOLD_DK, 0.45), 1.4)
    c.circle(cx, cy, 4.4, fill=GOLD_HI, ink=P["ink"], lw=LW_FACE)
    c.circle(cx - 1.4, cy - 1.6, 1.1, fill=P["white"])
    # Two tassels off the medallion, spread so they clear the lower poles.
    for side in (-1, 1):
        tx = cx + side * 4.6
        c.line([(tx, cy + 8.0), (tx + side * 1.0, cy + 14.0)], GOLD_DK, 1.2)
        c.rrect(tx + side * 1.0 - 2.0, cy + 14.0, 4.0, 3.2, r=1.2,
                fill=GOLD, ink=P["ink"], lw=LW_FACE)
        for k in range(3):
            fx = tx + side * 1.0 - 1.4 + k * 1.4
            c.line([(fx, cy + 17.2), (fx, cy + 20.6)], GOLD, 1.1)


PIECES = {
    "bed_petalCanopy":          bed_petalCanopy,
    "rug_roseGarland":          rug_roseGarland,
    "lighting_roseChandelier":  lighting_roseChandelier,
    "bed_leatherWingback":      bed_leatherWingback,
    "lighting_bankersPendant":  lighting_bankersPendant,
    "wallArt_worldClocks":      wallArt_worldClocks,
    "rug_ermineHearth":         rug_ermineHearth,
    "bed_stateBed":             bed_stateBed,
    "wallArt_crossedStandards": wallArt_crossedStandards,
}
