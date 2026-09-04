#!/usr/bin/env python3
"""
Interface icons and incident art.

Thirteen small pictures that carry more weight per pixel than anything else in
the game: a coin the player sees a hundred times a session, and the six marks
that say something has gone wrong in a room. They are drawn to the same rules
as the rest of the art — deep navy outline, flat fill, no detail finer than two
pixels — but with one extra constraint. An icon is read at 24 pixels inside a
button, so its silhouette has to survive being halved again.

The drawings live in `ui_icons.py` as `ICONS: dict[str, callable]`, keyed by
the file each writes. The driver knows the sizes from `data/events.json` and
the manifest's own UI table, so a new event gets its icon slot automatically.

Run: python3 tools/art/gen_ui.py
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hcstyle import Canvas  # noqa: E402

import ui_icons             # noqa: E402

#: Mirrors the UI table in tools/gen-asset-manifest.mjs.
UI_FILES = {
    "ui/coins.png": (48, 48),
    "ui/gems.png": (48, 48),
    "ui/shift_2h.png": (64, 64),
    "ui/shift_6h.png": (64, 64),
    "ui/shift_12h.png": (64, 64),
    "ui/shift_24h.png": (64, 64),
    "ui/shift_48h.png": (64, 64),
}


def effect_files() -> dict[str, tuple[int, int]]:
    with open("data/events.json", encoding="utf8") as fh:
        events = json.load(fh)["events"]
    return {f"effects/{e['id']}.png": (64, 64) for e in events}


def generate() -> int:
    wanted = {**UI_FILES, **effect_files()}
    missing = sorted(set(wanted) - set(ui_icons.ICONS))
    if missing:
        raise SystemExit(f"no drawing routine for: {', '.join(missing)}")
    extra = sorted(set(ui_icons.ICONS) - set(wanted))
    if extra:
        raise SystemExit(f"drawing routines for files nothing asks for: {', '.join(extra)}")

    written = 0
    for path, (w, h) in sorted(wanted.items()):
        for tier in (1, 2):
            c = Canvas(w, h, tier=tier)
            ui_icons.ICONS[path](c)
            c.save(path)
            written += 1
    print(f"  {written} icon files ({len(wanted)} icons at 1x and 2x)")
    return written


if __name__ == "__main__":
    generate()
