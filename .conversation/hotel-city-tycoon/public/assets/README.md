# assets/

Drop art here. See `../../ASSET-SPEC.md` for the exact file list and dimensions.

The game runs without any of these — every missing texture falls back to the
procedural placeholder the renderer already draws. Add files one at a time and
run `npm run validate:data` to watch the counter climb.

    assets/
      manifest.json      generated — do not hand-edit
      rooms/             room interiors, sized to their block footprint
      decor/             furniture and fittings, transparent
      characters/        guests and staff, transparent
      effects/           hazard overlays and badges
      ui/                icons
      @2x/               optional: same tree at double resolution
