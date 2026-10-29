# Trainer artwork sources

The trainer roster keeps its original 47 IDs and adds 156 distinct, named trainer entries. The existing Kanto character records for Professor Oak, Red, Leaf, Blue (the rival), Brock, Misty, Lt. Surge, Erika, Koga, Sabrina, Blaine, Giovanni, Lorelei, Bruno, Agatha, and Lance now point to full character renders where the source library has them. Their previous PNG files remain in the assets folder.

## New artwork

The new `assets/trainers/official/*.png` files are individual transparent 1024 × 1024 character renders indexed as `Actor` assets by the [Pokémon Masters EX Asset Library](https://github.com/MaNeRz/Pokemon-Masters-EX-Asset-Library). Each roster record carries its direct source URL in `source`, its source repository in `sourceRepository`, and the local `image` and `art` paths. The library's [asset index](https://github.com/MaNeRz/Pokemon-Masters-EX-Asset-Library/blob/main/data/assets.csv) is the source of each trainer identity and original asset path.

The main-series and Masters EX character art remains the property of Nintendo, Game Freak, The Pokémon Company, and other applicable rights holders. The source repository's software or data organization does not grant a separate license to the character artwork; this file records provenance and does not claim one.

## Legacy artwork

The original 47 PNG files are retained in `assets/trainers/`. Their source was not recorded in the previous manifest, so no upstream origin is inferred here. Existing entries retain their IDs, names, aliases, and other role data; only the Kanto named-character image paths noted above were redirected to documented higher-resolution files.

The `rocket_grunt_m` and `rocket_grunt_f` trainer-class IDs now display their exact matching 1024×1024 transparent Team Rocket Grunt renders from the pinned Masters EX asset-library revision in `npc-portraits.json`. Their former 64×64 PNGs remain in place as legacy files; the trainer roster records the selected image's exact source path, commit, alpha bounds, and SHA-256.

### Pokémon Adventures cast aliases

The existing roster already has high-resolution official art for Ash, Brock, Misty, Jessie, James, Red, Leaf, and the Kanto game rival. Jessie and James carry the anime-local aliases `武藏` and `小次郎`; Ash now also resolves as `小智` / `Satoshi`. The game rival stays `rival_early`/`rival_late`, named `小茂` and aliased `Gary` / game `Blue`; these IDs do not use `青绿`.

Three separate `adapted-art` records were added for the Pokémon Adventures Red, Green, and Blue identities. They reuse the matching high-resolution official game character art with `adapted:true`, explicit source identity, and an adaptation note. The IDs and display names keep manga characters separate from game Red, Gary/Blue, and the game protagonist Leaf. `manga-blue` intentionally has no `Blue` English alias because the simple stage resolver also matches substrings; it resolves through the unambiguous Chinese manga aliases instead.

The Bulbagarden Archives lists Mato's 1,223×1,187 Yellow arc artwork, but its image host and file API rejected direct asset retrieval in this environment. The unavailable official Yellow image was not downloaded. Release 0.9.0 instead includes a clearly labelled project-original child portrait. Source page: [Yellow Yellow Arc Artwork](https://archives.bulbagarden.net/wiki/File:Yellow_Yellow_Arc_Artwork.png).

## Nurse Joy

The original `nurse_joy` ID now points to the official original-series anime character art `Nurse Joy OS.png` from [Bulbagarden Archives](https://archives.bulbagarden.net/wiki/File:Nurse_Joy_OS.png). The archive identifies it as official Nurse Joy artwork from the animated series; the untouched indexed PNG is 226 × 500 with transparency. The file was retrieved from the [Internet Archive replay](https://web.archive.org/web/20220807180136id_/https://archives.bulbagarden.net/media/upload/8/8e/Nurse_Joy_OS.png) of the archive's original media URL because the live media host presented a browser challenge to the asset fetcher. The original FRLG overworld frame remains in `assets/trainers/nurse_joy.png` as a retained fallback; it is no longer the manifest image. The Masters EX asset index contains no Nurse Joy character render, so no unrelated game nurse is substituted.


## 0.9.0 identity separation

Gary uses the official anime portal profile PNG from https://ph.portal-pokemon.com/tv-film/1/ (direct source and displayCrop are stored in trainers.json). It is a framed headshot, not a full-body render. Manga Green keeps a separate, labelled game-Blue visual reference. New Yellow, Bill and Fuji images were generated with the built-in image_gen tool as project-original fan illustrations; they are not official artwork. See generated-portrait-prompts.md.


## 0.9.1 Gary full-body replacement

The framed anime-portal portrait is no longer the selected Gary image. The manifest now points to the transparent original-series full-body PNG documented at https://www.wikidex.net/wiki/Archivo:Gary_Oak_serie_original.png . Direct source, SHA-256, dimensions and art bounds are in trainers.json. It is an unmodified sourced image, not a successful generated redraw.


## Selected art at final 0.9.1 delivery

The user requested another generation attempt for Gary and Nurse Joy. Both selected outputs succeeded with the built-in image_gen tool and are copied unmodified into project-original/gary-v3.png and project-original/nurse-joy-v1.png. These now supersede both earlier sourced portraits. Recorded prompts, original output paths and hashes are in generated-portraits-091.md and trainers.json. Earlier failure/source sections in this document are history, not the selected current art.
