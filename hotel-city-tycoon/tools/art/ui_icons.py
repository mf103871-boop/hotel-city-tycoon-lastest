"""
The thirteen pictures the player looks at most.

A room is seen when the camera is over it. A coin, a shift timer and a hazard
badge are on screen constantly, and the hazard badges are seen at *18 pixels*
composited over a room — barely a third of the size they are drawn at. That one
fact drives every decision in this file:

* **Silhouette carries everything.** Each icon is one nameable shape — a pile,
  a gem, a dial, a bug, a flame, a ghost — and the detail inside it is there to
  reward a close look, never to make the reading. Squint until the icon is a
  blob: the blob has to still be the right blob.
* **A hazard is a badge, not furniture.** Every effect sits on a filled disc or
  shield with a thick rim, so it reads as a marker stuck onto the hotel rather
  than as another object inside the room. Round for the three hazards that
  happen *to a room*, shield for the three that happen *to the whole hotel* —
  the same split `data/events.json` makes with its `scope` field.
* **Colour is the second signal, never the first.** ART-0 §7 forbids a danger
  state told by hue alone, so no two badges share a symbol shape either; the
  colour only makes the row of them easier to scan.

Line weights are heavier here than in a room. ART-0 §6 fixes the *ratio* between
frame, prop and detail rather than absolute numbers, and an icon shrunk to 28%
loses a 1.4px outline entirely — so the badge rim is the icon's frame and gets
frame weight, and the symbol inside it gets prop weight one step up.
"""
from __future__ import annotations

import math

from hcstyle import (
    P, Canvas, LW_DETAIL, LW_FACE, alpha, shade, tint,
)

#: The rim of a badge or a coin: this art's equivalent of a room's frame.
LW_RIM = 2.6
#: The outline of the symbol standing on the badge.
LW_SYM = 1.8


# ------------------------------------------------------------------ geometry
#
# Three small path builders. Pillow draws polygons, not curves, so anything
# rounder than a rectangle is sampled here into points first — coarsely enough
# to stay cheap, finely enough that the supersampled canvas hides the chords.

def _arc_pts(cx, cy, r, a0, a1, n=10):
    """Points along a circular arc, in Pillow's clockwise-from-3-o'clock angles."""
    return [(cx + math.cos(math.radians(a)) * r, cy + math.sin(math.radians(a)) * r)
            for a in (a0 + (a1 - a0) * i / n for i in range(n + 1))]


def _bez(p0, p1, p2, p3, n=12):
    """A cubic bezier as points. The only way to get a flame or a shield tip."""
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1.0 - t
        out.append((u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]))
    return out


def _star_pts(cx, cy, r, points=5, inner=0.46):
    pts = []
    for i in range(points * 2):
        a = math.pi / points * i - math.pi / 2
        rr = r if i % 2 == 0 else r * inner
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    return pts


def _sparkle(c: Canvas, cx, cy, r, colour=None):
    """
    The four-point glint that says "currency".

    Concave sides, not a plus sign: at 24 pixels a plus reads as a medical
    cross, which is a different icon in a different game.
    """
    c.poly(_star_pts(cx, cy, r, points=4, inner=0.26),
           fill=colour or P["creamHi"], ink=P["ink"], lw=LW_FACE)


# -------------------------------------------------------------------- badges

def _round_badge(c: Canvas, fill, r=27.0):
    """
    The disc a room-scoped hazard sits on. Returns its centre.

    The pale crescent inside the top-left is the only shading in the file: one
    mark, at low opacity, so the badge reads as a raised button rather than a
    sticker, without breaking ART-0 §8's ban on gradients.
    """
    cx, cy = c.w / 2, c.h / 2
    c.circle(cx, cy, r, fill=fill, ink=P["ink"], lw=LW_RIM)
    c.arc(cx, cy, r - 3.6, r - 3.6, 190, 268, alpha(P["white"], 0.45), 2.4)
    return cx, cy


def _shield_badge(c: Canvas, fill, top=4.5, w=50.0, h=54.0, r=9.5):
    """
    The shield a hotel-wide event sits on. Returns its centre of mass.

    Rounded shoulders and a soft point: a heraldic shield with straight edges
    is a sharp shape in a game with none, and the point is what stops it being
    mistaken for the disc at a glance.
    """
    cx = c.w / 2
    left, right = cx - w / 2, cx + w / 2
    waist = top + h * 0.46
    pts = _arc_pts(left + r, top + r, r, 180, 270, 7)
    pts += _arc_pts(right - r, top + r, r, 270, 360, 7)
    pts += [(right, waist)]
    pts += _bez((right, waist), (right, top + h * 0.80),
                (cx + w * 0.22, top + h * 0.96), (cx, top + h), 12)[1:]
    pts += _bez((cx, top + h), (cx - w * 0.22, top + h * 0.96),
                (left, top + h * 0.80), (left, waist), 12)[1:]
    c.poly(pts, fill=fill, ink=P["ink"], lw=LW_RIM)
    c.arc(cx, top + h * 0.42, w / 2 - 3.8, h * 0.40 - 3.0, 195, 262,
          alpha(P["white"], 0.45), 2.4)
    return cx, top + h * 0.44


# ------------------------------------------------------------------ currency

def _coin(c: Canvas, cx, cy, r, hero=False):
    """One coin, face on. The hero of the pile is the only one that is minted."""
    c.circle(cx, cy, r, fill=P["gold"], ink=P["ink"], lw=LW_SYM)
    if hero:
        # A rim groove and a star: the two marks that turn a yellow circle into
        # money. Both live inside 70% of the radius so the outline stays the
        # strongest line even when the icon is halved.
        c.circle(cx, cy, r * 0.70, ink=P["goldDk"], lw=LW_DETAIL)
        c.poly(_star_pts(cx, cy + 0.2, r * 0.40), fill=P["goldDk"])
    c.arc(cx, cy, r - 2.6, r - 2.6, 188, 250, alpha(P["creamHi"], 0.95), 2.0)


def coins(c: Canvas) -> None:
    """
    A pile of gold, not a column.

    Stacked edge-on the coins would need ellipses, and an ellipse is a camera
    angle — which this game does not have. Three overlapping faces in a
    triangle give the same "more than one" reading with the front stayed flat.
    """
    cx = c.w / 2
    _coin(c, cx - 11.0, 18.5, 9.6)
    _coin(c, cx + 10.5, 16.5, 9.0)
    _coin(c, cx, 32.0, 13.5, hero=True)
    _sparkle(c, cx + 18.0, 8.0, 4.2)


def gems(c: Canvas) -> None:
    """
    The premium currency: one cut stone, five facets.

    Cyan rather than the usual purple because the hotel's own accents are coral
    and gold — a gem in a warm hue would read as a bigger coin. The facets are
    three flat values of one colour, which is how a flat-vector gem sparkles:
    by the *pattern* of the cut, never by a gradient.
    """
    cx = c.w / 2
    top, tip = 11.0, 44.0
    shoulder = 20.5
    tw, sw = 8.6, 16.0        # half-widths of the table and of the shoulders
    inner = 10.4              # where the pavilion facets meet the girdle

    body = [(cx - tw, top), (cx + tw, top), (cx + sw, shoulder),
            (cx, tip), (cx - sw, shoulder)]
    c.poly(body, fill=P["water"])
    # Crown: a bright table between two mid-tone shoulders.
    c.poly([(cx - tw, top), (cx + tw, top), (cx + inner, shoulder), (cx - inner, shoulder)],
           fill=tint(P["water"], 0.44))
    c.poly([(cx + tw, top), (cx + sw, shoulder), (cx + inner, shoulder)], fill=P["waterDk"])
    # Pavilion: the right side takes the shadow, so the stone has a light source
    # without anything being shaded twice.
    c.poly([(cx + inner, shoulder), (cx + sw, shoulder), (cx, tip)], fill=P["waterDk"])
    c.poly([(cx - inner, shoulder), (cx - sw, shoulder), (cx, tip)], fill=tint(P["water"], 0.16))
    for a, b in (((cx - inner, shoulder), (cx, tip)), ((cx + inner, shoulder), (cx, tip)),
                 ((cx - sw, shoulder), (cx + sw, shoulder)),
                 ((cx - tw, top), (cx - inner, shoulder)), ((cx + tw, top), (cx + inner, shoulder))):
        c.line([a, b], P["ink"], LW_DETAIL)
    c.poly(body, ink=P["ink"], lw=LW_SYM)
    # One glint on the table, and one loose sparkle beside the stone.
    c.rrect(cx - 5.8, top + 2.6, 5.0, 2.2, r=1.1, fill=alpha(P["white"], 0.85))
    _sparkle(c, cx + 16.0, 10.5, 4.2, P["white"])


# --------------------------------------------------------------------- shifts
#
# Five buttons a player picks between in one row, so they must differ in three
# ways at once: how far the ring has swept, where the short hand points, and
# what colour the whole dial is tinted. Any one of the three alone fails —
# colour alone is banned outright by ART-0 §7, and a sweep alone is hard to
# judge without the neighbour to compare it to.

#: name, how much of the ring is filled, dial accent, hour-hand angle from 12.
_SHIFTS = (
    ("2h",  0.14, P["green"],     52.0),
    ("6h",  0.32, P["gold"],     118.0),
    ("12h", 0.55, P["coral"],    198.0),
    ("24h", 0.78, P["wallGrape"], 282.0),
    ("48h", 1.00, P["roomBlue"], 336.0),
)


def _shift(frac: float, accent, hand_deg: float):
    def draw(c: Canvas) -> None:
        cx, cy, r = c.w / 2, c.h / 2 + 2.0, 23.0
        # The stem. A bare circle is a plate; a circle with a button on top is a
        # stopwatch, and a stopwatch is the only clock a player reads as "how
        # long will this take" rather than "what time is it".
        c.rrect(cx - 5.4, cy - r - 7.2, 10.8, 8.4, r=3.2,
                fill=P["metal"], ink=P["ink"], lw=LW_SYM)
        c.circle(cx, cy, r, fill=tint(accent, 0.88), ink=P["ink"], lw=LW_RIM)
        # The track, then the sweep over it: the empty part of the ring has to
        # be visible or a short shift looks like a broken long one.
        c.arc(cx, cy, 18.4, 18.4, 0, 360, P["linenSh"], 4.6)
        c.arc(cx, cy, 18.4, 18.4, -90, -90 + 360 * frac, accent, 4.6)
        a = math.radians(hand_deg)
        c.line([(cx, cy), (cx + math.sin(a) * 9.6, cy - math.cos(a) * 9.6)], P["ink"], 2.8)
        c.line([(cx, cy), (cx, cy - 13.6)], P["ink"], 2.2)
        c.circle(cx, cy, 2.4, fill=accent, ink=P["ink"], lw=LW_FACE)
        c.arc(cx, cy, r - 3.2, r - 3.2, 198, 258, alpha(P["white"], 0.7), 2.2)
    return draw


# --------------------------------------------------------------------- pest

def pest(c: Canvas) -> None:
    """
    A cockroach, seen from above — the one view where a beetle is unmistakable.

    Drawn cute rather than accurate: two pale eyes and a rounded shell, because
    this is a family game and the badge has to say "clean me" rather than
    "close the app". The legs go down before the body so the shell hides where
    they join, which is what keeps the silhouette a single blob at 18 pixels.
    """
    cx, _ = _round_badge(c, P["leaf"])
    cy = 34.0
    for side in (-1, 1):
        for y0, y1, x1 in ((-6.5, -12.5, 15.5), (0.5, 3.0, 17.5), (6.5, 12.0, 14.5)):
            c.line([(cx + side * 6.0, cy + y0), (cx + side * x1, cy + y1)], P["ink"], 2.2)
    for side in (-1, 1):
        c.line([(cx + side * 2.2, cy - 13.5), (cx + side * 10.5, cy - 22.0)], P["ink"], 1.8)
    c.circle(cx, cy - 11.5, 5.6, fill=P["woodDk"], ink=P["ink"], lw=LW_SYM)
    for side in (-1, 1):
        c.circle(cx + side * 2.3, cy - 12.4, 1.5, fill=P["creamHi"], ink=P["ink"], lw=LW_FACE)
    c.ellipse(cx, cy + 3.0, 11.2, 13.6, fill=P["woodDk"], ink=P["ink"], lw=LW_SYM)
    c.ellipse(cx, cy - 6.0, 9.4, 5.6, fill=P["wood"], ink=P["ink"], lw=LW_DETAIL)
    c.line([(cx, cy - 1.0), (cx, cy + 14.0)], P["ink"], LW_DETAIL)


# --------------------------------------------------------------------- fire

def _flame_pts(cx, base_y, w, h):
    """
    A flame in five curves: a fat rounded base, a leaning tip, and one kink.

    The kink on the left edge is the whole difference between a flame and a
    leaf. It is placed at mid-height, where it is still two pixels wide once
    the badge is composited at 18 — any higher and the tip swallows it.
    """
    half = w / 2
    lo = (cx - half, base_y - h * 0.30)
    bot = (cx, base_y)
    hi = (cx + half, base_y - h * 0.30)
    tip = (cx + w * 0.06, base_y - h)
    kink = (cx - half * 0.64, base_y - h * 0.52)
    pts = _bez(lo, (cx - half, base_y - h * 0.05), (cx - half * 0.50, base_y), bot, 8)
    pts += _bez(bot, (cx + half * 0.50, base_y), (cx + half, base_y - h * 0.05), hi, 8)[1:]
    pts += _bez(hi, (cx + half * 1.06, base_y - h * 0.56), (cx + half * 0.52, base_y - h * 0.82),
                tip, 12)[1:]
    pts += _bez(tip, (cx - half * 0.30, base_y - h * 0.88), (cx - half * 0.78, base_y - h * 0.70),
                kink, 10)[1:]
    pts += _bez(kink, (cx - half * 0.52, base_y - h * 0.42), (cx - half * 1.10, base_y - h * 0.46),
                lo, 10)[1:]
    return pts


def fire(c: Canvas) -> None:
    """
    A flame on red. The same curve drawn twice, nested, and nothing else.

    The hot core is the brighter of the two, which is both true and useful: the
    pale centre keeps the badge from turning into one solid orange lozenge when
    it is composited over a warm-walled room.
    """
    cx, cy = _round_badge(c, P["coral"])
    c.poly(_flame_pts(cx - 0.5, cy + 17.0, 25.0, 35.0), fill=P["gold"], ink=P["ink"], lw=LW_SYM)
    c.poly(_flame_pts(cx + 0.8, cy + 14.5, 13.0, 20.0), fill=P["creamHi"], ink=P["ink"], lw=LW_FACE)


# -------------------------------------------------------------------- ghost

def ghost(c: Canvas) -> None:
    """
    A friendly haunting. Round head, scalloped hem, arms out.

    The arms are drawn first and then buried under the body, so only their
    outer halves survive: that is how a two-colour cartoon ghost gets a lumpy
    silhouette without a single seam showing inside it.
    """
    cx, _ = _round_badge(c, P["wallGrape"])
    head_cy, half = 27.0, 13.0
    base = 45.0
    for side in (-1, 1):
        c.circle(cx + side * (half + 2.2), head_cy + 8.5, 5.0,
                 fill=P["white"], ink=P["ink"], lw=LW_SYM)

    pts = _arc_pts(cx, head_cy, half, 180, 360, 16)
    pts += [(cx + half, base)]
    lobe = 2 * half / 3
    for i in range(3):
        # Three soft lobes of hem, walked right to left because that is the
        # direction the rest of the path runs — laying them out left to right
        # crosses the outline over itself and fills the tail solid.
        x0 = cx + half - i * lobe
        for k in range(10):
            t = k / 9.0
            pts.append((x0 - lobe * t, base + math.sin(math.pi * t) * 5.6))
    pts += [(cx - half, head_cy)]
    c.poly(pts, fill=P["white"], ink=P["ink"], lw=LW_SYM)

    for side in (-1, 1):
        c.ellipse(cx + side * 5.4, head_cy - 0.5, 2.5, 3.1, fill=P["ink"])
        c.circle(cx + side * 5.4 - 0.9, head_cy - 1.4, 0.9, fill=P["white"])
        c.ellipse(cx + side * 10.2, head_cy + 5.0, 2.6, 1.7, fill=alpha(P["blush"], 0.75))
    c.ellipse(cx, head_cy + 7.6, 2.4, 3.0, fill=P["ink"])


# --------------------------------------------------------------- inspection

def inspection(c: Canvas) -> None:
    """
    The inspector is coming: a clipboard, ticked, with a rosette pinned to it.

    The clipboard alone reads as paperwork; the rosette alone reads as a prize.
    Together they read as a grading, which is what an inspection actually is —
    and the rosette is the part that survives the shrink, so it hangs off the
    corner where nothing else competes with it.
    """
    cx, _ = _shield_badge(c, P["cream"])
    bx, by, bw, bh = cx - 14.5, 12.0, 29.0, 33.0
    c.rrect(bx, by, bw, bh, r=3.0, fill=shade(P["woodDk"], 0.24), ink=P["ink"], lw=LW_SYM)
    c.rrect(bx + 4.0, by + 5.0, bw - 8.0, bh - 9.0, r=1.8, fill=P["white"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - 5.6, by - 3.4, 11.2, 7.0, r=2.4, fill=P["metal"], ink=P["ink"], lw=LW_DETAIL)
    for i, wide in enumerate((13.0, 9.5)):
        c.line([(bx + 6.0, by + 10.0 + i * 5.2), (bx + 6.0 + wide, by + 10.0 + i * 5.2)],
               alpha(P["ink2"], 0.55), LW_DETAIL)
    c.line([(bx + 6.5, by + 23.5), (bx + 11.0, by + 28.0), (bx + 20.5, by + 16.0)],
           P["green"], 3.0)
    rx, ry = cx + 10.5, by + bh - 6.0
    for side in (-1, 1):
        c.poly([(rx + side * 3.0, ry + 2.0), (rx + side * 6.4, ry + 10.5),
                (rx + side * 0.4, ry + 7.5)], fill=P["coral"], ink=P["ink"], lw=LW_FACE)
    c.circle(rx, ry, 8.0, fill=P["gold"], ink=P["ink"], lw=LW_SYM)
    c.poly(_star_pts(rx, ry + 0.2, 4.8), fill=P["goldDk"])


# ----------------------------------------------------------------- heat wave

def heat_wave(c: Canvas) -> None:
    """
    A sun big enough to be the whole picture.

    Coral rays behind a gold disc rather than one flat yellow star: the two
    values give the sun an edge against the pale sky it sits on, and the rays
    stay legible even when they are two pixels long.
    """
    cx, _ = _shield_badge(c, P["skyHi"])
    cy, disc, reach = 29.0, 12.8, 22.5
    for i in range(8):
        a = math.radians(i * 45.0 - 90.0)
        n = (math.cos(a), math.sin(a))
        t = (-n[1], n[0])
        c.poly([(cx + n[0] * reach, cy + n[1] * reach),
                (cx + n[0] * disc * 0.86 + t[0] * 4.6, cy + n[1] * disc * 0.86 + t[1] * 4.6),
                (cx + n[0] * disc * 0.86 - t[0] * 4.6, cy + n[1] * disc * 0.86 - t[1] * 4.6)],
               fill=P["coral"], ink=P["ink"], lw=LW_FACE)
    c.circle(cx, cy, disc, fill=P["gold"], ink=P["ink"], lw=LW_SYM)
    c.arc(cx, cy, disc - 3.2, disc - 3.2, 192, 262, alpha(P["creamHi"], 0.95), 2.4)


# ----------------------------------------------------------------- cold snap

def cold_snap(c: Canvas) -> None:
    """
    A snowflake, drawn twice: once fat in navy, once thin in white on top.

    Outlining six branching arms as closed shapes would be a hundred points and
    would fill with mud at 18 pixels. Stroking the same path at two widths gives
    every arm the same dark edge the rest of the art has, for a tenth of the
    work, and keeps the flake readable down to a white asterisk.
    """
    cx, _ = _shield_badge(c, P["roomBlue"])
    cy, r = 28.0, 21.0
    segs = []
    for i in range(6):
        a = math.radians(i * 60.0 - 90.0)
        dx, dy = math.cos(a), math.sin(a)
        segs.append([(cx, cy), (cx + dx * r, cy + dy * r)])
        for at, blen in ((0.50, 0.34), (0.86, 0.17)):
            bx, by = cx + dx * r * at, cy + dy * r * at
            for side in (-1, 1):
                a2 = a + side * math.radians(54.0)
                segs.append([(bx, by), (bx + math.cos(a2) * r * blen, by + math.sin(a2) * r * blen)])
    for seg in segs:
        c.line(seg, P["ink"], 4.8)
    for seg in segs:
        c.line(seg, P["white"], 2.9)
    c.circle(cx, cy, 3.8, fill=P["white"], ink=P["ink"], lw=LW_FACE)


ICONS = {
    "ui/coins.png": coins,
    "ui/gems.png": gems,
    **{f"ui/shift_{name}.png": _shift(frac, accent, hand)
       for name, frac, accent, hand in _SHIFTS},
    "effects/pest.png": pest,
    "effects/fire.png": fire,
    "effects/inspection.png": inspection,
    "effects/ghost.png": ghost,
    "effects/heatWave.png": heat_wave,
    "effects/coldSnap.png": cold_snap,
}
