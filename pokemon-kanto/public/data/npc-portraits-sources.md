# Generic NPC portrait sources

The catalog in [`npc-portraits.json`](npc-portraits.json) stores names, visual categories, exact file URLs, original canvas dimensions, alpha bounds, and SHA-256 hashes for each portrait.

## PokéWiki game art and NPC models

The entries whose IDs end in `_oras`, plus mother and employee portraits, come from PNGs documented in the German [PokéWiki](https://www.pokewiki.de/). Their individual file pages and original upload URLs are recorded on each entry. The game art and models are anonymous role references; they do not rename story characters. The fisherman, breeder, gentleman, and older couple are official generic trainer-class art from *Omega Ruby and Alpha Sapphire*. The mother and employee images come from the games listed in `sourceGame`.

Visual review found that both *Let's Go* shop-employee model renders are neutral T-pose references, and the male file also contains two uniform variants on one canvas. They remain in the catalogue for provenance but have `displayEligible:false` and must not be selected for the single-person stage. The *ORAS* older-couple image likewise contains two people and is excluded by default; it may only be used when the actor is explicitly a couple.

The two *Sun and Moon* `VS Angestellte/Angestellter` class images are natural-pose, transparent half-body portraits. They are classified as `office-clerk`/employee rather than retail cashiers, and their metadata explicitly sets `composition:"half-body"` and `fullBody:false`.

Every `displayEligible` portrait has an `appearanceTags` list based on visual inspection of the actual image. These tags describe visible details such as hair color, glasses, hats, uniforms, coats, and props; they are omitted where the view is obscured. The three anonymous mother models are available as appearance references from different game generations, not as Delia/Hanako or named story characters.

## Pokémon Masters EX references

Generic class renders cite the pinned Pokémon Masters EX asset-library revision in `sourceCommit`. The Oak and Agatha images are reused only as clearly marked older-man/older-woman visual references; they remain their original named characters in the trainer roster.

These are copyrighted Pokémon game assets. The source repositories and wiki pages document provenance; they do not grant a separate license to the artwork.

The named anime mother Delia/Hanako remains unfilled because no verified transparent official PNG was found in the accessible sources during this update. A Bulbagarden listing for Masters Trista showed a 256px half-body image, but the source image could not be retrieved from the archive; no local asset is claimed for Trista. No credible, natural-pose BW/XY retail-clerk image was found, so the Sun/Moon office-employee portraits are the only 2D worker options currently catalogued.


## Project-original anonymous portraits (0.9.1)

Eight full-body nonpixel illustrations cover elderly, adult resident/shopkeeper, child traveller, and researcher roles of both genders. These do not replace explicitly named story characters. Metadata records observed age, gender, costume, alpha bounds, hashes and original generated paths when recovered. Reproduction prompts are in [generated-npc-prompts-091.md](generated-npc-prompts-091.md). Named Oak/Agatha visual references are excluded from anonymous matching.


## Project-original anonymous portraits (0.9.1)

Eight full-body nonpixel illustrations cover elderly, adult resident/shopkeeper, child traveller, and researcher roles of both genders. These do not replace explicitly named story characters. Metadata records observed age, gender, costume, alpha bounds, hashes and original generated paths when recovered. Reproduction prompts are in [generated-npc-prompts-091.md](generated-npc-prompts-091.md). Named Oak/Agatha visual references are excluded from anonymous matching.
