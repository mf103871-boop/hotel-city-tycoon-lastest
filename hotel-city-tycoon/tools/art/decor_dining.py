"""
The cafe, the restaurant and the bar.

Three rooms that sell food and drink, and between them owned three pieces of
the catalogue: an espresso bar, a prep station and a mini fridge. Nothing to
sit on, nothing to eat off, and a restaurant with a decor target of seven
hundred points had to reach it out of wallpaper.

The pieces here are drawn against what those rooms already paint. The cafe's
counter, the bar's back-bar and the restaurant's kitchen pass are part of the
building and stay part of it; what is added is the furniture in front of them —
the tables people sit at, the stools they sit on, the trolley the drinks arrive
on — and the two service machines that belong on a counter rather than to it.
"""
from __future__ import annotations

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    alpha, shade, tint, mix, math,
)

from decor_props import _stand, _legs, _splay_leg, _box, _bottles, _buttons
from decor_surfaces import _chain, _ceiling_plate, _glow, _candle


# -------------------------------------------------------------- restaurant

def table_diningTable(c: Canvas) -> None:
    """
    A laid table: a round top under a cloth to the floor, and one place set.

    The cloth is what makes this a restaurant table rather than a cafe one —
    no legs show, and the silhouette is a bell.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 24.0)
    top_y = fy - 30.0
    cloth = mix(P["linen"], P["cream"], 0.30)
    c.poly([(cx - 17.0, top_y + 2.0), (cx + 17.0, top_y + 2.0),
            (cx + 24.0, fy - 1.0), (cx - 24.0, fy - 1.0)],
           fill=cloth, ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx, top_y + 2.0, 17.0, 5.0, fill=tint(cloth, 0.22),
              ink=P["ink"], lw=LW_DETAIL)
    for i in range(3):
        x = cx - 12.0 + i * 12.0
        c.line([(x, top_y + 6.0), (x + (i - 1) * 2.0, fy - 2.0)],
               shade(cloth, 0.12), 1.2)
    # The setting: a plate, a folded napkin and a bud vase.
    c.ellipse(cx - 5.0, top_y + 1.0, 6.4, 2.4, fill=P["white"],
              ink=P["ink"], lw=LW_FACE)
    c.ellipse(cx - 5.0, top_y + 0.6, 3.2, 1.2, fill=shade(P["white"], 0.10))
    c.poly([(cx + 4.0, top_y + 1.6), (cx + 9.0, top_y + 0.4), (cx + 7.0, top_y + 3.0)],
           fill=P["coral"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx + 11.0, top_y - 7.0, 4.0, 8.4, r=1.4,
            fill=alpha(P["glass"], 0.75), ink=P["ink"], lw=LW_FACE)
    c.circle(cx + 13.0, top_y - 9.0, 2.2, fill=P["coral"], ink=P["ink"], lw=LW_FACE)


def storage_wineRack(c: Canvas) -> None:
    """
    A rack of diamond cells with bottle ends showing in some of them.

    A bottle end at this size is a disc with a darker centre; more than nine of
    them and the whole rack turns into a dotted grid.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 24.0)
    x0, w = cx - 24.0, 48.0
    top = fy - 42.0
    c.rrect(x0 - 2.0, top - 2.0, w + 4.0, fy - top - 2.0, r=2.4,
            fill=P["woodDk"], ink=P["ink"], lw=LW_PROP)
    c.rect(x0, top, w, fy - top - 6.0, fill=shade(P["woodDk"], 0.26))
    # Two rows of three diamonds. Cross members first, cells punched over them.
    for row in range(2):
        cy = top + 9.0 + row * 15.0
        for col in range(3):
            ccx = x0 + 8.0 + col * 16.0
            c.poly([(ccx, cy - 7.0), (ccx + 7.5, cy), (ccx, cy + 7.0), (ccx - 7.5, cy)],
                   fill=mix(P["woodDk"], P["ink2"], 0.45), ink=P["woodPale"], lw=LW_FACE)
            if (row + col) % 3 != 2:
                c.circle(ccx, cy, 3.6, fill=mix(P["greenDk"], P["ink2"], 0.25),
                         ink=P["ink"], lw=LW_FACE)
                c.circle(ccx, cy, 1.4, fill=P["black"])
    c.rrect(x0 - 3.0, fy - 6.0, w + 6.0, 6.0, r=1.6, fill=P["wood"],
            ink=P["ink"], lw=LW_DETAIL)


def lighting_candelabra(c: Canvas) -> None:
    """
    An iron ring of candles on three chains.

    The existing `lighting_chandelier` is glass and tiers; this one is metal and
    flame, so its ring is drawn thin and dark and the light comes only from the
    candles standing on it.
    """
    cx = c.w / 2
    drop = 14.0
    _ceiling_plate(c, cx, 11.0, colour=P["metalDk"])
    for dx in (-9.0, 0.0, 9.0):
        c.line([(cx, 2.0), (cx + dx, drop + 4.0)], P["metalDk"], 1.4)
    ring_y = drop + 6.0
    _glow(c, cx, ring_y - 3.0, 24.0)
    c.ellipse(cx, ring_y, 22.0, 5.0, ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx, ring_y, 22.0, 5.0, fill=None, ink=P["metalDk"], lw=LW_DETAIL)
    c.arc(cx, ring_y, 22.0, 5.0, 0, 360, P["ink"], 2.2)
    for i in range(5):
        ang = math.pi * (0.08 + i * 0.21)
        px = cx - math.cos(ang) * 20.0
        py = ring_y + math.sin(ang) * 4.0
        c.rrect(px - 1.6, py - 3.0, 3.2, 4.0, r=1.0, fill=P["metalDk"],
                ink=P["ink"], lw=LW_FACE)
        _candle(c, px, py - 3.0, s=0.86)


# -------------------------------------------------------------------- cafe

def seating_cafeChair(c: Canvas) -> None:
    """
    A bentwood chair: a hoop back, one splat and splayed round legs.

    Everything about it is thinner than `seating_armchair`, which is the point
    — the two share a room and must not read as the same object.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 13.0)
    seat_y = fy - 20.0
    back_top = seat_y - 20.0
    # Hoop: two uprights closed by an arc.
    for side in (-1, 1):
        c.line([(cx + side * 8.0, seat_y - 1.0), (cx + side * 7.0, back_top + 4.0)],
               P["woodDk"], 2.4)
    c.arc(cx, back_top + 5.0, 7.5, 5.0, 180, 360, P["woodDk"], 2.6)
    c.line([(cx, back_top + 6.0), (cx, seat_y - 1.0)], P["woodDk"], 2.0)
    c.ellipse(cx, seat_y, 11.5, 3.6, fill=P["wood"], ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx, seat_y - 0.8, 8.0, 2.0, fill=tint(P["wood"], 0.22))
    for side in (-1, 1):
        _splay_leg(c, cx + side * 7.5, seat_y + 1.5, side * 3.0, w=3.2)
    c.line([(cx - 7.0, fy - 7.0), (cx + 7.0, fy - 7.0)], P["woodDk"], 1.6)


def table_cafeTable(c: Canvas) -> None:
    """A bistro table: one cast pedestal, a three-toed foot, a cup on top."""
    cx = c.w / 2
    fy = _stand(c, cx, 15.0)
    top_y = fy - 28.0
    c.ellipse(cx, top_y, 15.0, 4.4, fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx, top_y - 1.0, 11.0, 2.6, fill=P["white"])
    c.rect(cx - 2.2, top_y + 2.0, 4.4, fy - top_y - 8.0, fill=P["ink2"])
    c.rrect(cx - 2.2, top_y + 2.0, 4.4, fy - top_y - 8.0, r=1.0,
            ink=P["ink"], lw=LW_FACE)
    for dx in (-9.0, 0.0, 9.0):
        c.line([(cx, fy - 8.0), (cx + dx, fy - 2.0)], P["ink2"], 2.6)
    c.ellipse(cx, fy - 2.0, 10.0, 2.4, fill=P["ink2"], ink=P["ink"], lw=LW_FACE)
    # Cup and saucer, the whole reason the top is left plain.
    c.ellipse(cx + 4.0, top_y - 1.6, 4.4, 1.6, fill=P["white"],
              ink=P["ink"], lw=LW_FACE)
    c.rrect(cx + 1.6, top_y - 6.4, 5.0, 4.6, r=1.2, fill=P["white"],
            ink=P["ink"], lw=LW_FACE)
    c.arc(cx + 7.0, top_y - 4.4, 2.0, 2.0, 270, 90, P["ink"], 1.2)


def appliance_cakeDisplay(c: Canvas) -> None:
    """
    A refrigerated cake case, two shelves, three cakes with a slice out.

    The curved glass front is the one place in this module `alpha()` belongs:
    the room behind it should show through, and a solid pane would read as a
    grey slab.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 24.0)
    x0, w = cx - 24.0, 48.0
    top = fy - 44.0
    c.rrect(x0, fy - 14.0, w, 14.0, r=2.0, fill=P["metal"],
            ink=P["ink"], lw=LW_PROP)
    c.rect(x0 + 3.0, fy - 11.0, w - 6.0, 2.0, fill=tint(P["metal"], 0.35))
    c.rrect(x0, top, w, 32.0, r=3.0, fill=alpha(P["glass"], 0.42),
            ink=P["ink"], lw=LW_PROP)
    for row in range(2):
        sy = top + 12.0 + row * 12.0
        c.rrect(x0 + 2.0, sy, w - 4.0, 2.4, r=1.0, fill=P["metal"],
                ink=P["ink"], lw=LW_FACE)
        for i in range(2 if row else 1):
            ccx = x0 + 13.0 + i * 20.0 + row * 4.0
            colour = (P["coral"], P["cream"])[i % 2]
            # A round cake with one wedge taken out of it: the ellipse top is
            # what says cake, and the missing wedge is what says it is for sale.
            c.rrect(ccx - 7.0, sy - 8.0, 14.0, 8.0, r=1.6, fill=colour,
                    ink=P["ink"], lw=LW_FACE)
            c.ellipse(ccx, sy - 8.0, 7.0, 2.4, fill=tint(colour, 0.34),
                      ink=P["ink"], lw=LW_FACE)
            c.poly([(ccx + 2.4, sy - 8.4), (ccx + 7.0, sy - 7.0), (ccx + 7.0, sy),
                    (ccx + 2.4, sy)],
                   fill=shade(colour, 0.30), ink=P["ink"], lw=LW_FACE)
            c.line([(ccx - 6.0, sy - 4.6), (ccx + 2.0, sy - 4.6)],
                   tint(colour, 0.42), 1.2)
    c.line([(x0 + 6.0, top + 4.0), (x0 + 16.0, top + 26.0)],
           alpha(P["white"], 0.45), 2.0)


# --------------------------------------------------------------------- bar

def seating_barStool(c: Canvas) -> None:
    """
    A bar stool, and visibly taller than `seating_stool`.

    Height is the whole identity, so the seat sits high and the foot ring is
    drawn well up the column rather than near the floor.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 12.0)
    seat_y = fy - 40.0
    c.ellipse(cx, fy - 2.4, 11.0, 3.0, fill=P["metalDk"], ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx, fy - 3.4, 6.4, 1.6, fill=shade(P["metalDk"], 0.22))
    c.rect(cx - 2.4, seat_y + 2.0, 4.8, fy - seat_y - 4.0, fill=P["metal"])
    c.rrect(cx - 2.4, seat_y + 2.0, 4.8, fy - seat_y - 4.0, r=1.0,
            ink=P["ink"], lw=LW_FACE)
    c.ellipse(cx, fy - 15.0, 8.6, 2.4, ink=P["ink"], lw=LW_DETAIL)
    c.arc(cx, fy - 15.0, 8.6, 2.4, 0, 360, P["metalDk"], 2.0)
    c.ellipse(cx, seat_y, 12.0, 4.0, fill=mix(P["carpet"], P["ink2"], 0.20),
              ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx, seat_y - 1.4, 8.4, 2.2, fill=tint(P["carpet"], 0.20))


def appliance_beerTap(c: Canvas) -> None:
    """A bank of three draught taps on a bar font, with its drip tray."""
    cx = c.w / 2
    fy = _stand(c, cx, 20.0)
    # Drip tray, no wider than the font standing on it.
    c.rrect(cx - 15.0, fy - 6.0, 30.0, 6.0, r=1.6, fill=P["metalDk"],
            ink=P["ink"], lw=LW_PROP)
    for i in range(5):
        c.line([(cx - 10.0 + i * 5.0, fy - 5.0), (cx - 10.0 + i * 5.0, fy - 1.6)],
               shade(P["metalDk"], 0.30), 1.2)
    col_top = fy - 36.0
    c.rrect(cx - 9.0, col_top, 18.0, 30.0, r=3.0, fill=P["metal"],
            ink=P["ink"], lw=LW_PROP)
    c.rect(cx - 6.6, col_top + 3.0, 13.2, 9.0, fill=tint(P["metal"], 0.34))
    c.rrect(cx - 7.0, col_top + 16.0, 14.0, 9.0, r=1.6, fill=P["gold"],
            ink=P["ink"], lw=LW_FACE)
    c.line([(cx - 4.0, col_top + 20.5), (cx + 4.0, col_top + 20.5)],
           P["goldDk"], 1.4)
    # Three handles on short swan necks, close in so the font reads as one
    # object rather than as a box with sticks glued to it.
    for i, (side, dy) in enumerate(((-1, 4.0), (1, 4.0), (-1, 13.0))):
        y = col_top + dy
        x = cx + side * 9.0
        c.arc(x + side * 3.0, y + 2.0, 4.0, 4.0, 180 if side < 0 else 270,
              360 if side < 0 else 90, P["metalDk"], 2.4)
        c.rrect(x + side * 6.6 - 2.2, y + 3.0, 4.4, 9.0, r=2.0,
                fill=(P["coral"], P["mint"], P["glass"])[i],
                ink=P["ink"], lw=LW_FACE)


def luxury_cocktailCart(c: Canvas) -> None:
    """A brass trolley on castors: bottles above, glasses below."""
    cx = c.w / 2
    fy = _stand(c, cx, 22.0)
    top_y, mid_y = fy - 34.0, fy - 16.0
    for side in (-1, 1):
        c.line([(cx + side * 19.0, top_y), (cx + side * 19.0, fy - 5.0)],
               P["gold"], 2.6)
    for y in (top_y, mid_y):
        c.rrect(cx - 21.0, y, 42.0, 3.0, r=1.2,
                fill=alpha(P["glass"], 0.62), ink=P["ink"], lw=LW_DETAIL)
        c.rect(cx - 19.0, y + 0.6, 38.0, 1.0, fill=alpha(P["white"], 0.40))
    _bottles(c, cx - 15.0, cx + 15.0, top_y, n=4, h=13.0)
    for i in range(3):
        gx = cx - 11.0 + i * 11.0
        c.poly([(gx - 3.2, mid_y - 9.0), (gx + 3.2, mid_y - 9.0),
                (gx + 1.4, mid_y - 3.0), (gx - 1.4, mid_y - 3.0)],
               fill=alpha(P["glass"], 0.70), ink=P["ink"], lw=LW_FACE)
        c.line([(gx, mid_y - 3.0), (gx, mid_y)], P["ink2"], 1.2)
        c.line([(gx - 2.4, mid_y), (gx + 2.4, mid_y)], P["ink2"], 1.2)
    c.rrect(cx + 19.0, top_y - 5.0, 3.0, 6.0, r=1.2, fill=P["gold"],
            ink=P["ink"], lw=LW_FACE)
    for side in (-1, 1):
        c.circle(cx + side * 17.0, fy - 3.0, 3.0, fill=P["black"],
                 ink=P["ink"], lw=LW_FACE)


PIECES = {
    "table_diningTable": table_diningTable,
    "storage_wineRack": storage_wineRack,
    "lighting_candelabra": lighting_candelabra,
    "seating_cafeChair": seating_cafeChair,
    "table_cafeTable": table_cafeTable,
    "appliance_cakeDisplay": appliance_cakeDisplay,
    "seating_barStool": seating_barStool,
    "appliance_beerTap": appliance_beerTap,
    "luxury_cocktailCart": luxury_cocktailCart,
}
