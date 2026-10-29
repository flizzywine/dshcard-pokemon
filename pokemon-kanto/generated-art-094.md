# 0.9.4 original Rocket executive portraits

Three separate portrait assets were generated with the built-in image generation tool on 2026-10-26 for named Kanto Rocket story characters. Each is a 1024×1536 RGBA PNG. The stored metadata uses alpha threshold 16 and records the bounding box of every pixel whose alpha exceeds that threshold. Headwear/hair and both boots are inside the image bounds.

| Character | Asset | SHA-256 | Alpha bounds (x, y, w, h) |
|---|---|---|---|
| 雅典娜 / Ariana | `public/assets/trainers/project-original/ariana-rocket-v1.png` | `eb95799913500eff896025cecb01e358677fdd2ca77d2335730ab9d58e22bf96` | `277, 15, 556, 1498` |
| 兰斯 / Proton | `public/assets/trainers/project-original/proton-rocket-v1.png` | `f87a80c059c23bafe6b258bdf5342a36418071229cd8f9a80b10677531981c7d` | `225, 9, 625, 1518` |
| 拉姆达 / Petrel | `public/assets/trainers/project-original/petrel-rocket-v1.png` | `a6a8bd7d4012663ed41b125d24326389cbaf8a1807470623a25630d75c64f8f0` | `249, 5, 621, 1523` |

Ariana is an adult woman with a short red bob and calm expression, in a white executive uniform with black gloves and tall boots. Proton is an adult man with short teal-green hair and a dark trainer cap, in a white uniform jacket over black clothing; a follow-up edit removed the chest letter emblem. His alias is `Lance (Rocket)` and the manifest deliberately does not give him the bare alias `Lance`, keeping him distinct from the Elite Four member 渡. Petrel is an adult man with short purple hair, a pointed goatee and a sly smile, wearing a white executive coat and dark boots.

The portraits use only their character-specific `trainers.json` entries. `npc-portraits.json.namedCharacters` records them with `displayEligible: false` and `fallbackEligible: false`, so they cannot be selected as generic townspeople or anonymous trainers. The existing `trainer_archer` entry retains its current image and gains aliases `阿波罗` and `Apollo`.

All art is project-original image-generation output, not a copied game screenshot or third-party character render. Generation tool: built-in `image_gen`; no CLI/API fallback was used. Final files were copied from the generated-image workspace without image resizing or compositing. Transparency was checked from decoded pixels: each PNG has four-channel alpha, all four canvas corners have alpha 0, and the recorded alpha bounds contain the complete character silhouette. Source paths and prompts are recorded per entry in `public/data/trainers.json`.

## Generation briefs

- **Ariana:** original adult female team executive, crisp short red bob, calm composed face, tailored white uniform over a dark underlayer, black gloves and tall boots; centered upright full body, refined anime cel shading, transparent canvas, no backdrop/floor/glow/logo/text/props/other figures.
- **Proton:** original adult male team executive distinct from Elite Four 渡, short teal-green hair and dark trainer cap, white jacket over black shirt, gloves, dark trousers and boots; cel-shaded full-body portrait, transparent canvas, no backdrop/floor/glow/logo/text/props. A built-in image edit removed the generated chest mark.
- **Petrel:** original adult male strategist, short purple hair, pointed goatee, sly smile, white executive coat over dark clothes with black gloves and boots; centered full body, refined cel shading and transparent canvas, no backdrop/floor/glow/logo/text/weapons/props.

No Pokémon game logos or symbols were added to the new portraits. Character names and setting remain franchise references; artwork ownership and trademark rights remain with their respective holders.
