"""
The gym and the poolside.

The gym was the clearest case of a room the catalogue had abandoned: eight decor
slots, and exactly two machines in the whole game that could legally stand in
them. The pool was worse — four blocks wide, the most expensive room in the
hotel, and nothing in the catalogue that belonged beside water.

The five gym pieces are drawn to be told apart by silhouette, because that is
all a 40-pixel sprite has: the spin bike is a big flywheel over a sloped frame,
the rower is long and low, the punch bag is a vertical on a round foot, the
dumbbell rack is a stepped triangle, and the treadmill and weight rack that
already existed are a raked deck and an upright ladder. No two of them share an
outline.

Anchors: everything here stands on the bottom edge of its canvas and carries a
contact shadow, including the yoga mat — a floor covering lies on the floor.
"""
from __future__ import annotations

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    alpha, shade, tint, mix, math,
)

from decor_props import _stand, _legs, _box, _towels, _pot, _blade
from decor_surfaces import _band


# --------------------------------------------------------------------- gym

def rug_yogaMat(c: Canvas) -> None:
    """
    A mat rolled out on the floor, with the far end still curled.

    The curl is the only thing that separates a yoga mat from a rug at this
    size, so it gets a proper spiral rather than a lighter stripe.
    """
    x, y, w, h = _band(c, 13.0, mix(P["mint"], P["roomBlue"], 0.30), r=3.0)
    c.rect(x + 3.0, y + 2.0, w - 6.0, 2.0, fill=tint(P["mint"], 0.30))
    c.line([(x + 6.0, y + h * 0.62), (x + w - 6.0, y + h * 0.62)],
           alpha(P["ink2"], 0.22), 1.2)
    # The curled end, drawn as two arcs and a dark core.
    c.ellipse(x + w - 5.0, y + h / 2, 5.0, h / 2 + 1.0,
              fill=mix(P["mint"], P["roomBlue"], 0.30), ink=P["ink"], lw=LW_DETAIL)
    c.ellipse(x + w - 5.0, y + h / 2, 2.4, h / 2 - 2.0,
              fill=shade(P["mint"], 0.24), ink=P["ink"], lw=LW_FACE)


def appliance_spinBike(c: Canvas) -> None:
    """
    A spin bike. The flywheel is the whole point, so it is drawn big.

    An exercise bike and a spin bike differ by one thing at this size: the
    heavy disc at the front. Everything else — the sloped frame, the saddle
    post, the bars — hangs off it.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 24.0)
    front, back = cx - 15.0, cx + 17.0
    # Feet first, so the frame sits on them.
    for x in (front, back):
        c.rrect(x - 10.0, fy - 4.0, 20.0, 4.0, r=1.6,
                fill=P["metalDk"], ink=P["ink"], lw=LW_DETAIL)
    c.line([(front, fy - 5.0), (front + 4.0, fy - 30.0)], P["coral"], 3.4)
    c.line([(back, fy - 5.0), (back - 4.0, fy - 34.0)], P["coral"], 3.4)
    c.line([(front + 4.0, fy - 30.0), (back - 4.0, fy - 34.0)], P["coral"], 3.0)
    # The flywheel: a shrouded disc with a spoke cross and a hub.
    c.circle(front + 1.0, fy - 17.0, 12.0, fill=P["metal"], ink=P["ink"], lw=LW_PROP)
    c.circle(front + 1.0, fy - 17.0, 8.4, fill=shade(P["metal"], 0.18))
    for a in (0.0, 0.5, 1.0, 1.5):
        ang = math.pi * a
        c.line([(front + 1.0 - math.cos(ang) * 7.4, fy - 17.0 - math.sin(ang) * 7.4),
                (front + 1.0 + math.cos(ang) * 7.4, fy - 17.0 + math.sin(ang) * 7.4)],
               tint(P["metal"], 0.30), 1.2)
    c.circle(front + 1.0, fy - 17.0, 2.6, fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)
    # Handlebars over the wheel, saddle over the back post.
    c.line([(front + 4.0, fy - 32.0), (front + 4.0, fy - 38.0)], P["ink2"], 2.6)
    c.line([(front - 4.0, fy - 38.0), (front + 12.0, fy - 38.0)], P["black"], 2.6)
    c.rrect(back - 12.0, fy - 38.0, 16.0, 5.0, r=2.4,
            fill=P["black"], ink=P["ink"], lw=LW_DETAIL)
    c.line([(front + 5.0, fy - 12.0), (front + 11.0, fy - 8.0)], P["metalDk"], 2.0)


def storage_dumbbellRack(c: Canvas) -> None:
    """
    A two-tier rack with four pairs of dumbbells on it.

    A dumbbell is a bar and two round ends; below about seven pixels the ends
    merge into the bar, so there are four pairs and not eight.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 24.0)
    x0, w = cx - 24.0, 48.0
    top = fy - 30.0
    # An angled steel frame: two uprights, a raked front and two shelf rails.
    for side in (0, 1):
        x = x0 + side * w
        c.line([(x, fy - 2.0), (x + (4.0 if side == 0 else -4.0), top)],
               P["metalDk"], 3.0)
    for row in range(2):
        ry = top + 4.0 + row * 13.0
        inset = 4.0 - row * 2.0
        c.rrect(x0 + inset, ry, w - inset * 2, 3.0, r=1.2,
                fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)
        n = 3 - row
        span = w - inset * 2 - 6.0
        for i in range(n + 1):
            bx = x0 + inset + 4.0 + i * span / max(1, n)
            r = 3.4 + row * 0.8
            c.rrect(bx - 4.0, ry - r - 1.0, 8.0, 2.4, r=1.0,
                    fill=P["metal"], ink=P["ink"], lw=LW_FACE)
            for side in (-1, 1):
                c.circle(bx + side * 4.4, ry - r + 0.2, r,
                         fill=P["black"], ink=P["ink"], lw=LW_FACE)
    c.rrect(x0 - 2.0, fy - 3.4, w + 4.0, 3.4, r=1.2,
            fill=shade(P["metalDk"], 0.22), ink=P["ink"], lw=LW_FACE)


def appliance_rowingMachine(c: Canvas) -> None:
    """
    A rower, seen from the side: long, low, and nothing above knee height.

    Its silhouette is the opposite of every other machine in the room, which is
    what makes it readable next to them.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 26.0)
    rail_y = fy - 12.0
    # The rail, sloping very slightly up towards the flywheel end.
    c.poly([(cx - 26.0, rail_y + 2.0), (cx + 22.0, rail_y - 2.0),
            (cx + 22.0, rail_y + 1.4), (cx - 26.0, rail_y + 5.4)],
           fill=P["metalDk"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - 28.0, fy - 6.0, 8.0, 6.0, r=1.6, fill=P["metal"],
            ink=P["ink"], lw=LW_DETAIL)
    # Flywheel housing at the front, on its own foot.
    c.rrect(cx + 16.0, fy - 26.0, 14.0, 22.0, r=4.0, fill=P["coral"],
            ink=P["ink"], lw=LW_PROP)
    c.circle(cx + 23.0, fy - 16.0, 5.4, fill=shade(P["coral"], 0.28),
             ink=P["ink"], lw=LW_FACE)
    c.rrect(cx + 12.0, fy - 4.0, 22.0, 4.0, r=1.4, fill=P["metalDk"],
            ink=P["ink"], lw=LW_FACE)
    # Seat on the rail, and the handle on its chain.
    c.rrect(cx - 8.0, rail_y - 4.0, 12.0, 4.4, r=2.0, fill=P["black"],
            ink=P["ink"], lw=LW_DETAIL)
    c.line([(cx + 16.0, fy - 18.0), (cx - 2.0, fy - 20.0)], P["metal"], 1.4)
    c.rrect(cx - 8.0, fy - 22.0, 8.0, 3.0, r=1.4, fill=P["black"],
            ink=P["ink"], lw=LW_FACE)


def appliance_punchBag(c: Canvas) -> None:
    """
    A heavy bag on a floor stand.

    The stand reaches the bottom edge, not the bag: the bag hangs, and a bag
    drawn down to the floor reads as a bollard.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 20.0)
    c.ellipse(cx, fy - 4.0, 20.0, 4.6, fill=P["black"], ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx, fy - 5.6, 13.0, 2.8, fill=shade(P["black"], 0.20))
    post_top = fy - 44.0
    c.line([(cx, fy - 6.0), (cx, post_top)], P["metalDk"], 4.0)
    c.line([(cx, post_top), (cx + 13.0, post_top)], P["metalDk"], 3.4)
    c.line([(cx + 13.0, post_top), (cx + 13.0, post_top + 4.0)], P["metalDk"], 2.0)
    # The bag: a rounded cylinder with a taped seam and a scuffed lower band.
    bx, btop, bh, bw = cx + 13.0, post_top + 4.0, 26.0, 9.0
    c.rrect(bx - bw, btop, bw * 2, bh, r=6.0, fill=P["coral"],
            ink=P["ink"], lw=LW_PROP)
    c.rect(bx - bw + 1.6, btop + bh * 0.52, (bw - 1.6) * 2, 4.0,
           fill=shade(P["coral"], 0.26))
    c.line([(bx - bw + 1.0, btop + 6.0), (bx + bw - 1.0, btop + 6.0)],
           tint(P["coral"], 0.30), 1.2)
    c.rrect(bx - 4.0, btop - 2.6, 8.0, 3.4, r=1.2, fill=P["metal"],
            ink=P["ink"], lw=LW_FACE)


# ---------------------------------------------------------------- poolside

def storage_towelStack(c: Canvas) -> None:
    """
    A poolside towel trolley: two stacks of rolled towels on a low shelf.

    Rolled, not folded — a spiral end says pool, a flat edge says linen
    cupboard, and `storage_linenShelf` already owns the flat edge.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 24.0)
    top = fy - 22.0
    c.rrect(cx - 24.0, top, 48.0, 3.4, r=1.2, fill=P["woodPale"],
            ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 22.0, fy - 9.0, 44.0, 3.0, r=1.2, fill=P["woodPale"],
            ink=P["ink"], lw=LW_FACE)
    _legs(c, (cx - 20.0, cx + 20.0), top + 3.4, colour=P["metalDk"], w=3.0, r=1.0)
    for side in (-1, 1):
        for row in range(2):
            for i in range(2 - row):
                rx = cx + side * 11.0 + (i - (1 - row) / 2) * 9.6
                ry = top - 5.0 - row * 9.0
                c.rrect(rx - 4.6, ry, 9.2, 8.4, r=4.0, fill=P["linen"],
                        ink=P["ink"], lw=LW_FACE)
                c.arc(rx, ry + 4.2, 2.8, 2.8, 0, 300, P["linenSh"], 1.2)
    for side in (-1, 1):
        c.circle(cx + side * 18.0, fy - 3.0, 2.6, fill=P["black"],
                 ink=P["ink"], lw=LW_FACE)


def luxury_parasol(c: Canvas) -> None:
    """
    A parasol: a scalloped canopy in two colours on a pole and a weighted foot.

    The canopy is the silhouette. The pole stays at two and a half pixels
    because anything thinner disappears at 55%.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 10.0)
    c.ellipse(cx, fy - 3.0, 10.0, 3.2, fill=P["concrete"], ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - 9.0, fy - 6.0, 18.0, 4.0, r=1.4, fill=P["concrete"],
            ink=P["ink"], lw=LW_FACE)
    top = 12.0
    c.line([(cx, fy - 5.0), (cx, top)], P["woodPale"], 2.6)
    # Canopy: one filled dome, then scallops cut along its rim in two colours.
    c.pie(cx, top + 16.0, 28.0, 17.0, 180, 360,
          fill=P["coral"], ink=P["ink"], lw=LW_PROP)
    for i in range(4):
        ang = math.pi * (1.06 + i * 0.22)
        px = cx + math.cos(ang) * 22.0
        if i % 2 == 0:
            continue
        c.pie(px, top + 15.0, 8.0, 12.0, 180, 360, fill=P["cream"])
    c.arc(cx, top + 16.0, 28.0, 17.0, 180, 360, P["ink"], LW_PROP)
    for i in range(5):
        sx = cx - 24.0 + i * 12.0
        c.ellipse(sx, top + 16.0, 6.0, 2.6, fill=P["cream"] if i % 2 else P["coral"],
                  ink=P["ink"], lw=LW_FACE)
    c.circle(cx, top - 1.0, 2.2, fill=P["gold"], ink=P["ink"], lw=LW_FACE)


def seating_sunLounger(c: Canvas) -> None:
    """
    A lounger seen from the side: a slatted bed with the back raised.

    The raised back is what stops it reading as a bench, so it is drawn as a
    separate raked panel rather than as a bend in the same shape.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 27.0)
    bed_y = fy - 14.0
    frame = mix(P["metal"], P["glass"], 0.30)
    c.rrect(cx - 22.0, bed_y, 44.0, 4.6, r=1.8, fill=frame,
            ink=P["ink"], lw=LW_PROP)
    for i in range(4):
        c.line([(cx - 18.0 + i * 10.0, bed_y + 0.8), (cx - 18.0 + i * 10.0, bed_y + 3.8)],
               shade(frame, 0.22), 1.2)
    # Raked back, and the towel thrown over it.
    c.poly([(cx - 22.0, bed_y + 1.0), (cx - 26.0, bed_y - 15.0),
            (cx - 20.0, bed_y - 16.0), (cx - 16.0, bed_y + 1.0)],
           fill=frame, ink=P["ink"], lw=LW_PROP)
    c.poly([(cx - 24.5, bed_y - 9.0), (cx - 18.5, bed_y - 10.0),
            (cx - 16.0, bed_y + 2.0), (cx - 22.0, bed_y + 2.0)],
           fill=P["linen"], ink=P["ink"], lw=LW_FACE)
    for side, x in ((0, cx - 18.0), (1, cx + 18.0)):
        c.line([(x, bed_y + 4.0), (x + (2.0 if side else -2.0), fy - 3.0)],
               P["metalDk"], 2.6)
    c.circle(cx + 20.0, fy - 3.0, 2.8, fill=P["black"], ink=P["ink"], lw=LW_FACE)
    c.line([(cx - 6.0, bed_y + 4.6), (cx - 6.0, fy - 1.0)], P["metalDk"], 2.2)


def plant_poolPalm(c: Canvas) -> None:
    """
    A palm in a big planter, wide and low.

    `plant_palm` is a tall trunk with fronds arcing off the top; this one is
    half the height, twice the planter, and its fronds spread sideways — the
    difference has to be visible with both of them in the same room.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 22.0)
    # A wide square planter, not a tapered pot.
    c.rrect(cx - 21.0, fy - 20.0, 42.0, 20.0, r=2.6,
            fill=mix(P["tile"], P["glass"], 0.35), ink=P["ink"], lw=LW_PROP)
    c.rect(cx - 18.0, fy - 17.0, 36.0, 3.0, fill=tint(P["tile"], 0.30))
    c.rrect(cx - 23.0, fy - 23.0, 46.0, 4.4, r=1.6,
            fill=shade(P["tile"], 0.16), ink=P["ink"], lw=LW_DETAIL)
    crown = fy - 32.0
    c.rrect(cx - 2.4, crown, 4.8, fy - 22.0 - crown, r=1.8,
            fill=P["woodDk"], ink=P["ink"], lw=LW_DETAIL)
    # Seven fronds fanning wide and low. Angles are the same convention
    # `plant_palm` uses — measured clockwise from 3 o'clock, so a negative
    # angle points upwards — but flatter and with more droop, which is what
    # makes this a poolside palm beside the tall one already in the catalogue.
    for ang, ln in ((-3.10, 24.0), (-2.60, 22.0), (-2.10, 19.0), (-1.57, 17.0),
                    (-1.04, 19.0), (-0.54, 22.0), (-0.04, 24.0)):
        _blade(c, cx, crown + 1.0, ang, ln, 5.0,
               P["leaf"] if abs(ang + 1.57) > 0.8 else P["green"], droop=0.26)
    c.circle(cx, crown + 1.0, 3.0, fill=P["green"], ink=P["ink"], lw=LW_FACE)


def luxury_divingBoard(c: Canvas) -> None:
    """
    A springboard on its stand, cantilevered out over nothing.

    Drawn pointing right so it reads as reaching over water when it stands at
    the left-hand end of the pool's deck, which is where the room's plan puts
    the only floor slots it has.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 18.0)
    stand_x = cx - 14.0
    board_y = fy - 30.0
    # Stepped stand. The stringers reach the floor line, and the lowest tread
    # sits on it: a flight of steps that stops short of the deck reads as a
    # ladder hanging in the air.
    c.line([(stand_x - 17.0, fy - 1.0), (stand_x - 3.0, board_y + 4.0)],
           P["metalDk"], 3.0)
    c.line([(stand_x - 7.0, fy - 1.0), (stand_x + 3.0, board_y + 4.0)],
           P["metalDk"], 3.0)
    for i in range(4):
        c.rrect(stand_x - 16.0 + i * 3.4, fy - 3.4 - i * 7.0, 13.0, 3.2,
                r=1.2, fill=P["metal"], ink=P["ink"], lw=LW_FACE)
    # Fulcrum roller, then the board over it.
    c.circle(stand_x + 6.0, board_y + 3.0, 3.4, fill=P["metalDk"],
             ink=P["ink"], lw=LW_DETAIL)
    c.poly([(stand_x - 4.0, board_y), (cx + 26.0, board_y + 1.6),
            (cx + 26.0, board_y + 5.0), (stand_x - 4.0, board_y + 4.4)],
           fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    c.rect(cx + 12.0, board_y + 2.0, 12.0, 2.2, fill=shade(P["linen"], 0.22))
    c.line([(stand_x + 2.0, board_y + 2.2), (cx + 24.0, board_y + 3.6)],
           alpha(P["ink2"], 0.18), 1.0)


PIECES = {
    "rug_yogaMat": rug_yogaMat,
    "appliance_spinBike": appliance_spinBike,
    "storage_dumbbellRack": storage_dumbbellRack,
    "appliance_rowingMachine": appliance_rowingMachine,
    "appliance_punchBag": appliance_punchBag,
    "storage_towelStack": storage_towelStack,
    "luxury_parasol": luxury_parasol,
    "seating_sunLounger": seating_sunLounger,
    "plant_poolPalm": plant_poolPalm,
    "luxury_divingBoard": luxury_divingBoard,
}
