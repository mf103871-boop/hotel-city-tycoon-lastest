#!/usr/bin/env python3
"""
Characters, decor, UI icons and hazard effects.

Characters are 48x72 and read from twelve feet away on a phone, which means
they cannot rely on facial detail. Each one is separated by silhouette and
uniform colour instead: the chef's hat, the lifeguard's float, the celebrity's
sunglasses. A player should know who is who without reading a label.

Run: python3 tools/art/gen_props.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image
from style import SS, P, canvas, rect, outline, ellipse

CH_W, CH_H = 48, 72


# ---------------------------------------------------------------- characters

def figure(d, W, H, *, uniform, trim=None, skin=None, hair=None,
           hat=None, prop=None, apron=False, glasses=False):
    """
    One body plan, varied by colour and accessory.

    Sharing the plan is what keeps twenty characters looking like staff of the
    same hotel rather than a sticker sheet.
    """
    skin = skin or P["skin"]
    hair = hair or P["hair"]
    cx = W // 2

    # legs
    rect(d, cx - 7 * SS, int(H * 0.72), 5 * SS, int(H * 0.24), P["dark"])
    rect(d, cx + 2 * SS, int(H * 0.72), 5 * SS, int(H * 0.24), P["dark"])
    # shoes
    rect(d, cx - 8 * SS, int(H * 0.94), 7 * SS, int(H * 0.06), P["floor_dark"])
    rect(d, cx + 1 * SS, int(H * 0.94), 7 * SS, int(H * 0.06), P["floor_dark"])

    # torso
    rect(d, cx - 9 * SS, int(H * 0.38), 18 * SS, int(H * 0.36), uniform)
    if apron:
        rect(d, cx - 6 * SS, int(H * 0.46), 12 * SS, int(H * 0.28), P["linen"])
    if trim:
        rect(d, cx - 9 * SS, int(H * 0.38), 18 * SS, 2 * SS, trim)
        rect(d, cx - SS, int(H * 0.4), 2 * SS, int(H * 0.34), trim)

    # arms
    rect(d, cx - 12 * SS, int(H * 0.4), 4 * SS, int(H * 0.28), uniform)
    rect(d, cx + 8 * SS, int(H * 0.4), 4 * SS, int(H * 0.28), uniform)
    rect(d, cx - 12 * SS, int(H * 0.66), 4 * SS, 3 * SS, skin)
    rect(d, cx + 8 * SS, int(H * 0.66), 4 * SS, 3 * SS, skin)

    # head
    rect(d, cx - 7 * SS, int(H * 0.14), 14 * SS, int(H * 0.24), skin)
    rect(d, cx - 7 * SS, int(H * 0.14), 14 * SS, int(H * 0.07), hair)
    if glasses:
        rect(d, cx - 6 * SS, int(H * 0.24), 12 * SS, 3 * SS, P["dark"])
    else:
        rect(d, cx - 4 * SS, int(H * 0.26), 2 * SS, 2 * SS, P["dark"])
        rect(d, cx + 2 * SS, int(H * 0.26), 2 * SS, 2 * SS, P["dark"])

    if hat == "chef":
        rect(d, cx - 7 * SS, int(H * 0.02), 14 * SS, int(H * 0.13), P["white"])
        rect(d, cx - 8 * SS, int(H * 0.12), 16 * SS, 3 * SS, P["linen_sh"])
    elif hat == "cap":
        rect(d, cx - 8 * SS, int(H * 0.11), 16 * SS, 5 * SS, uniform)
        rect(d, cx - 10 * SS, int(H * 0.15), 20 * SS, 2 * SS, trim or uniform)
    elif hat == "bell":
        rect(d, cx - 6 * SS, int(H * 0.08), 12 * SS, 6 * SS, P["red"])
        rect(d, cx - 6 * SS, int(H * 0.13), 12 * SS, 2 * SS, P["brass"])
    elif hat == "sun":
        rect(d, cx - 10 * SS, int(H * 0.13), 20 * SS, 2 * SS, P["linen"])
        rect(d, cx - 6 * SS, int(H * 0.07), 12 * SS, 6 * SS, P["linen"])

    if prop == "tray":
        rect(d, cx + 10 * SS, int(H * 0.6), 10 * SS, 2 * SS, P["brass"])
        rect(d, cx + 13 * SS, int(H * 0.55), 4 * SS, 5 * SS, P["white"])
    elif prop == "mop":
        rect(d, cx + 12 * SS, int(H * 0.28), 2 * SS, int(H * 0.6), P["floor_hi"])
        rect(d, cx + 9 * SS, int(H * 0.82), 8 * SS, 5 * SS, P["linen_sh"])
    elif prop == "float":
        ellipse(d, cx + 8 * SS, int(H * 0.5), 12 * SS, 12 * SS, P["red"])
        ellipse(d, cx + 11 * SS, int(H * 0.55), 6 * SS, 6 * SS, (0, 0, 0, 0))
    elif prop == "case":
        rect(d, cx + 10 * SS, int(H * 0.62), 9 * SS, 7 * SS, P["floor_hi"])
        rect(d, cx + 13 * SS, int(H * 0.59), 3 * SS, 3 * SS, P["brass_dim"])
    elif prop == "tools":
        rect(d, cx + 10 * SS, int(H * 0.6), 9 * SS, 8 * SS, P["red"])
        rect(d, cx + 13 * SS, int(H * 0.57), 3 * SS, 3 * SS, P["grey"])
    elif prop == "clipboard":
        rect(d, cx + 9 * SS, int(H * 0.5), 8 * SS, 11 * SS, P["linen"])
        rect(d, cx + 9 * SS, int(H * 0.5), 8 * SS, 2 * SS, P["brass_dim"])
    elif prop == "luggage":
        rect(d, cx + 10 * SS, int(H * 0.66), 10 * SS, 9 * SS, P["floor_hi"])
        rect(d, cx + 10 * SS, int(H * 0.66), 10 * SS, 2 * SS, P["brass_dim"])
    elif prop == "camera":
        # Hung on the chest, not floating beside the body — an earlier version
        # placed it off the silhouette entirely and it read as a stray dot.
        rect(d, cx - 5 * SS, int(H * 0.42), 10 * SS, 2 * SS, P["dark"])
        rect(d, cx - 5 * SS, int(H * 0.5), 10 * SS, 7 * SS, P["dark"])
        ellipse(d, cx - 2 * SS, int(H * 0.52), 5 * SS, 5 * SS, P["glass"])


STAFF = {
    "receptionist": dict(uniform=P["blue"], trim=P["brass"], prop="clipboard"),
    "cleaner":      dict(uniform=P["green"], apron=True, prop="mop"),
    "barista":      dict(uniform=P["floor_hi"], apron=True, prop="tray"),
    "trainer":      dict(uniform=P["red"], hat="cap", trim=P["white"]),
    "chef":         dict(uniform=P["white"], hat="chef", apron=True),
    "launderer":    dict(uniform=P["teal"], apron=True),
    "bartender":    dict(uniform=P["dark"], trim=P["brass"], prop="tray"),
    "attendant":    dict(uniform=P["purple_hi"], hat="cap"),
    "usher":        dict(uniform=P["red"], hat="bell", trim=P["brass"]),
    "engineer":     dict(uniform=P["brass_dim"], hat="cap", prop="tools"),
    "therapist":    dict(uniform=P["wall_spa"], apron=True),
    "concierge":    dict(uniform=P["dark"], trim=P["brass"], prop="case"),
    "lifeguard":    dict(uniform=P["red_hi"], prop="float", hat="cap", trim=P["white"]),
}

GUESTS = {
    "standard":  dict(uniform=P["grey"], prop="luggage"),
    "tourist":   dict(uniform=P["green_hi"], hat="sun", prop="camera"),
    "family":    dict(uniform=P["purple_hi"], prop="luggage"),
    "business":  dict(uniform=P["dark"], trim=P["white"], prop="case"),
    "vip":       dict(uniform=P["purple"], trim=P["brass"], glasses=True, prop="luggage"),
    "celebrity": dict(uniform=P["brass"], trim=P["white"], glasses=True, hair=P["linen"]),
    "inspector": dict(uniform=P["wall_hi"], trim=P["grey"], prop="clipboard"),
}


def render_character(kind, name, opts):
    img, d = canvas(CH_W, CH_H)
    figure(d, CH_W * SS, CH_H * SS, **opts)
    base = img.resize((CH_W, CH_H), Image.LANCZOS)
    out = "public/assets/characters"
    os.makedirs(out, exist_ok=True)
    written = []
    for suffix, im in (
        ("idle", base),
        ("thumb", base.resize((64, 64), Image.LANCZOS)),
        ("work", base),
        ("sleep", base),
    ):
        if kind == "staff" and suffix == "sleep":
            continue
        if kind == "guest" and suffix == "work":
            continue
        path = f"{out}/{kind}_{name}_{suffix}.png"
        im.save(path)
        written.append(path)
    return written


# ---------------------------------------------------------------- decor

SLOT_SIZE = {"wall": (96, 72), "floor": (72, 72), "ceiling": (72, 48), "bed": (104, 64)}

CATEGORY_COLOUR = {
    "wallpaper": P["wall_hi"], "flooring": P["floor_hi"], "bed": P["linen"],
    "seating": P["red"], "table": P["floor_hi"], "lighting": P["brass"],
    "wallArt": P["purple"], "plant": P["green"], "rug": P["red_hi"], "luxury": P["brass"],
}


def render_decor(item):
    w, h = SLOT_SIZE.get(item["slotType"], (72, 72))
    img, d = canvas(w, h)
    W, H = w * SS, h * SS
    base = CATEGORY_COLOUR.get(item["category"], P["grey"])
    tier = min(item.get("tier", 1), 6)
    cat = item["category"]

    if cat in ("wallpaper", "flooring"):
        rect(d, 0, 0, W, H, base)
        for i in range(tier + 1):
            rect(d, int(W * 0.1) * i, 0, max(1, SS), H, P["brass_lo"] if tier > 2 else P["wall_lo"])
    elif cat == "bed":
        rect(d, 0, int(H * 0.4), W, int(H * 0.6), P["floor_hi"])
        rect(d, 0, int(H * 0.4), W, int(H * 0.3), base)
        rect(d, 0, int(H * 0.4), int(W * 0.22), int(H * 0.3), P["linen_sh"])
        rect(d, 0, int(H * 0.1), max(2, SS + tier), int(H * 0.9), P["brass_dim"] if tier > 2 else P["brass_lo"])
    elif cat == "seating":
        rect(d, int(W * 0.15), int(H * 0.5), int(W * 0.7), int(H * 0.2), base)
        rect(d, int(W * 0.15), int(H * 0.2), int(W * 0.12), int(H * 0.34), base)
        rect(d, int(W * 0.2), int(H * 0.7), max(2, SS), int(H * 0.3), P["floor_dark"])
        rect(d, int(W * 0.72), int(H * 0.7), max(2, SS), int(H * 0.3), P["floor_dark"])
    elif cat == "table":
        rect(d, int(W * 0.1), int(H * 0.42), int(W * 0.8), int(H * 0.1), base)
        rect(d, int(W * 0.45), int(H * 0.52), int(W * 0.1), int(H * 0.44), P["floor_dark"])
        rect(d, int(W * 0.3), int(H * 0.94), int(W * 0.4), int(H * 0.06), P["floor_dark"])
    elif cat == "lighting":
        rect(d, int(W * 0.48), 0, max(1, SS), int(H * 0.4), P["brass_lo"])
        rect(d, int(W * 0.25), int(H * 0.4), int(W * 0.5), int(H * 0.16), base)
        rect(d, int(W * 0.3), int(H * 0.56), int(W * 0.4), int(H * 0.1), P["citylight"])
        for i in range(tier - 1):
            rect(d, int(W * 0.2) + i * int(W * 0.16), int(H * 0.66), 3 * SS, int(H * 0.14), P["citylight"])
    elif cat == "wallArt":
        rect(d, int(W * 0.1), int(H * 0.15), int(W * 0.8), int(H * 0.7), P["brass_dim"])
        rect(d, int(W * 0.15), int(H * 0.22), int(W * 0.7), int(H * 0.56), base)
        for i in range(tier):
            rect(d, int(W * 0.2) + i * int(W * 0.12), int(H * 0.3) + i * int(H * 0.06),
                 int(W * 0.1), int(H * 0.3), P["purple_hi"])
    elif cat == "plant":
        rect(d, int(W * 0.35), int(H * 0.62), int(W * 0.3), int(H * 0.38), P["floor_hi"])
        for ox, oy in ((-0.16, -0.2), (0, -0.3), (0.16, -0.2), (-0.08, -0.08), (0.08, -0.08)):
            rect(d, int(W * (0.5 + ox)) - 3 * SS, int(H * (0.62 + oy)), 7 * SS, 7 * SS, base)
    elif cat == "rug":
        rect(d, int(W * 0.06), int(H * 0.32), int(W * 0.88), int(H * 0.4), base)
        outline(d, int(W * 0.06), int(H * 0.32), int(W * 0.88), int(H * 0.4), P["brass_lo"])
        for i in range(tier):
            rect(d, int(W * 0.16) + i * int(W * 0.14), int(H * 0.44), int(W * 0.06), int(H * 0.16), P["brass_lo"])
    else:  # luxury
        rect(d, int(W * 0.2), int(H * 0.25), int(W * 0.6), int(H * 0.6), P["floor_hi"])
        rect(d, int(W * 0.2), int(H * 0.25), int(W * 0.6), int(H * 0.1), base)
        rect(d, int(W * 0.3), int(H * 0.42), int(W * 0.4), int(H * 0.28), P["citylight"])

    out = "public/assets/decor"
    os.makedirs(out, exist_ok=True)
    path = f"{out}/{item['id']}.png"
    img.resize((w, h), Image.LANCZOS).save(path)
    return path


# ---------------------------------------------------------------- ui + effects

def render_ui():
    out = "public/assets/ui"
    os.makedirs(out, exist_ok=True)
    written = []

    img, d = canvas(48, 48)
    W = 48 * SS
    ellipse(d, int(W * 0.1), int(W * 0.1), int(W * 0.8), int(W * 0.8), P["brass"])
    ellipse(d, int(W * 0.2), int(W * 0.2), int(W * 0.6), int(W * 0.6), P["citylight"])
    rect(d, int(W * 0.44), int(W * 0.28), int(W * 0.12), int(W * 0.44), P["brass_dim"])
    p = f"{out}/coins.png"
    img.resize((48, 48), Image.LANCZOS).save(p)
    written.append(p)

    img, d = canvas(48, 48)
    d.polygon([(W * 0.5, W * 0.1), (W * 0.9, W * 0.4), (W * 0.5, W * 0.9), (W * 0.1, W * 0.4)], fill=P["water_hi"])
    d.polygon([(W * 0.5, W * 0.1), (W * 0.7, W * 0.4), (W * 0.5, W * 0.55), (W * 0.3, W * 0.4)], fill=P["white"])
    p = f"{out}/gems.png"
    img.resize((48, 48), Image.LANCZOS).save(p)
    written.append(p)

    for hours in (2, 6, 12, 24, 48):
        img, d = canvas(64, 64)
        W = 64 * SS
        ellipse(d, int(W * 0.08), int(W * 0.08), int(W * 0.84), int(W * 0.84), P["brass_dim"])
        ellipse(d, int(W * 0.16), int(W * 0.16), int(W * 0.68), int(W * 0.68), P["dark"])
        frac = min(1.0, hours / 48)
        d.pieslice([int(W * 0.16), int(W * 0.16), int(W * 0.84), int(W * 0.84)],
                   -90, -90 + int(360 * frac), fill=P["brass"])
        ellipse(d, int(W * 0.4), int(W * 0.4), int(W * 0.2), int(W * 0.2), P["dark"])
        p = f"{out}/shift_{hours}h.png"
        img.resize((64, 64), Image.LANCZOS).save(p)
        written.append(p)
    return written


def render_effects(only=None):
    """All the incident art. `only` regenerates a subset by name, so the three
    4C additions can be refreshed without touching the shipped originals."""
    out = "public/assets/effects"
    os.makedirs(out, exist_ok=True)
    written = []
    S = 64 * SS

    def want(name):
        return only is None or name in only
    return written


def derive_characters_from_disk():
    """Produce thumb, work and sleep frames from whatever idle art is on disk."""
    out = "public/assets/characters"
    written = 0
    for f in sorted(os.listdir(out)) if os.path.isdir(out) else []:
        if not f.endswith("_idle.png"):
            continue
        base = Image.open(f"{out}/{f}").convert("RGBA")
        stem = f[:-len("_idle.png")]
        kind = "staff" if stem.startswith("staff_") else "guest"
        extra = ["work"] if kind == "staff" else ["sleep"]
        for suffix in ["thumb", *extra]:
            image = base.resize((64, 64), Image.LANCZOS) if suffix == "thumb" else base
            image.save(f"{out}/{stem}_{suffix}.png")
            written += 1
    return written


if __name__ == "__main__":
    if "--derive" in sys.argv:
        n = derive_characters_from_disk()
        print(f"  ✓ {n} character variants derived from supplied idle art")
        raise SystemExit(0)

    total = 0
    for name, opts in STAFF.items():
        total += len(render_character("staff", name, opts))
    print(f"  ✓ staff        {len(STAFF)} roles")
    for name, opts in GUESTS.items():
        total += len(render_character("guest", name, opts))
    print(f"  ✓ guests       {len(GUESTS)} types")

    decor = json.load(open("data/decor.json"))["items"]
    for item in decor:
        render_decor(item)
        total += 1
    print(f"  ✓ decor        {len(decor)} items")

    ui = render_ui()
    fx = render_effects()
    total += len(ui) + len(fx)
    print(f"  ✓ ui           {len(ui)} icons")
    print(f"  ✓ effects      {len(fx)} overlays")
    print(f"\n  {total} files written")
