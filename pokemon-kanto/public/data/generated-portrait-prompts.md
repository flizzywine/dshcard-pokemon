# Project-original portraits, 0.9.0

These three images were generated with the built-in `image_gen` tool. They are new fan illustrations, not downloaded official art. The following are consolidated reproduction prompts and art direction; they are not represented as a verbatim export of the original tool requests. Original generated PNGs were retained in `<LOCAL_HOME>/.codex/generated_images/01a16825-a621-7960-8af3-e26e8fa60297/` and copied unmodified into the project.

## Yellow, child version

Final: `public/assets/trainers/project-original/yellow-child-v2.png`.
Original: `exec-cbc24cbf-e5d8-488d-9df9-a56868a3300f.png`.

Prompt direction: Full-body transparent-background character cutout for a Pokémon visual-novel stage. Yellow from Pokémon Adventures, visibly a young child with a short, childlike silhouette, large straw hat, blond ponytail, red shirt, blue vest, purple trousers and fishing rod. Friendly, thoughtful expression. Clean anime linework and soft cel shading. Entire hat, rod and feet inside the canvas with breathing room. No text, no scene, no adult proportions. Match the illustrated stage rather than pixel art.

The first, older-looking variant was rejected for the role and is not referenced by the trainer manifest. The selected image has `ageGroup:child` and a 0.72 stage scale.

## Bill

Final: `public/assets/trainers/project-original/bill-v1.png`.
Original: `exec-69b45ee3-3841-4c0c-bae7-22aa67d81ddf.png`.

Prompt direction: Full-body transparent-background fan illustration of Bill, the Kanto Pokémon researcher. Green hair, white laboratory coat over a lavender outfit with a bow tie, approachable young adult researcher expression. Clean anime linework, readable silhouette, soft cel shading, neutral standing pose suitable for dialogue. Keep the full head and feet in frame. No text, no background, no pixel art.

## Mr Fuji

Final: `public/assets/trainers/project-original/fuji-v1.png`.
Original: `exec-003f363c-83d9-408d-ad2b-8e4484f043c8.png`.

Prompt direction: Full-body transparent-background fan illustration of Mr Fuji, an elderly Kanto Pokémon caretaker. Bald head with white side hair, kind face, purple wrap-style clothing, gray trousers, holding a folded cloth. Modest calm standing pose for a rescue and care dialogue. Clean anime linework and soft cel shading. Whole head, hands and feet visible; no text, no background, no pixel art.

## Gary and Green

The drawing service rejected the requested redraws; no successful full-body redraw is claimed. Gary uses a separately sourced official anime portal profile image, with a declared display crop. Green uses the existing game Blue image as an explicitly labelled adaptation. Their identities, image files and aliases remain separate. The source URLs and hashes are in `trainers.json`.


## Gary replacement, 0.9.1

Both generation and reference redraw requests were rejected by the drawing service; no new generated Gary is claimed. The old blue profile card is superseded by the unmodified transparent original-series full-body image documented at https://www.wikidex.net/wiki/Archivo:Gary_Oak_serie_original.png . Rival entries set overrideStageArt to replace stale blue-card stage figures. Eight new anonymous original NPC illustrations are documented separately in generated-npc-prompts-091.md.


## Selected art at final 0.9.1 delivery

The user requested another generation attempt for Gary and Nurse Joy. Both selected outputs succeeded with the built-in image_gen tool and are copied unmodified into project-original/gary-v3.png and project-original/nurse-joy-v1.png. These now supersede both earlier sourced portraits. Recorded prompts, original output paths and hashes are in generated-portraits-091.md and trainers.json. Earlier failure/source sections in this document are history, not the selected current art.
