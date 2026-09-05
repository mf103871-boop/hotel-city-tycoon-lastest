"""
The four variants every room ships beside its base image.

A room needs five pictures — base, night, dirty, pest and thumb — and only one
of them is worth drawing by hand. The other four are the same room under a
different condition, so they are produced here from the base: 92 files that
nobody has to draw, and that follow automatically the next time a base image
changes.

The transforms are deliberately not filters-for-their-own-sake. Each answers a
question the player asks at a glance:

* `night`  — is the hotel asleep? Cool everything, keep the warm sources lit.
* `dirty`  — does this room need a cleaner? Grime, and litter on the floor.
* `pest`   — what is wrong with it? Roaches, on a transparent layer so the
             renderer can composite them over base *or* dirty.
* `thumb`  — what am I buying? The room on a card, readable at 96 pixels.
"""
from __future__ import annotations

from PIL import Image

from hcstyle import Canvas, P, alpha, mix, save_png, tint, shade


# --------------------------------------------------------------- determinism

def seeded(key: str) -> "Rand":
    """A tiny reproducible generator. Art must not change between runs."""
    return Rand(key)


class Rand:
    """
    An xorshift keyed by a string.

    Python's `random` would do, but seeding it globally makes one generator's
    output depend on how many others ran first. A per-asset stream keyed by the
    asset's own name means a room's grime is the same whether it was generated
    alone or in a batch of twenty-three.
    """

    def __init__(self, key: str):
        h = 2166136261
        for ch in key:
            h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
        self.state = h or 0x9E3779B9

    def next(self) -> int:
        x = self.state
        x ^= (x << 13) & 0xFFFFFFFF
        x ^= x >> 17
        x ^= (x << 5) & 0xFFFFFFFF
        self.state = x & 0xFFFFFFFF
        return self.state

    def rnd(self) -> float:
        return self.next() / 0xFFFFFFFF

    def between(self, lo: float, hi: float) -> float:
        return lo + (hi - lo) * self.rnd()

    def pick(self, items):
        return items[self.next() % len(items)]


# ------------------------------------------------------------------- filters

def _lut(scale, lift):
    """A per-channel lookup table: `out = in * scale + lift`, clamped."""
    table = []
    for band in range(3):
        s, l = scale[band], lift[band]
        table += [max(0, min(255, int(round(v * s + l)))) for v in range(256)]
    return table


#: The night wash, as the one place its numbers are written down.
#:
#: `src/render/backdrop.ts` applies exactly these to the sky, the city, the
#: street and the hotel's frame, and `src/render/roomView.ts` and
#: `characterView.ts` derive their sprite tint from them, so the world outside
#: a room and the picture baked into it are the same night.
#: `tools/selftest/render.ts` reads the tuple out of this file and fails if the
#: renderer's copy has drifted.
NIGHT_SCALE = (0.44, 0.50, 0.56)
NIGHT_LIFT = (20, 26, 58)


def nightfall(img: Image.Image) -> Image.Image:
    """
    The same room after dark: a cool, even wash.

    The first version tried to be clever — cool everything, then hand the warm
    end of the spectrum back so lamps and brass stayed lit. On a navy art-deco
    palette that works. On this one it does the opposite: a cream wall is
    bright in red and green, so the rule matched the *wall* and turned every
    room a lit yellow. Rooms went brighter at night.

    So the wash is uniform, and it is honest about why: none of the light
    sources are in the room image any more. Lamps and chandeliers are decor
    sprites the renderer composites on top, and lighting them is the
    renderer's job, not a colour transform's.

    The second version was uniform but it clipped. `blue * 0.84 + 54` reaches
    255 at an input of 240, so the top sixteen blue levels all landed on pure
    blue: glass, window panes, tiles and the pale-blue walls of the laundry,
    the gym and housekeeping lost every highlight they had and came out one
    flat electric periwinkle. A night that saturates is the opposite of a
    night. These numbers cannot reach 255 from any input — the brightest blue
    a night image can hold is 201 — so highlights stay separated, and the wash
    now takes saturation *out* of a cream wall (23% down to 19%) instead of
    putting more in.
    """
    out = img.convert("RGB").point(_lut(NIGHT_SCALE, NIGHT_LIFT)).convert("RGBA")
    out.putalpha(img.convert("RGBA").getchannel("A"))
    return out


def grime(img: Image.Image) -> Image.Image:
    """Desaturated toward ochre and darkened — the wash under the litter."""
    out = img.convert("RGB").point(_lut((0.80, 0.76, 0.66), (16, 12, 4))).convert("RGBA")
    out.putalpha(img.convert("RGBA").getchannel("A"))
    return out


# ------------------------------------------------------------------- variants

def dirty_layer(c: Canvas, key: str, floor_y: float) -> None:
    """
    What actually makes a room dirty: things on the floor and marks on the wall.

    A colour filter alone says "old photograph", not "nobody has cleaned this".
    The litter is what the player reads, so it is drawn — deterministically, so
    the same room is dirty in the same way every time it is generated.
    """
    r = seeded(f"dirty:{key}")
    w, h = c.w, c.h

    # Scuffs along the skirting, where a real room gets marked first.
    for _ in range(max(3, int(w / 34))):
        x = r.between(4, w - 12)
        c.ellipse(x, floor_y - r.between(0.5, 3.0), r.between(3.0, 7.0), r.between(1.2, 2.4),
                  fill=alpha(P["woodDk"], 0.30))

    # Litter: paper balls, a dropped cup, a dust bunny.
    for _ in range(max(2, int(w / 46))):
        x = r.between(8, w - 10)
        y = floor_y + r.between(1.0, max(1.5, (h - floor_y) * 0.55))
        kind = r.next() % 3
        if kind == 0:
            c.circle(x, y, r.between(2.0, 3.2), fill=P["linenSh"], ink=P["ink"], lw=0.8)
        elif kind == 1:
            c.rrect(x - 2.0, y - 2.6, 4.0, 3.4, r=1.0, fill=P["warmWhite"], ink=P["ink"], lw=0.8)
        else:
            for k in range(3):
                c.circle(x + k * 1.8 - 1.8, y - k % 2, 1.6, fill=alpha(P["concrete"], 0.75))

    # A stain on the wall — one, high enough to be seen over furniture.
    sx, sy = r.between(w * 0.15, w * 0.8), r.between(h * 0.20, h * 0.45)
    c.ellipse(sx, sy, r.between(4.0, 7.0), r.between(3.0, 5.0), fill=alpha(P["woodDk"], 0.22))
    c.ellipse(sx + 3, sy + 2.4, 2.6, 2.0, fill=alpha(P["woodDk"], 0.18))


def pest_layer(c: Canvas, key: str, floor_y: float) -> None:
    """
    Roaches, on a fully transparent canvas.

    ASSET-SPEC is explicit that `_pest` is an overlay and not a room: the
    renderer composites it over whichever base the room is currently showing,
    so a room can be dirty *and* infested without a fifth picture.
    """
    r = seeded(f"pest:{key}")
    for _ in range(max(3, int(c.w / 40))):
        x = r.between(6, c.w - 6)
        y = floor_y + r.between(-2.0, max(0.0, (c.h - floor_y) * 0.6))
        s = r.between(0.85, 1.25)
        # Dark enough to be an insect on any floor in the catalogue.
        #
        # This was P['woodDk'] #B87334, drawn on floors including P['wood']
        # #D9954E — the same brown one shade apart, 1.5:1, and 1.0:1 on the
        # dark-wood floors. An infestation is a thing the player is being asked
        # to notice and pay to clear, and on half the hotel it could not be
        # seen at all. Pulled 65% toward the ink, it holds at least 2.8:1
        # against every floor colour the game ships, and it is still a brown
        # beetle rather than a black dot.
        body = mix(P["woodDk"], P["ink"], 0.65)
        c.ellipse(x, y, 2.6 * s, 1.7 * s, fill=body, ink=P["ink"], lw=0.7)
        c.circle(x - 2.2 * s, y - 0.3 * s, 1.1 * s, fill=body, ink=P["ink"], lw=0.7)
        for side in (-1, 1):
            c.line([(x - 0.6 * s, y + side * 0.9 * s), (x - 2.4 * s, y + side * 2.4 * s)],
                   P["ink"], 0.6)
            c.line([(x + 1.0 * s, y + side * 0.9 * s), (x + 2.6 * s, y + side * 2.2 * s)],
                   P["ink"], 0.6)
        # Antennae, the detail that makes a brown oval unmistakably an insect.
        c.line([(x - 3.0 * s, y - 0.8 * s), (x - 5.0 * s, y - 2.4 * s)], P["ink"], 0.6)
        c.line([(x - 3.0 * s, y - 0.2 * s), (x - 5.2 * s, y - 0.4 * s)], P["ink"], 0.6)


def thumbnail(base: Image.Image, tier: int, wall) -> Image.Image:
    """
    The build menu's 96x96 icon.

    A room is up to four blocks wide, so a square crop would show a quarter of
    a swimming pool and a straight squash would make every room the wrong
    shape. The room is fitted whole onto a card instead — the same card for
    every room, which is what lets the menu read as a list rather than a
    collage.
    """
    size = 96 * tier
    card = Canvas(96, 96, tier=tier)
    card.rrect(1, 1, 94, 94, r=10, fill=tint(wall, 0.55), ink=P["ink"], lw=2.0)
    inner_w, inner_h = 84 * tier, 66 * tier
    scale = min(inner_w / base.width, inner_h / base.height)
    fitted = base.resize((max(1, int(base.width * scale)), max(1, int(base.height * scale))),
                         Image.LANCZOS)
    out = card.image()
    out.alpha_composite(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return out


def write_variants(room_id: str, base: Canvas, wall, floor_y: float,
                   front: Canvas | None = None) -> list[str]:
    """
    Write `night`, `dirty`, `pest` and `thumb` for one room at one tier.

    Takes the base *canvas* rather than re-reading the file. Two reasons: a
    variant is a statement about the picture that was just drawn, and reading
    it back from disk only adds a way for the two to disagree; and the canvas
    still holds its supersampled pixels, so the grime and the litter are drawn
    at full working resolution and downsampled once, like everything else.

    `front` is the room's front layer, if it has one. Only the thumbnail wants
    it: night, dirty and pest are layers the renderer stacks under the people
    and the front layer goes over them separately, but the thumbnail is a
    picture of the whole room and a lobby thumbnail without its reception desk
    is a picture of an empty room.
    """
    from PIL import ImageDraw
    tier = base.tier
    final = base.image()
    paths = [_save(nightfall(final), room_id, "night", tier)]

    dirty = Canvas(base.w, base.h, tier=tier)
    dirty.img.alpha_composite(grime(base.img))
    dirty.d = ImageDraw.Draw(dirty.img, "RGBA")
    dirty_layer(dirty, room_id, floor_y)
    paths.append(_save(dirty.image(), room_id, "dirty", tier))

    pest = Canvas(base.w, base.h, tier=tier)
    pest_layer(pest, room_id, floor_y)
    paths.append(_save(pest.image(), room_id, "pest", tier))

    whole = final
    if front is not None:
        whole = final.copy()
        whole.alpha_composite(front.image())
    paths.append(_save(thumbnail(whole, tier, wall), room_id, "thumb", tier))
    return paths


def _redraw_handle(c: Canvas):
    from PIL import ImageDraw
    return ImageDraw.Draw(c.img, "RGBA")


def _save(img: Image.Image, room_id: str, variant: str, tier: int) -> str:
    import os
    root = "public/assets" if tier == 1 else f"public/assets/@{tier}x"
    path = f"{root}/rooms/{room_id}_{variant}.png"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    save_png(img, path)
    return path


__all__ = ["seeded", "Rand", "nightfall", "grime", "dirty_layer", "pest_layer",
           "thumbnail", "write_variants"]
