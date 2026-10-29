# FireRed / LeafGreen character and scene assets

## Source snapshot

Trainer portraits and six location-preview tile sets are from [`pret/pokefirered`](https://github.com/pret/pokefirered), pinned to commit [`ce6406d8c2eaf46d543c8a2606de0c3cb1951982`](https://github.com/pret/pokefirered/tree/ce6406d8c2eaf46d543c8a2606de0c3cb1951982). The repository's `LICENSE` is GPL-3.0; that license applies to the decompilation project and does not transfer ownership of the underlying Pokémon game artwork.

### Trainer PNGs

`trainers.json` lists portraits for Professor Oak, Red, Leaf, the early and champion rival, all eight Kanto Gym Leaders, and the four Kanto Elite Four. Those portraits are the original FireRed/LeafGreen graphics under `graphics/trainers/front_pics/`. The retained Nurse Joy fallback `assets/trainers/nurse_joy.png` comes from `graphics/object_events/pics/people/nurse.png`: the first 16×32 pixel frame was cropped from the 64×32 overworld sheet and enlarged 4× using nearest-neighbor scaling. The active `nurse_joy` manifest image now uses official original-series Nurse Joy character art; its source and dimensions are documented in `trainers-sources.md`.

### Location backgrounds

Six scenes (Viridian Forest, Mt. Moon, Rock Tunnel, Pokémon Tower, Victory Road, and Cerulean Cave) are composed from original `graphics/map_preview/{location}/tiles.png` and `tilemap.bin` pairs at the pinned commit. The map-preview interface margin was cropped and the pixel art enlarged using nearest-neighbor scaling. These are original in-game map-preview scenes, not generated art or complete walking-map captures.

Two opening scenes were added from FireRed/LeafGreen screenshots: Professor Oak's Lab from [RetailRNG's FRLG starter guide](https://retailrng.com/frlg/beginner/frlgstarter/) and Pallet Town from [Guide Strats' FRLG guide](https://guidestrats.com/pokemon-frlg-friendship-checker/). The Pallet Town source is a JPEG converted to PNG; the screenshot content was not otherwise edited.

The screenshot source pages do not grant a general reuse license for the game images. Pokémon names, characters, and game graphics remain franchise materials associated with Nintendo, Creatures Inc., GAME FREAK inc., and The Pokémon Company; rights remain with their respective owners. The URLs above identify the source copies, not a license grant or endorsement. This is an unofficial fan project.

### Common trainer-class portraits

An additional 29 battle portraits were added from the same pinned `pret/pokefirered` snapshot and source directory, `graphics/trainers/front_pics/`: Bug Catcher, Youngster, Lass, Hiker, Sailor, Camper, Picnicker, Super Nerd, Poké Maniac, male/female Swimmer, Beauty, Biker, Scientist, male/female Team Rocket Grunt, Gentleman, Channeler, male/female Cool Trainer, male/female Psychic, Black Belt, Burglar, Bird Keeper, Cue Ball, Engineer, Juggler, and Fisherman. The downloaded files are the original 64×64 indexed PNGs; palette index 0 is transparent (the source PNG `tRNS` chunk marks index 0 with alpha 0). They are kept as 64×64 portraits without recoloring, scaling, or conversion.

Each added `trainers.json` entry uses the corresponding portrait key as its `id`, with Simplified Chinese display names and common aliases. These are trainer-class archetypes rather than named individuals. Use the class-specific IDs for scenes where gender matters; broad aliases such as “游泳者” resolve to the male swimmer entry, while the female entry has gender-specific aliases.

For native cast registration, treat `trainers.json` as an available catalogue, not a list to register in full. Match the current scene/encounter's trainer class to one or two IDs, combine them with only the relevant named NPC portraits, and prioritize the active player party and current opponent Pokémon sprites. Enforce the host's 50-entry limit after deduplication; if the scene has a full opposing team, omit unrelated NPC archetypes before dropping participants in the current battle. The class portraits are shared art assets and require no per-scene copying.

### Original battle terrain sheets

Eight battle terrain tilesheets (grass, long grass, indoor, building, cave, water, pond, and sand) were downloaded unchanged from `pret/pokefirered` commit `ce6406d8c2eaf46d543c8a2606de0c3cb1951982`, under `graphics/battle_terrain/<terrain>/terrain.png`. The PNGs are 64 pixels wide and 80–104 pixels tall, with the original indexed palette/transparency. They are terrain atlases used by the FRLG engine together with the matching `.bin` map and palette files; they are not complete full-screen background images and should not be stretched to fill the battle stage. `public/data/battle-backgrounds.json` maps these source atlases to Kanto field/cave/indoor/water nodes and explicitly marks them as `terrain-tile-atlas` for a future layered renderer.

The fixed source commit is under the repository's GPL-3.0 license, which covers the decompilation project. Game artwork and Pokémon materials remain owned by their respective Nintendo, Creatures Inc., GAME FREAK inc., and The Pokémon Company rights holders; this source identification does not grant a separate redistribution license.

### FRLG city-map backgrounds

Nine original FireRed / LeafGreen town-map PNGs were added unchanged from The Video Game Atlas (VGMaps), all credited there to map ripper Jaromaru: Pewter City, Cerulean City, Vermilion City, Lavender Town, Celadon City, Saffron City, Fuchsia City, Cinnabar Island, and Viridian City. The image URLs are listed individually in `public/data/backgrounds.json`; the source catalogue is [VGMaps GBA maps](https://www.vgmaps.com/atlas/GBA/index.htm). These are full map screenshots from FRLG, not generated backgrounds or maps from another generation. VGMaps attribution identifies the ripper and source but does not itself grant a general redistribution license. Pokémon game artwork remains the property of its respective rights holders; files are included here for this local, unofficial project and carry no claim of endorsement or broader reuse rights.

Original FireRed / LeafGreen route-map PNGs for Routes 01–25 are included, with Routes 01–04 and 05–25 mapped individually to their matching route nodes. Additional exact FRLG maps cover Diglett's Cave B1F, Safari Zone Center Area, Seafoam Islands 1F, Power Plant, and Victory Road 1F. VGMaps credits the route and area maps to Jaromaru; the FRLG Kanto overview is credited to Anthony Lin and Samuel Harbord. Individual source image URLs and node mappings are recorded in `public/data/backgrounds.json`. VGMaps' FRLG catalog has no standalone Indigo Plateau scene map, so that node uses a clearly marked regional-overview fallback from the same FRLG Kanto overview asset. Indigo Plateau maps found for the original Game Boy titles and the similarly named Pokémon League map in Ruby / Sapphire were excluded rather than presented as FRLG scenery. VGMaps identifies map creators but does not itself grant a general redistribution license; Pokémon artwork remains with its respective rights holders.

Eight FireRed / LeafGreen gym-interior PNGs were added for Pewter, Cerulean, Vermilion, Celadon, Fuchsia, Saffron, Cinnabar, and Viridian City. VGMaps credits these maps to Lord RM. They carry `sceneTags` such as `gym:pewter` and an empty `locations` list, so a stage renderer can select them for a gym scene without changing the default town background. The FRLG catalog contains no Pokémon Center or Poké Mart interior entry; no such background is claimed or substituted from another game. The scene-tagged maps should be selected from the active scene/event tag before applying the ordinary map-node background.

### Additional illustrated environment analogues

Seventeen additional 512×512 PNG backgrounds were added unchanged from `MaNeRz/Pokemon-Masters-EX-Asset-Library` at commit `ba912f25a69c5aa99fe813b6e7a7338eb239b4de`. Each entry in `public/data/backgrounds.json` records its exact source path, pinned media URL, dimensions, PNG color type, and SHA-256. The images were visually inspected and decoded to verify that all 262,144 pixels in each image are fully opaque. They are Master EX environments used as broad city, village, road, forest, cave, coast, tournament, and Team Rocket exterior analogues; none is described as an exact FRLG/Kanto location. The arena images can support tournament scenes, and the Team Rocket-branded compound is only an exterior villain-base analogue, not the FRLG Rocket Hideout.

The source library contains no accurate high-resolution FRLG interior backgrounds for Professor Oak's lab, Pokémon Centers, Poké Marts, the S.S. Anne interior, or the Rocket Hideout. Existing exact FRLG pixel maps remain separately available for manual retro use; they were not enlarged or relabeled as high-resolution artwork. The Masters EX asset library is a community-indexed game-asset extraction and provides provenance, not a general redistribution license. Pokémon assets remain the property of their respective rights holders.

### Project-original illustrated interiors

Five 1672×941 PNG interiors were generated for this project on 2026-10-25 with OpenAI image generation: an Oak-inspired research lab, Pokémon Center, Poké Mart, S.S. Anne-style captain cabin, and rock-type gym. They contain no people, Pokémon, dialogue UI or text. Their entries are marked `generated: true` with file SHA-256, dimensions and scene tags in `original-backgrounds.json`, `backgrounds.json` and `story-scenery.json`. They are project-original interpretations, not official images, original game screenshots, or pixel-exact maps. Tagged scene selection prefers these illustrations, while original FRLG maps remain available for the manual retro mode.
