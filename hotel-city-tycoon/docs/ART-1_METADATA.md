# ART-1 Metadata

| assetKey | defId | scene 1× | scene 2× | anchor | visual bounds | footprint/hitbox | interaction points | layer | الحالة (normal فقط في ART-1) |
|---|---|---|---|---|---|---|---|---|---|
| `room.economy.base` | `economy` | `public/assets/rooms/economy_base.png` — 128×96 | `public/assets/@2x/rooms/economy_base.png` — 256×192 | top-left `(0,0)` | 128×96 | room hitbox 128×96 | `door` `(106,64)`; `passage` `(106,78)` | `room.backplate` | normal |
| `decor.wallpaper.plain` | `wallpaper_plain` | `public/assets/decor/wallpaper_plain.png` — 96×72 | `public/assets/@2x/decor/wallpaper_plain.png` — 192×144 | wall-center `(0.5,0.5)` | 96×72 | no movement collision; interaction hitbox 88×64 | — | `room.decorBack` | normal |
| `decor.flooring.concrete` | `flooring_concrete` | `public/assets/decor/flooring_concrete.png` — 72×72 | `public/assets/@2x/decor/flooring_concrete.png` — 144×144 | floor-center `(0.5,0.5)` | 72×72 | no movement collision; interaction hitbox 64×64 | — | `room.decorBack` | normal |
| `decor.bed.single` | `bed_single` | `public/assets/decor/bed_single.png` — 104×64 | `public/assets/@2x/decor/bed_single.png` — 208×128 | bottom-center `(0.5,1)` | 104×64 | footprint 96×24 | `sleep`, `standLeft`, `standRight` | `room.characters` — footY sorted | normal |
| `decor.seating.armchair` | `seating_armchair` | `public/assets/decor/seating_armchair.png` — 72×72 | `public/assets/@2x/decor/seating_armchair.png` — 144×144 | bottom-center `(0.5,1)` | 72×72 | footprint 56×24 | `sit`, `stand` | `room.characters` — footY sorted | normal |
| `decor.table.deskWood` | `table_deskWood` | `public/assets/decor/table_deskWood.png` — 72×72 | `public/assets/@2x/decor/table_deskWood.png` — 144×144 | bottom-center `(0.5,1)` | 72×72 | footprint 56×22 | `work`, `stand` | `room.characters` — footY sorted | normal |
| `decor.lighting.lamp` | `lighting_lamp` | `public/assets/decor/lighting_lamp.png` — 72×48 | `public/assets/@2x/decor/lighting_lamp.png` — 144×96 | top-center `(0.5,0)` | 72×48 | no movement collision; interaction hitbox 24×16 | — | `room.decorBack` | normal |
| `decor.wallArt.poster` | `wallArt_poster` | `public/assets/decor/wallArt_poster.png` — 96×72 | `public/assets/@2x/decor/wallArt_poster.png` — 192×144 | wall-center `(0.5,0.5)` | 96×72 | no movement collision; interaction hitbox 80×56 | — | `room.decorBack` | normal |
| `decor.plant.fern` | `plant_fern` | `public/assets/decor/plant_fern.png` — 72×72 | `public/assets/@2x/decor/plant_fern.png` — 144×144 | bottom-center `(0.5,1)` | 72×72 | footprint 40×20 | `clean`, `stand` | `room.characters` — footY sorted | normal |
| `decor.rug.mat` | `rug_mat` | `public/assets/decor/rug_mat.png` — 72×72 | `public/assets/@2x/decor/rug_mat.png` — 144×144 | floor-center `(0.5,0.5)` | 72×72 | non-blocking footprint 64×16 | — | `room.characters` — footY sorted | normal |
| `decor.luxury.aquarium` | `luxury_aquarium` | `public/assets/decor/luxury_aquarium.png` — 72×72 | `public/assets/@2x/decor/luxury_aquarium.png` — 144×144 | bottom-center `(0.5,1)` | 72×72 | footprint 64×28 | `stand`, `effectOrigin` | `room.characters` — footY sorted | normal |

## Proposed thumbnail entries for integration

| key | defId | thumbnail 1× | thumbnail 2× |
|---|---|---|---|
| `decor.wallpaper.plain.thumb` | `wallpaper_plain` | `public/assets/decor/thumbs/wallpaper_plain.png` — 64×64 | `public/assets/@2x/decor/thumbs/wallpaper_plain.png` — 128×128 |
| `decor.flooring.concrete.thumb` | `flooring_concrete` | `public/assets/decor/thumbs/flooring_concrete.png` — 64×64 | `public/assets/@2x/decor/thumbs/flooring_concrete.png` — 128×128 |
| `decor.bed.single.thumb` | `bed_single` | `public/assets/decor/thumbs/bed_single.png` — 64×64 | `public/assets/@2x/decor/thumbs/bed_single.png` — 128×128 |
| `decor.seating.armchair.thumb` | `seating_armchair` | `public/assets/decor/thumbs/seating_armchair.png` — 64×64 | `public/assets/@2x/decor/thumbs/seating_armchair.png` — 128×128 |
| `decor.table.deskWood.thumb` | `table_deskWood` | `public/assets/decor/thumbs/table_deskWood.png` — 64×64 | `public/assets/@2x/decor/thumbs/table_deskWood.png` — 128×128 |
| `decor.lighting.lamp.thumb` | `lighting_lamp` | `public/assets/decor/thumbs/lighting_lamp.png` — 64×64 | `public/assets/@2x/decor/thumbs/lighting_lamp.png` — 128×128 |
| `decor.wallArt.poster.thumb` | `wallArt_poster` | `public/assets/decor/thumbs/wallArt_poster.png` — 64×64 | `public/assets/@2x/decor/thumbs/wallArt_poster.png` — 128×128 |
| `decor.plant.fern.thumb` | `plant_fern` | `public/assets/decor/thumbs/plant_fern.png` — 64×64 | `public/assets/@2x/decor/thumbs/plant_fern.png` — 128×128 |
| `decor.rug.mat.thumb` | `rug_mat` | `public/assets/decor/thumbs/rug_mat.png` — 64×64 | `public/assets/@2x/decor/thumbs/rug_mat.png` — 128×128 |
| `decor.luxury.aquarium.thumb` | `luxury_aquarium` | `public/assets/decor/thumbs/luxury_aquarium.png` — 64×64 | `public/assets/@2x/decor/thumbs/luxury_aquarium.png` — 128×128 |
