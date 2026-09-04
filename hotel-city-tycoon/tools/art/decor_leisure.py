"""
The arcade, the cinema and the disco.

Three rooms whose whole appeal is what is inside them, and between them the
catalogue offered one arcade cabinet. The cinema in particular had nothing at
all: a room called Small Cinema, with a decor target of eight hundred points
and not one seat in the game to put in it.

Two constraints shaped these drawings.

The cinema's own picture paints its screen down to within thirteen pixels of
the floor line, so `seating_cinemaSeats` is deliberately squat — it occupies
the bottom third of its canvas and leaves the rest transparent, which puts the
seat backs on the floor and the screen untouched above them.

The disco is registered under the room id `spa` and is drawn on a deep navy
wall with a lit chequer floor, so the two pieces that live there carry their
own light rather than relying on the room's.
"""
from __future__ import annotations

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    alpha, shade, tint, mix, math,
)

from decor_props import _stand, _legs, _box, _screen, _buttons
from decor_surfaces import _ceiling_plate, _glow, _star


# ------------------------------------------------------------------ cinema

def seating_cinemaSeats(c: Canvas) -> None:
    """
    A row of three seats seen from behind.

    Short on purpose: the cinema's screen is painted to within a couple of
    anchor units of the floor, so anything tall drawn here would be composited
    straight over it. The whole row lives in the bottom third of the canvas.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 26.0)
    seat = mix(P["carpet"], P["ink2"], 0.28)
    plinth_y = fy - 5.0
    c.rrect(cx - 26.0, plinth_y, 52.0, 5.0, r=1.4, fill=shade(seat, 0.34),
            ink=P["ink"], lw=LW_DETAIL)
    for i in range(3):
        bx = cx - 17.0 + i * 17.0
        c.rrect(bx - 7.6, fy - 22.0, 15.2, 17.0, r=4.4, fill=seat,
                ink=P["ink"], lw=LW_PROP)
        c.rect(bx - 5.6, fy - 20.0, 11.2, 3.0, fill=tint(seat, 0.20))
        # Two buttons per back: the mark that says upholstery, not a box.
        for k in range(2):
            c.circle(bx, fy - 16.0 + k * 5.0, 1.2, fill=shade(seat, 0.30))
    for i in range(2):
        c.line([(cx - 8.6 + i * 17.0, fy - 21.0), (cx - 8.6 + i * 17.0, fy - 5.0)],
               shade(seat, 0.36), 1.4)


def appliance_popcornCart(c: Canvas) -> None:
    """A glazed warmer full of popcorn on a red and gold cart, with a valance."""
    cx = c.w / 2
    fy = _stand(c, cx, 22.0)
    base_top = fy - 22.0
    _box(c, cx - 20.0, base_top, 40.0, 18.0, P["coral"])
    for i in range(4):
        c.line([(cx - 15.0 + i * 10.0, base_top + 2.0), (cx - 15.0 + i * 10.0, fy - 6.0)],
               shade(P["coral"], 0.28), 1.4)
    for side in (-1, 1):
        c.circle(cx + side * 14.0, fy - 3.0, 3.2, fill=P["black"],
                 ink=P["ink"], lw=LW_FACE)
    case_top = base_top - 26.0
    c.rrect(cx - 18.0, case_top, 36.0, 26.0, r=2.4, fill=alpha(P["glass"], 0.45),
            ink=P["ink"], lw=LW_PROP)
    # Popcorn heaped to two thirds, drawn as overlapping blobs.
    for i in range(9):
        px = cx - 13.0 + (i % 5) * 6.5
        py = case_top + 15.0 + (i // 5) * 5.0
        c.circle(px, py, 3.4, fill=P["creamHi"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 7.0, case_top + 6.0, 14.0, 8.0, r=1.6, fill=P["metalDk"],
            ink=P["ink"], lw=LW_FACE)
    # Scalloped valance across the top: the fairground mark.
    c.rrect(cx - 20.0, case_top - 5.0, 40.0, 5.0, r=1.2, fill=P["gold"],
            ink=P["ink"], lw=LW_DETAIL)
    for i in range(5):
        c.pie(cx - 16.0 + i * 8.0, case_top, 4.0, 3.4, 0, 180,
              fill=P["coral"] if i % 2 == 0 else P["cream"], ink=P["ink"], lw=LW_FACE)


# ------------------------------------------------------------------ arcade

def appliance_pinballTable(c: Canvas) -> None:
    """
    A pinball table: a raked playfield with a lit backbox standing up behind it.

    Those two shapes together are the silhouette. `appliance_arcadeCabinet` is
    one tall upright box, so the two never read alike.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 24.0)
    # Backbox first, so the playfield overlaps its foot.
    c.rrect(cx + 2.0, fy - 46.0, 26.0, 22.0, r=2.4, fill=P["wallGrape"],
            ink=P["ink"], lw=LW_PROP)
    _screen(c, cx + 5.0, fy - 43.0, 20.0, 15.0, glow=P["coral"])
    c.rrect(cx + 2.0, fy - 48.0, 26.0, 3.0, r=1.2, fill=P["gold"],
            ink=P["ink"], lw=LW_FACE)
    # Raked playfield.
    c.poly([(cx - 26.0, fy - 16.0), (cx + 24.0, fy - 26.0),
            (cx + 24.0, fy - 21.0), (cx - 26.0, fy - 11.0)],
           fill=P["metalDk"], ink=P["ink"], lw=LW_PROP)
    c.poly([(cx - 24.0, fy - 17.0), (cx + 22.0, fy - 26.0),
            (cx + 22.0, fy - 23.6), (cx - 24.0, fy - 14.6)],
           fill=mix(P["roomBlue"], P["ink2"], 0.25))
    for i, r in enumerate((2.6, 2.0, 2.4)):
        c.circle(cx - 14.0 + i * 12.0, fy - 19.0 - i * 2.2, r,
                 fill=(P["coral"], P["cream"], P["mint"])[i],
                 ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 27.0, fy - 14.0, 8.0, 3.4, r=1.2, fill=P["gold"],
            ink=P["ink"], lw=LW_FACE)
    # Legs start at the underside of the playfield, which is raked — a pair set
    # to one height leaves the high end of the table standing on nothing.
    for lx, ly in ((cx - 22.0, fy - 12.0), (cx + 20.0, fy - 21.4)):
        c.rrect(lx - 1.7, ly, 3.4, fy - ly, r=1.0, fill=P["metalDk"],
                ink=P["ink"], lw=LW_DETAIL)


def appliance_clawMachine(c: Canvas) -> None:
    """A glazed crane cabinet: a lit sign, a heap of plush, and the claw."""
    cx = c.w / 2
    fy = _stand(c, cx, 22.0)
    x0, w = cx - 20.0, 40.0
    top = fy - 52.0
    c.rrect(x0 - 2.0, top + 8.0, w + 4.0, fy - top - 8.0, r=2.6,
            fill=P["wallGrape"], ink=P["ink"], lw=LW_PROP)
    c.rrect(x0, top + 14.0, w, 30.0, r=1.6, fill=alpha(P["glass"], 0.40),
            ink=P["ink"], lw=LW_DETAIL)
    # Lit sign across the top.
    c.rrect(x0 - 3.0, top, w + 6.0, 10.0, r=2.4, fill=P["coral"],
            ink=P["ink"], lw=LW_PROP)
    for i in range(5):
        c.circle(x0 + 3.0 + i * 8.5, top + 5.0, 1.8, fill=P["creamHi"])
    # The heap of plush, then the claw over it.
    for i in range(7):
        px = x0 + 5.0 + (i % 4) * 9.0 + (i // 4) * 4.0
        py = fy - 14.0 - (i // 4) * 6.0
        c.circle(px, py, 4.0, fill=(P["mint"], P["cream"], P["glass"], P["blush"])[i % 4],
                 ink=P["ink"], lw=LW_FACE)
        c.circle(px - 2.6, py - 3.0, 1.6, fill=(P["mint"], P["cream"], P["glass"],
                                                P["blush"])[i % 4], ink=P["ink"], lw=LW_FACE)
        c.circle(px + 2.6, py - 3.0, 1.6, fill=(P["mint"], P["cream"], P["glass"],
                                                P["blush"])[i % 4], ink=P["ink"], lw=LW_FACE)
    c.line([(x0 + 2.0, top + 17.0), (x0 + w - 2.0, top + 17.0)], P["metalDk"], 2.0)
    c.line([(cx, top + 17.0), (cx, top + 26.0)], P["metalDk"], 1.6)
    c.poly([(cx - 4.0, top + 26.0), (cx + 4.0, top + 26.0),
            (cx + 2.0, top + 32.0), (cx - 2.0, top + 32.0)],
           fill=P["metal"], ink=P["ink"], lw=LW_FACE)
    c.rrect(x0 + 4.0, fy - 6.0, 10.0, 3.0, r=1.0, fill=P["gold"],
            ink=P["ink"], lw=LW_FACE)


def appliance_airHockey(c: Canvas) -> None:
    """An air hockey table, flat on: a light surface, a centre line, two goals."""
    cx = c.w / 2
    fy = _stand(c, cx, 26.0)
    top_y = fy - 24.0
    c.rrect(cx - 28.0, top_y, 56.0, 12.0, r=3.0, fill=P["wallGrape"],
            ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 26.0, top_y + 1.6, 52.0, 8.4, r=2.0,
            fill=mix(P["glass"], P["white"], 0.45), ink=P["ink"], lw=LW_FACE)
    c.line([(cx, top_y + 2.0), (cx, top_y + 9.6)], P["coral"], 1.4)
    c.ellipse(cx, top_y + 5.8, 5.0, 3.0, ink=P["coral"], lw=LW_FACE)
    for side in (-1, 1):
        c.rrect(cx + side * 26.0 - 1.6, top_y + 3.4, 3.2, 5.0, r=1.0,
                fill=P["black"], ink=P["ink"], lw=LW_FACE)
        c.circle(cx + side * 14.0, top_y + 5.8, 3.0, fill=P["coral"],
                 ink=P["ink"], lw=LW_FACE)
    c.circle(cx + 5.0, top_y + 7.4, 1.8, fill=P["black"], ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - 28.0, top_y + 12.0, 56.0, 8.0, r=1.6,
            fill=shade(P["wallGrape"], 0.24), ink=P["ink"], lw=LW_DETAIL)
    _legs(c, (cx - 23.0, cx + 23.0), top_y + 20.0, colour=P["metalDk"], w=4.0, r=1.2)


# ------------------------------------------------------------------- disco

def seating_loungeBooth(c: Canvas) -> None:
    """
    A curved velvet booth: a high semicircular back sweeping round a low seat.

    Enclosing where `seating_chaise` is open, so the two are never confused
    even though both are long and low-slung.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 27.0)
    velvet = mix(P["wallGrape"], P["carpet"], 0.30)
    back_h = 26.0
    seat_y = fy - 12.0
    c.pie(cx, seat_y + 2.0, 27.0, back_h, 180, 360,
          fill=velvet, ink=P["ink"], lw=LW_PROP)
    c.pie(cx, seat_y + 2.0, 20.0, back_h - 7.0, 180, 360, fill=shade(velvet, 0.16))
    # Buttoning: three rows following the sweep of the back.
    for row, r in enumerate((20.0, 13.0)):
        for i in range(4 - row):
            ang = math.pi * (1.16 + i * (0.68 - row * 0.06) / max(1, 3 - row))
            c.circle(cx + math.cos(ang) * r, seat_y + 2.0 + math.sin(ang) * (r * 0.62),
                     1.3, fill=shade(velvet, 0.34))
    # The seat, drawn as its own volume in front of the back, and a light
    # sweep above it: without those two the booth reads as a purple mound.
    c.arc(cx, seat_y + 2.0, 21.0, back_h - 6.0, 180, 360, tint(velvet, 0.30), 1.6)
    c.rrect(cx - 26.0, seat_y, 52.0, 9.0, r=3.4, fill=tint(velvet, 0.22),
            ink=P["ink"], lw=LW_PROP)
    for i in range(3):
        c.line([(cx - 17.0 + i * 17.0, seat_y + 1.4), (cx - 17.0 + i * 17.0, seat_y + 7.6)],
               shade(velvet, 0.24), 1.2)
    c.rrect(cx - 25.0, fy - 4.0, 50.0, 4.0, r=1.4, fill=P["black"],
            ink=P["ink"], lw=LW_FACE)


def appliance_djBooth(c: Canvas) -> None:
    """A facia with a lit strip, two decks and a mixer standing on it."""
    cx = c.w / 2
    fy = _stand(c, cx, 26.0)
    top_y = fy - 24.0
    c.rrect(cx - 27.0, top_y, 54.0, 24.0, r=2.4, fill=P["wallNavy"],
            ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 23.0, top_y + 8.0, 46.0, 5.0, r=2.0, fill=P["roomBlue"],
            ink=P["ink"], lw=LW_FACE)
    for i in range(7):
        c.circle(cx - 19.0 + i * 6.4, top_y + 10.5, 1.4, fill=P["creamHi"])
    c.rrect(cx - 28.0, top_y - 4.0, 56.0, 4.4, r=1.4, fill=P["metalDk"],
            ink=P["ink"], lw=LW_DETAIL)
    # Two decks and a mixer, standing on the facia's top edge.
    for side in (-1, 1):
        c.rrect(cx + side * 17.0 - 9.0, top_y - 14.0, 18.0, 10.0, r=1.6,
                fill=P["black"], ink=P["ink"], lw=LW_DETAIL)
        c.circle(cx + side * 17.0, top_y - 9.0, 3.6, fill=P["metal"],
                 ink=P["ink"], lw=LW_FACE)
        c.circle(cx + side * 17.0, top_y - 9.0, 1.2, fill=P["coral"])
    c.rrect(cx - 7.0, top_y - 13.0, 14.0, 9.0, r=1.4, fill=P["metalDk"],
            ink=P["ink"], lw=LW_DETAIL)
    for i in range(3):
        c.line([(cx - 4.0 + i * 4.0, top_y - 11.4), (cx - 4.0 + i * 4.0, top_y - 6.0)],
               P["metal"], 1.2)
    # Headphones hooked over the left deck.
    c.arc(cx - 24.0, top_y - 12.0, 5.0, 5.0, 180, 360, P["ink2"], 2.0)
    for side in (-1, 1):
        c.circle(cx - 24.0 + side * 5.0, top_y - 11.0, 2.2, fill=P["ink2"],
                 ink=P["ink"], lw=LW_FACE)


def lighting_laserRig(c: Canvas) -> None:
    """
    A truss bar of four moving heads, hanging on two short drops.

    Held by the top of its canvas like every other light, and the beams are the
    one place translucency is the subject rather than a shortcut.
    """
    cx = c.w / 2
    drop = 8.0
    for dx in (-16.0, 16.0):
        _ceiling_plate(c, cx + dx, 8.0, colour=P["metalDk"])
        c.line([(cx + dx, 2.0), (cx + dx, drop)], P["metalDk"], 1.8)
    # The truss: two chords and a zigzag web between them.
    c.rrect(cx - 26.0, drop, 52.0, 3.0, r=1.0, fill=P["metal"],
            ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - 26.0, drop + 7.0, 52.0, 3.0, r=1.0, fill=P["metal"],
            ink=P["ink"], lw=LW_DETAIL)
    for i in range(6):
        x0 = cx - 24.0 + i * 8.4
        c.line([(x0, drop + 3.0), (x0 + 4.2, drop + 7.0)], P["metalDk"], 1.2)
        c.line([(x0 + 4.2, drop + 7.0), (x0 + 8.4, drop + 3.0)], P["metalDk"], 1.2)
    beams = (P["coral"], P["mint"], P["roomBlue"], P["gold"])
    for i in range(4):
        hx = cx - 19.5 + i * 13.0
        c.rrect(hx - 3.4, drop + 10.0, 6.8, 6.0, r=1.6, fill=P["black"],
                ink=P["ink"], lw=LW_FACE)
        c.circle(hx, drop + 16.0, 2.2, fill=beams[i], ink=P["ink"], lw=LW_FACE)
        c.poly([(hx - 2.0, drop + 17.0), (hx + 2.0, drop + 17.0),
                (hx + 7.0, c.h), (hx - 7.0, c.h)], fill=alpha(beams[i], 0.26))


PIECES = {
    "seating_cinemaSeats": seating_cinemaSeats,
    "appliance_popcornCart": appliance_popcornCart,
    "appliance_pinballTable": appliance_pinballTable,
    "appliance_clawMachine": appliance_clawMachine,
    "appliance_airHockey": appliance_airHockey,
    "seating_loungeBooth": seating_loungeBooth,
    "appliance_djBooth": appliance_djBooth,
    "lighting_laserRig": lighting_laserRig,
}
