# Audio assets and provenance

The bundled OGG files are original FireRed/LeafGreen game soundtrack recordings made available for download in ENLS's Pre-Looped Music Library. The linked album identifies the game, publisher (Nintendo), track names and individual downloads. Files in this local prototype were downloaded on 2026-10-23; the site does not expose a source-control commit or an explicit open-content license for the game recordings.

| Local file | ENLS album track | Direct source |
|---|---|---|
| `assets/audio/wild.ogg` | FRLG 18 Battle (VS Wild Pokemon) | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2018%20Battle%20(VS%20Wild%20Pokemon).ogg) |
| `assets/audio/trainer.ogg` | FRLG 11 Battle (VS Trainer) | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2011%20Battle%20(VS%20Trainer).ogg) |
| `assets/audio/gym.ogg` | FRLG 27 Battle (VS Gym Leader) | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2027%20Battle%20(VS%20Gym%20Leader).ogg) |
| `assets/audio/rival.ogg` | FRLG 70 The Last Battle (VS Rival) | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2070%20The%20Last%20Battle%20(VS%20Rival).ogg) |
| `assets/audio/wild-victory.ogg` | FRLG 19 Victory (VS Wild Pokemon) | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2019%20Victory%20(VS%20Wild%20Pokemon).ogg) |
| `assets/audio/trainer-victory.ogg` | FRLG 12 Victory (VS Trainer) | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2012%20Victory%20(VS%20Trainer).ogg) |
| `assets/audio/gym-victory.ogg` | FRLG 28 Victory (VS Gym Leader) | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2028%20Victory%20(VS%20Gym%20Leader).ogg) |
| `assets/audio/caught.ogg` | FRLG 54 Fanfare! Pokemon Caught | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2054%20Fanfare!%20Pokemon%20Caught.ogg) |
| `assets/audio/heal.ogg` | FRLG 23 Pokemon Recovery | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2023%20Pokemon%20Recovery.ogg) | 
| `assets/audio/hit-normal.wav` | Ruby_000D.wav, Gen III normal damage sample | [Soundeffects Wiki page](https://soundeffects.fandom.com/wiki/Pok%C3%A9mon_Damage) · [file](https://static.wikia.nocookie.net/soundeffects/images/c/ca/Ruby_000D.wav/revision/latest?cb=20221013100045) |
| `assets/audio/hit-not-effective.wav` | Ruby_000C.wav, Gen III not-very-effective damage sample | [Soundeffects Wiki page](https://soundeffects.fandom.com/wiki/Pok%C3%A9mon_Not_Very_Effective_Damage) · [file](https://static.wikia.nocookie.net/soundeffects/images/0/06/Ruby_000C.wav/revision/latest?cb=20221013113127) |
| `assets/audio/hit-super-effective.wav` | Ruby_000E.wav, Gen III super-effective damage sample | [Soundeffects Wiki page](https://soundeffects.fandom.com/wiki/Pok%C3%A9mon_Super_Effective_Damage) · [file](https://static.wikia.nocookie.net/soundeffects/images/4/44/Ruby_000E.wav/revision/latest?cb=20221013112208) |

These are authentic game soundtrack tracks, not synthesized placeholders. ENLS lists a fanfare for catching and a recovery cue; the catch file is not the Poké Ball throw/impact sound. The three `hit-*.wav` clips are named Gen III Ruby/Sapphire samples from Soundeffects Wiki; their corresponding pages identify them as normal, not-very-effective, and super-effective damage sounds and list FireRed/LeafGreen among games using the effects. They are useful FRLG-era equivalents, although the downloadable WAV is identified as the Ruby sample rather than an FRLG dump. The pages describe community content as CC BY-SA unless otherwise noted; the sound recording itself is still Pokémon game audio, so no rights to redistribute the recording are implied. `audio.json` leaves `moves.scratch`, `moves.tackle`, and `moves.growl` empty because we could not retrieve verifiable individual move WAVs. The Sounds Resource FRLG archive names numeric clips such as `firered_0094.wav`; the pret source maps `SE_M_SCRATCH` to ID 148/0x94, but the 5.61 MB ZIP download returned HTTP 403 here. A 2012 PokéCommunity post links a Ruby debug-ROM sound pack, but MediaFire returned a repair HTML page instead of its RAR, so it was not used. We also inspected the Essentials `Audio/SE/Anim` asset directory, but its generic effects do not establish exact FRLG files for the three requested moves. In that `songs.h`, no dedicated `SE_M_TACKLE` or `SE_M_GROWL` symbols were found. The base damage samples are not relabeled as move-specific effects. `fail` is empty because no appropriate FRLG failed-move SFX file was retrievable; move immunity/no-effect has no damage cue in Gen III. `menu` is empty for the same archive access limitation. PokeAPI's cries repository contains Pokémon cries, not battle SFX, and is not used.

Pokémon, FireRed/LeafGreen, their music and sound recordings are the intellectual property of their respective owners, including Nintendo, Creatures Inc. and GAME FREAK inc. ENLS is a third-party music library; it does not grant a reuse license for Nintendo's recordings. The source site's own copyright/terms apply to its site and any original loop-processing work. These materials are bundled only in this local user prototype; do not treat this note as permission to redistribute or publish the recordings.

## Story music for the Kanto stage

On 2026-10-24, the following 27 pre-looped OGGs were downloaded individually from ENLS's FRLG album. The album page labels the game FireRed & LeafGreen, released in 2004, and publisher Nintendo; the library describes itself as pre-looped music for fangames and asks users to credit ENLS if they do. `story-audio.json` maps every node in `map.json` to one of these local cues and maps a small set of story beats to intro/fanfare themes. City and route fallbacks are explicit in that JSON. FRLG does not provide dedicated tracks for every node: Mt. Moon remains the cave cue for Rock Tunnel, Diglett Cave, Seafoam, Power Plant, and Cerulean Cave; the Fuchsia-road cue is used for the Safari Zone; and there is no dedicated shop or Saffron City track in this selection. Pokémon Tower now has its own track. The S.S. Anne and Pokémon Mansion tracks are story-event cues because neither place is a node in the simplified map. No invented or synthesized music is included.

| Local file | FRLG album track | Direct source |
|---|---|---|
| `assets/audio/story-pallet.ogg` | FRLG 06 Pallet Town Theme | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2006%20Pallet%20Town%20Theme.ogg) |
| `assets/audio/story-oak.ogg` | FRLG 07 Prof. Oak | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2007%20Prof.%20Oak.ogg) |
| `assets/audio/story-oak-lab.ogg` | FRLG 08 Oak Research Institute | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2008%20Oak%20Research%20Institute.ogg) |
| `assets/audio/story-starter-fanfare.ogg` | FRLG 09 Fanfare! Pokemon Obtained | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2009%20Fanfare!%20Pokemon%20Obtained.ogg) |
| `assets/audio/story-rival-entry.ogg` | FRLG 10 Rival Appears | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2010%20Rival%20Appears.ogg) |
| `assets/audio/story-route-1.ogg` | FRLG 13 Route 1 | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2013%20Route%201.ogg) |
| `assets/audio/story-cycling.ogg` | FRLG 37 Cycling | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2037%20Cycling.ogg) |
| `assets/audio/story-surfing.ogg` | FRLG 52 Surfing | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2052%20Surfing.ogg) |
| `assets/audio/story-pewter.ogg` | FRLG 15 Pewter City Theme | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2015%20Pewter%20City%20Theme.ogg) |
| `assets/audio/story-viridian-forest.ogg` | FRLG 17 Viridian Forest | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2017%20Viridian%20Forest.ogg) |
| `assets/audio/story-pokemon-center.ogg` | FRLG 21 Pokemon Center | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2021%20Pokemon%20Center.ogg) |
| `assets/audio/story-gym.ogg` | FRLG 25 Pokemon Gym | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2025%20Pokemon%20Gym.ogg) |
| `assets/audio/story-cerulean-road.ogg` | FRLG 32 Road to Cerulean City - From Mt. Moon | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2032%20Road%20to%20Cerulean%20City%20-%20From%20Mt.%20Moon.ogg) |
| `assets/audio/story-mt-moon.ogg` | FRLG 34 Mt. Moon | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2034%20Mt.%20Moon.ogg) |
| `assets/audio/story-vermilion.ogg` | FRLG 35 Vermilion City Theme | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2035%20Vermilion%20City%20Theme.ogg) |
| `assets/audio/story-lavender.ogg` | FRLG 38 Lavender Town Theme | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2038%20Lavender%20Town%20Theme.ogg) |
| `assets/audio/story-tower.ogg` | FRLG 39 Pokemon Tower | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2039%20Pokemon%20Tower.ogg) |
| `assets/audio/story-celadon.ogg` | FRLG 40 Celadon City Theme | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2040%20Celadon%20City%20Theme.ogg) |
| `assets/audio/story-rocket-hideout.ogg` | FRLG 45 Rocket Hideout | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2045%20Rocket%20Hideout.ogg) |
| `assets/audio/story-rocket-entry.ogg` | FRLG 46 A Trainer Appears (Bad Guy Version) | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2046%20A%20Trainer%20Appears%20(Bad%20Guy%20Version).ogg) |
| `assets/audio/story-silph-co.ogg` | FRLG 47 Silph Co. | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2047%20Silph%20Co..ogg) |
| `assets/audio/story-fuchsia-road.ogg` | FRLG 48 Road to Fuchsia City - Leaving Lavender Town | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2048%20Road%20to%20Fuchsia%20City%20-%20Leaving%20Lavender%20Town.ogg) |
| `assets/audio/story-fuchsia.ogg` | FRLG 50 Fuchsia City Theme | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2050%20Fuchsia%20City%20Theme.ogg) |
| `assets/audio/story-cinnabar.ogg` | FRLG 55 Cinnabar Island Theme | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2055%20Cinnabar%20Island%20Theme.ogg) |
| `assets/audio/story-ss-anne.ogg` | FRLG 36 The S.S. Anne | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2036%20The%20S.S.%20Anne.ogg) |
| `assets/audio/story-pokemon-mansion.ogg` | FRLG 56 Pokemon Mansion | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2056%20Pokemon%20Mansion.ogg) |
| `assets/audio/story-last-road.ogg` | FRLG 69 The Last Road | [download](https://enls.eu/prelooped/downloads/FRLG/FRLG%2069%20The%20Last%20Road.ogg) |

These recordings are only included in the local prototype, with source attribution for review; neither ENLS credit nor a public download link establishes permission to redistribute Nintendo's music. The `story-audio.json` file records the exact per-track URL and album title so the origins remain reviewable.

## References

- [ENLS FireRed & LeafGreen album](https://enls.eu/prelooped/album/?game=FRLG) (track list and downloads; accessed 2026-10-23)
- [ENLS Pre-Looped Music Library](https://enls.eu/prelooped/) (describes looped OGG downloads and its fangame use/credit recommendation; accessed 2026-10-24)
- [Smash Custom Music FRLG index](https://www.smashcustommusic.net/game/71) (cross-check of wild, trainer, gym leader, and rival track names)
- [The Sounds Resource FRLG Sound Effects page](https://sounds.spriters-resource.com/game_boy_advance/pokemonfireredleafgreen/asset/397732/) (anonymous sound pack; not used)
- [PokeAPI/cries](https://github.com/PokeAPI/cries) (cries only; not used)
- [pret/pokefirered `songs.h`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/include/constants/songs.h) (fixed commit; confirms effect ID 148 as `SE_M_SCRATCH`, and the named move/effect identifiers available in FRLG)
- [The Sounds Resource FRLG archive](https://sounds.spriters-resource.com/game_boy_advance/pokemonfireredleafgreen/asset/397732/) (contains `firered_0094.wav`; archive returned HTTP 403 in this environment)
- [PokéCommunity Gen III attack SFX pack](https://www.pokecommunity.com/threads/pok%C3%A9mon-agb-sound-effects-v1-0.287355/) (2012 Ruby debug-ROM dump, on-page list clarifies scope; MediaFire link yielded an HTML repair page, not the archive; not used)
- [Nintendo official Nintendo Music announcement](https://www.nintendo.com/us/whatsnew/tracks-from-pokemon-firered-version-and-pokemon-leafgreen-version-added-to-nintendo-music/) (confirms official FRLG soundtrack availability in Nintendo Music)

## Story location mapping audit

Location assignments were cross-checked against the `music` field of the relevant `data/maps/<Map>/map.json` files at the fixed [`pret/pokefirered` revision](https://github.com/pret/pokefirered/tree/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps). This confirms intentional FRLG reuse: Viridian, Pewter, and Saffron use `MUS_PEWTER`; Cerulean and Fuchsia use `MUS_FUCHSIA`; Diglett's Cave and Seafoam use `MUS_VIRIDIAN_FOREST`; Power Plant uses `MUS_POKE_MANSION`; Cerulean Cave and Rocket Hideout use `MUS_ROCKET_HIDEOUT`; and Victory Road 1F uses `MUS_MT_MOON`. The story location table follows those verified IDs wherever the selected ENLS recordings contain the matching track. Shared tracks are preserved.

The 27-file selection does not contain cues for `MUS_ROUTE24`, `MUS_EVOLUTION`, or `MUS_INDIGO_PLATEAU`. `story-audio.json` records explicit `locationNotes` fallbacks for Route 24/25, Safari Zone, and Indigo Plateau, instead of describing a nearby mood cue as an exact location recording. Cycling and Surfing remain contextual travel cues on their corresponding routes.

For story events, `rocketBase` uses the verified Rocket Hideout cue. `tournament` uses `last-road` as an endgame mood fallback because the exact Indigo Plateau cue is absent; `quietReflection` uses Professor Oak's short cue as a mood choice. Those last two are explicitly labeled mood choices in `eventNotes`, not claims that the tracks were originally written for those scenes. No additional copies of the same music were downloaded.


## 0.9.1 story music expansion

Five FRLG recordings from the [ENLS album listing](https://enls.eu/prelooped/album?game=FRLG) were added without audio editing: Rocket Game Corner, Guide, Tense Battle!, Epilogue and The Poke Flute. Direct original file URLs and SHA-256 are recorded in story-audio.json. Service and story assignments are project mood choices: game-corner services, quest briefings, Rocket investigations, camp reflection and lighthouse mystery. Diglett Cave and Seafoam use the existing cave cue rather than the forest cue. These recordings retain their original rights; source listing is not a new license.
