# Cartoon v1 — HC-VIS-001B

Original production artwork created with the built-in ImageGen tool from the owner's approved reference, under DEC-015/017. This directory names the approved **style family**; the new assets remain **IMPLEMENTED, ENGINE_REVIEW_PENDING**.

![Layout proof](../../../docs/art-preview/cartoon-v1/layout-proof.png)

This is an assembly of shipped textures at the existing game scales and selected room positions. It is **not an engine screenshot**, and it does not demonstrate a complete guest journey or device performance. The economy room shows its included bed; purchased decorations are not shown in this proof.

| Source | Runtime consumer |
|---|---|
| lobby.png | room.lobby base/night/dirty/thumb, 256×96 logical |
| economy.png | room.economy base/night/dirty/thumb, 128×96 logical |
| counter.png | room.lobby.front, transparent, 256×96 logical |
| bed.png | decor.bed.cot, transparent, 104×64 logical |
| guest-standard-poses.png | guest.standard sheet and thumbnail |
| receptionist-poses.png | staff.receptionist sheet and thumbnail |
| cleaner-poses.png | staff.cleaner sheet and thumbnail |

All runtime files export at 1× and 2×. Character frames remain 48×72 with pivot (24,70). The frame order/count/FPS comes from data/animations; exports.json records the source-pose mapping and every output's dimensions and hash. sources.json pins the unmodified selected originals. prompts.json records the exact generation and correction prompts. Background removal was performed by ImageGen, before the compiler receives actual RGBA sources.

`npm run gen:art:approved` exports only this sample and refreshes the manifest; it needs Python 3 and Pillow as the existing art tooling does. It crops, resamples, aligns and packs already-drawn art; room night/dirty states reuse the existing game transforms. Sources are never overwritten. `npm run check:art` validates the committed source/output hashes and manifest dimensions with Node only and also runs during the normal build.

The legacy `gen:art` stops before writing. Direct legacy generator calls also refuse each protected output through hcstyle.save_png. There is no bypass flag; other unprotected asset IDs remain exportable. Version source changes deliberately, re-export and review their new output hashes.

## Remaining visual work

- The walk and work rows are authored pose sequences; passing pixel checks does not prove physically convincing locomotion or hand contact. They require in-engine review.
- The guest's happy clip has three unique poses and holds the last for a fourth beat. The cleaner idle row alternates two poses. This is explicit in exports.json.
- The sleep artwork is raised above the shared floor pivot to rest on the included cot's mattress. Different upgraded beds and final front blanket occlusion still need alignment review.
- Large-room furniture, elevator doors/cabin/transition, remaining rooms and characters, UI and audio are outside this first production batch.
- Portrait/landscape engine captures and iPhone/Android measurements remain required by HC-VIS-001-SPEC before visual approval.
