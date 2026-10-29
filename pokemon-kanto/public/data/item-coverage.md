# Item data coverage

Held-item rows in `items.json` are labelled `generation: 3` and `ruleset: pokemon-frlg`. These fields mean an item is available to the Generation III ruleset adapter, not that every item was first introduced in Generation III. This keeps pre-existing items, including Gen II type boosters, separate from their generation of origin.

## Battle behavior

Battle resolution uses the bundled Pokémon Showdown Gen III mod (`vendor/showdown/package.json`, version 0.11.11). Its Gen III item handlers determine damage modifiers, turn order, critical stages, stat effects, recovery, status cures, PP recovery, and one-use consumption. The game adapter preserves FRLG-specific behavior for Amulet Coin, Lucky Egg, and Smoke Ball. Catalog-only goods such as Nuggets and mushrooms remain obtainable wild-held loot without invented combat effects.

Battle berries cover the Gen III status, confusion, HP, PP, and low-HP stat/critical effects. Other Gen III berries are listed for inventory compatibility; where the FRLG battle engine has no held effect, the catalog says so. Outside-battle EV reduction for Pomeg, Kelpsy, Qualot, Hondew, and Grepa berries is not simulated.

## Sources and limits

The cartridge item table is the availability boundary. Gen II items removed before Gen III (old Berry/Gold Berry, Pink Bow/Polkadot Bow and Berserk Gene, among others) are excluded even though the simulator retains historical definitions. The catalog must not treat `gen <= 3` as sufficient proof of Gen III availability.

- Pokémon Showdown vendored Gen III data and simulator handlers: `vendor/showdown/data/mods/gen3/items.js` and the base item data used by the vendored Dex (version 0.11.11). The source tables are maintained under the Pokémon Showdown MIT license; see `vendor/showdown/LICENSE`.
- FRLG wild-held item species table: `public/data/frlg-held-items.json`, sourced from pret/pokefirered at pinned commit `ce6406d8c2eaf46d543c8a2606de0c3cb1951982`. This controls wild item drops only; it is not a claim that every supported held item drops in Kanto.
- Kanto species remain limited to National Pokédex 001–151. Items whose only battle benefit applies to non-Kanto species are still catalogued for native Gen III compatibility but cannot produce that benefit in this Kanto roster.


## FRLG bag use

At the pinned FRLG revision, the Berry Pouch routes status berries to the medicine callback and Leppa Berry to PP recovery. Cheri, Chesto, Pecha, Rawst, Aspear, and Lum clear only the persistent major statuses represented by the cartridge item-effect table; Oran restores 10 HP, Sitrus restores 30 HP, and Leppa restores 10 PP to the selected move. These berries remain held items as well, with automatic effects handled by the Gen III battle simulator. Persim stays held-only because FRLG has no persistent field confusion to cure. EV-reduction berries retain no field effect; Emerald's effects are outside this FRLG scope.

The already-present field catalog also contains FRLG Max Potion and Full Restore with full-HP and status effects; these rows remain in `field-items.json` to avoid duplicate IDs in the base item catalog.

Pinned cartridge references: [`item_effects.h`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/data/pokemon/item_effects.h) defines the berry status, HP, and PP effects; [`item_use.c`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/item_use.c) routes Berry Pouch field use to medicine or selected-move PP recovery. The local use-item path leaves the count unchanged when no effect can be applied. [`items.json`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/data/items.json) supplies Max Potion and Full Restore prices, field use, and battle use.

## Reusable FRLG flutes

The Blue, Yellow, and Red Flutes use cartridge-confirmed item effects and are reusable: in battle Blue cures sleep, Yellow removes the confusion volatile, and Red removes the Attract/infatuation volatile. A valid flute use spends the player action but never decreases its bag count; attempting to cure a state the target does not have fails before the turn or inventory changes. Only Blue is field-usable, where it cures sleep. Yellow and Red are field-blocked in the source data. The effects do not invent field confusion or infatuation states.

Pinned source: [`item_effects.h`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/data/pokemon/item_effects.h) assigns Blue to sleep cure, Yellow to confusion cure, and Red to infatuation cure; [`item_use.c`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/item_use.c) routes battle use through the medicine callback. The item table in [`items.json`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/data/items.json) sets Blue to field medicine and Yellow/Red to Oak Stops You outside battle, and provides native prices 100/200/300.

