"""
The rooms that run the hotel: lobby, housekeeping, laundry, staff room,
maintenance and the business centre.

These are the hotel's back of house, and they have a harder job than a bedroom:
a player has to tell a laundry from a maintenance room at a glance, in a
rectangle 256 pixels wide, with no text. What does that work is *fixed
equipment* — the drums of the washing machines, the pigeonholes behind the
reception desk, the pegboard of tools. Each room gets one such hero fixture and
two or three supporting marks, and then stops, because ART-0 §4 asks for a
quarter of the room to stay empty and because the decor the player buys has to
have somewhere to go.

Nothing movable is drawn here. Beds, chairs, tables, lamps, rugs and plants are
decor sprites the renderer composites on top.
"""
from __future__ import annotations

from hcstyle import (
    P, RoomSpec, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    alpha, shade, tint, window, door, counter, wall_lamp,
)


# --------------------------------------------------------------------- lobby

def lobby(c: Canvas, fy: float) -> None:
    """
    Reception. The one room every player sees first, so it carries the most
    identity: a long desk, a key wall behind it, and a lit entrance.
    """
    w, h = c.w, c.h
    # The way in. A plain glazed rectangle was the first attempt and it read as
    # a fridge: a door is told by its frame, its fanlight and its handles, not
    # by being made of glass.
    dx0, dw0, dh0 = 6.0, 32.0, 54.0
    c.rrect(dx0 - 2, fy - dh0 - 8, dw0 + 4, dh0 + 8, r=3, fill=P["coral"], ink=P["ink"], lw=LW_PROP)
    # Fanlight over the doors.
    c.rrect(dx0 + 1, fy - dh0 - 5.5, dw0 - 2, 6.0, r=2, fill=P["glass"], ink=P["ink"], lw=LW_FACE)
    for side in (0, 1):
        px = dx0 + 1.5 + side * (dw0 / 2 - 0.5)
        c.rrect(px, fy - dh0 + 2, dw0 / 2 - 2, dh0 - 3, r=2,
                fill=P["glass"], ink=P["ink"], lw=LW_DETAIL)
        c.line([(px + 3, fy - dh0 + 24), (px + dw0 / 2 - 7, fy - dh0 + 6)],
               alpha(P["white"], 0.55), LW_DETAIL)
    # The handles, at the meeting stiles, which is what fixes it as a door.
    for hx in (dx0 + dw0 / 2 - 3.2, dx0 + dw0 / 2 + 1.6):
        c.rrect(hx, fy - dh0 * 0.55, 1.6, 8.0, r=0.8, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    # A welcome mat inside it — part of the building, not a rug the player buys.
    c.rrect(dx0 + 2, fy - 1.5, dw0 - 4, 3.4, r=1.4, fill=P["carpet"], ink=P["ink"], lw=LW_FACE)

    # The key wall: pigeonholes, the single mark that says "reception".
    kx = w * 0.60
    kw = min(w * 0.30, 54)
    c.rrect(kx, 16, kw, 30, r=2.4, fill=P["woodPale"], ink=P["ink"], lw=LW_PROP)
    for row in range(3):
        c.line([(kx + 2, 16 + 8 + row * 7.2), (kx + kw - 2, 16 + 8 + row * 7.2)],
               alpha(P["woodDk"], 0.8), LW_DETAIL)
    for col in range(1, 4):
        c.line([(kx + col * kw / 4, 18), (kx + col * kw / 4, 44)], alpha(P["woodDk"], 0.8), LW_DETAIL)
    for i, (cx, cy) in enumerate(((kx + kw * 0.13, 25), (kx + kw * 0.62, 32), (kx + kw * 0.87, 39))):
        c.circle(cx, cy, 1.6, fill=P["gold"], ink=P["ink"], lw=LW_FACE)

    # The desk. Fixed: a lobby without one is not a lobby.
    dw = min(w * 0.34, 62)
    dx = w * 0.56
    counter(c, dx, fy, dw, 22, body=P["woodDk"], top=P["woodPale"])
    c.rrect(dx + dw * 0.10, fy - 20, dw * 0.80, 6.0, r=1.2, fill=alpha(P["woodPale"], 0.55))
    # A bell and a ledger on the counter top.
    c.circle(dx + dw * 0.86, fy - 26.2, 2.2, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    c.rrect(dx + dw * 0.10, fy - 26.4, 8.0, 2.4, r=0.8, fill=P["white"], ink=P["ink"], lw=LW_FACE)

    wall_lamp(c, w * 0.44, 14)
    if w > 200:
        wall_lamp(c, w * 0.90, 14)


# ------------------------------------------------------------- housekeeping

def housekeeping(c: Canvas, fy: float) -> None:
    """
    The linen store. One block only, so the fitted shelving *is* the room —
    but it now stops at 56% of the width instead of filling it.

    Two reasons. The shelving used to run wall to wall and down to within
    25 pixels of the floor, which left the room no wall a picture could hang on
    and no ceiling a lamp could hang from: a one-block room with four decor
    slots had nowhere to put three of them. And a full wall of folded linen is
    the same object as `storage_linenShelf`, so buying that piece stood a second
    shelf unit in front of the first. Shortened, the built joinery still says
    "linen store" and the right-hand wall belongs to the player.

    The mop and bucket went for the same reason — `storage_supplyCart` is a
    cleaning trolley with a mop on it. What replaces them is a rail of gloves
    and spray bottles, which is fixed equipment nobody can buy.
    """
    sx, sw = 8.0, 58.0
    sy, sh = 14.0, 34.0            # the wall right of it, and the ceiling, stay free
    c.rrect(sx, sy, sw, sh, r=2.0, fill=P["woodPale"], ink=P["ink"], lw=LW_PROP)
    rows = 2
    for row in range(rows):
        y = sy + (row + 1) * sh / rows
        c.line([(sx + 1.5, y), (sx + sw - 1.5, y)], P["woodDk"], LW_PROP)
        # Folded towels, alternating so a stack reads as cloth and not as lines.
        for i in range(2):
            tx = sx + 4 + i * (sw - 8) / 2
            tw = (sw - 8) / 2 - 4
            for k in range(2):
                c.rrect(tx, y - 8.0 + k * 3.8, tw, 3.4, r=1.4,
                        fill=P["linen"] if (i + k + row) % 2 == 0 else P["glass"],
                        ink=P["ink"], lw=LW_FACE)


# -------------------------------------------------------------------- laundry

def laundry(c: Canvas, fy: float) -> None:
    """
    Three plumbed-in bays and a washing line.

    The room used to paint the washing machines themselves, which was the one
    place in the hotel where the building drew a thing the player can also buy:
    installing `appliance_washer` put a fourth identical machine beside three
    that were already there. What is bolted to the building is the *plumbing* —
    the tiled recess, the plinth a machine stands on, the stop tap and the waste
    stub — so that is what is painted here, and the machines are decor standing
    in the bays (src/core/systems/roomAnchors.ts gives each bay a slot).

    An empty bay still reads as a laundry: the alcoves are the same size and in
    the same places the machines were, and the washing line overhead says what
    the room is for even before the first machine is installed.
    """
    w = c.w
    n = max(2, int(w // 78))
    span = w - 20
    mw = min(46.0, span / n - 6)
    for i in range(n):
        mx = 12 + i * (span / n)
        mh = 40.0
        # The recess: a shaded tiled panel with its own rebate, so the bay reads
        # as a hole in the wall rather than as a pale box standing in front of it.
        c.rrect(mx, fy - mh, mw, mh, r=2.0, fill=shade(P["tile"], 0.10),
                ink=P["ink"], lw=LW_PROP)
        c.rrect(mx + 2, fy - mh + 2, mw - 4, mh - 4, r=1.6,
                fill=shade(P["tile"], 0.22), ink=P["ink2"], lw=LW_FACE)
        # Tile courses inside the recess. Two pixels apart is the floor of what
        # survives at 1x, so the grout runs every seven.
        for k in range(1, 5):
            ty = fy - mh + 2 + k * (mh - 4) / 5
            c.line([(mx + 3, ty), (mx + mw - 3, ty)], shade(P["tile"], 0.34), LW_FACE)
        # The plinth a machine is set on, and the shadow it casts into the bay.
        c.rrect(mx + 1.5, fy - 6.0, mw - 3, 6.0, r=1.4, fill=P["concrete"],
                ink=P["ink"], lw=LW_FACE)
        c.rect(mx + 2.5, fy - 6.0, mw - 5, 1.6, fill=alpha(P["shadow"], 0.18))
        # Stop tap and waste stub on the back wall of the bay.
        c.rrect(mx + mw * 0.24, fy - mh + 5.0, 3.0, 7.0, r=1.2,
                fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)
        c.circle(mx + mw * 0.24 + 1.5, fy - mh + 4.6, 2.2, fill=P["coral"],
                 ink=P["ink"], lw=LW_FACE)
        c.circle(mx + mw * 0.70, fy - mh + 7.0, 3.0, fill=shade(P["tile"], 0.42),
                 ink=P["ink"], lw=LW_FACE)
    # A washing line above, because the room is otherwise all boxes.
    c.line([(6, 13), (w - 6, 13)], P["ink2"], LW_DETAIL)
    for i in range(max(2, int(w // 42))):
        x = 14 + i * 38
        c.rrect(x, 13, 12, 12, r=1.6,
                fill=P["linen"] if i % 2 == 0 else P["glass"], ink=P["ink"], lw=LW_FACE)


# ----------------------------------------------------------------- staff room

def staff_room(c: Canvas, fy: float) -> None:
    """
    Where the team sits down. A kitchenette and a noticeboard: the two things
    every staff room on earth has, and both read at a glance.
    """
    w = c.w
    window(c, w - 44, 15, 32, 30)
    # Kitchenette: a run of units, a kettle, and mugs on an open shelf. Wall
    # cupboards above it, because a counter alone left the upper half empty and
    # a staff room is the one place in a hotel with no view to sell.
    cw = min(w * 0.44, 80)
    counter(c, 9, fy, cw, 20, body=P["mintDk"], top=P["linen"])
    c.rrect(9, 14, cw * 0.72, 20, r=2.0, fill=P["mintDk"], ink=P["ink"], lw=LW_PROP)
    for i in range(2):
        c.line([(9 + (i + 1) * cw * 0.24, 15.5), (9 + (i + 1) * cw * 0.24, 32.5)],
               alpha(P["ink"], 0.45), LW_DETAIL)
    c.rrect(15, fy - 30.0, 9.0, 9.0, r=1.8, fill=P["metal"], ink=P["ink"], lw=LW_PROP)
    c.line([(24, fy - 27.0), (27.0, fy - 28.5)], P["ink"], LW_DETAIL)
    for i in range(3):
        c.rrect(32 + i * 8.0, fy - 27.5, 6.0, 6.5, r=1.2, fill=P["white"], ink=P["ink"], lw=LW_FACE)
        c.arc(38 + i * 8.0, fy - 24.5, 2.2, 2.0, 270, 90, P["ink"], LW_FACE)
    # Noticeboard: cork with pinned notes, sized so the notes are legible.
    bx = w * 0.52
    bw = min(w * 0.28, 52)
    c.rrect(bx, 14, bw, 30, r=1.8, fill=P["woodPale"], ink=P["ink"], lw=LW_PROP)
    for dx, dy, col in ((4, 5, P["white"]), (20, 9, P["cream"]), (34, 4, P["glass"])):
        if dx + 14 > bw - 2:
            continue
        c.rrect(bx + dx, 14 + dy, 13, 11, r=1.0, fill=col, ink=P["ink"], lw=LW_FACE)
        c.line([(bx + dx + 2.5, 14 + dy + 4), (bx + dx + 10, 14 + dy + 4)], alpha(P["ink"], 0.5), 0.8)
        c.line([(bx + dx + 2.5, 14 + dy + 7), (bx + dx + 8, 14 + dy + 7)], alpha(P["ink"], 0.5), 0.8)
        c.circle(bx + dx + 6.5, 14 + dy + 1.4, 1.1, fill=P["coral"], ink=P["ink"], lw=LW_FACE)


# ---------------------------------------------------------------- maintenance

def maintenance(c: Canvas, fy: float) -> None:
    """
    The engineer's room: a pegboard of tools over a workbench, and a pipe run
    along the ceiling. Utilitarian on purpose — it is the one room in the hotel
    that is allowed to look like a workshop.
    """
    w = c.w
    # A pipe run hard against the ceiling, on brackets, with a valve wheel.
    c.rrect(0, 7.0, w, 5.0, r=2.4, fill=P["metal"], ink=P["ink"], lw=LW_PROP)
    c.rect(0, 8.4, w, 1.4, fill=tint(P["metal"], 0.45))
    for i in range(max(2, int(w // 60))):
        bx = 18 + i * 58
        if bx > w - 8:
            break
        c.rect(bx, 5.0, 3.0, 8.0, fill=P["metalDk"])
    c.circle(w * 0.30, 9.5, 4.4, fill=P["coral"], ink=P["ink"], lw=LW_PROP)
    c.circle(w * 0.30, 9.5, 1.6, fill=P["metal"], ink=P["ink"], lw=LW_FACE)

    # The pegboard, and only the pegboard.
    #
    # It used to carry a hammer, a saw and a spanner, which is the same object
    # `storage_toolRack` sells: buying that stood a second board of tools in
    # the room beside the first. What is bolted to the building is the board —
    # perforated ply, hooks, and the shadow of what hangs on them — and the
    # tools are decor standing in front of it.
    px, pw = 10.0, min(w * 0.40, 76)
    c.rrect(px, 22, pw, 30, r=1.8, fill=P["woodPale"], ink=P["ink"], lw=LW_PROP)
    c.rrect(px + 2, 24, pw - 4, 26, r=1.2, fill=shade(P["woodPale"], 0.10))
    for row in range(3):
        for col in range(int((pw - 10) // 9)):
            c.circle(px + 7 + col * 9.0, 28.5 + row * 8.5, 1.1,
                     fill=shade(P["woodPale"], 0.34))
    # Two hooks, empty, so the board reads as a place things hang rather than
    # as a sheet of pegboard-coloured wall.
    for hx in (px + 16, px + pw - 18):
        c.line([(hx, 26.5), (hx, 31.0)], P["metalDk"], 1.6)
        c.line([(hx, 31.0), (hx + 3.0, 31.0)], P["metalDk"], 1.6)

    # Workbench with a vice: the fixed furniture of the room.
    counter(c, 8, fy, min(w * 0.46, 84), 16, body=P["metalDk"], top=P["metal"])
    c.rrect(14, fy - 22.0, 9.0, 5.0, r=1.0, fill=P["coral"], ink=P["ink"], lw=LW_FACE)
    # A toolbox by the bench.
    tx = w - 34
    c.rrect(tx, fy - 12, 24, 12, r=1.8, fill=P["coral"], ink=P["ink"], lw=LW_PROP)
    c.rrect(tx + 2, fy - 14.5, 20, 3.0, r=1.0, fill=shade(P["coral"], 0.22), ink=P["ink"], lw=LW_FACE)
    c.arc(tx + 12, fy - 14.5, 4.0, 3.6, 180, 360, P["ink"], LW_FACE)


# ------------------------------------------------------------ business centre

def business(c: Canvas, fy: float) -> None:
    """
    Three blocks of quiet: a bank of screens, a wall clock and a glass
    partition. The concierge works here, so it reads as an office rather than
    a bedroom without a bed.
    """
    w = c.w
    window(c, 10, 16, 40, 32)
    # A whiteboard over a bank of filing cabinets. A blank glass partition was
    # the first attempt and it read as a hole in the wall: an office is told by
    # what is filed in it, not by its glazing.
    bx = w * 0.34
    bw = min(w * 0.28, 64)
    c.rrect(bx, 14, bw, 24, r=1.8, fill=P["white"], ink=P["ink"], lw=LW_PROP)
    c.line([(bx + 5, 22), (bx + bw * 0.62, 22)], P["glassDk"], LW_DETAIL)
    c.line([(bx + 5, 27), (bx + bw * 0.80, 27)], P["coral"], LW_DETAIL)
    c.line([(bx + 5, 32), (bx + bw * 0.44, 32)], P["glassDk"], LW_DETAIL)
    for i in range(2):
        cx0 = bx + 2 + i * (bw / 2)
        c.rrect(cx0, fy - 30, bw / 2 - 5, 30, r=1.6, fill=P["metal"], ink=P["ink"], lw=LW_PROP)
        for k in range(3):
            c.line([(cx0 + 3, fy - 25 + k * 9), (cx0 + bw / 2 - 8, fy - 25 + k * 9)],
                   P["metalDk"], LW_DETAIL)
            c.rect(cx0 + (bw / 2 - 5) / 2 - 2.4, fy - 27.4 + k * 9, 4.8, 1.4, fill=P["ink2"])

    # A clock: the one thing a business centre is really about.
    cx = w * 0.30
    c.circle(cx, 22, 7.0, fill=P["white"], ink=P["ink"], lw=LW_PROP)
    c.line([(cx, 22), (cx, 17.5)], P["ink"], LW_FACE)
    c.line([(cx, 22), (cx + 3.6, 23.6)], P["ink"], LW_FACE)

    # Fixed workstation counter along the back, with two monitors.
    dx = w * 0.66
    dw = min(w * 0.30, 68)
    counter(c, dx, fy, dw, 18, body=P["lavender"], top=P["linen"])
    for i in range(2):
        mx = dx + 6 + i * (dw / 2)
        c.rrect(mx, fy - 34, dw / 2 - 10, 13.0, r=1.6, fill=P["ink2"], ink=P["ink"], lw=LW_PROP)
        c.rrect(mx + 1.4, fy - 32.6, dw / 2 - 12.8, 10.2, r=1.0, fill=P["glassDk"])
        c.rect(mx + (dw / 2 - 10) / 2 - 1.0, fy - 21, 2.0, 3.0, fill=P["ink2"])


ROOMS = {
    "lobby":        RoomSpec(P["wallCream"], P["wood"], lobby),
    "housekeeping": RoomSpec(P["wallSky"], P["tile"], housekeeping),
    "laundry":      RoomSpec(P["wallSky"], P["tile"], laundry),
    "staffRoom":    RoomSpec(P["wallMint"], P["wood"], staff_room),
    "maintenance":  RoomSpec(P["wallSlate"], P["concrete"], maintenance),
    "business":     RoomSpec(P["wallLilac"], P["wood"], business),
}
