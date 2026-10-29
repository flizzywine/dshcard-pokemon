# Progression data sources

`progression.json` has one entry for each National Pokédex species ID 1–151.

- `growthRate` is the numeric `growth_rate_id` from PokeAPI `pokemon_species.csv`, pinned to [`PokeAPI/pokeapi` commit `2bf639e5572812a67d2b94903fdcb9d095f5aeb2`](https://github.com/PokeAPI/pokeapi/blob/2bf639e5572812a67d2b94903fdcb9d095f5aeb2/data/v2/csv/pokemon_species.csv).
- `baseExperience` and `effort` use Generation III FireRed/LeafGreen values from [`pret/pokefirered/src/data/pokemon/species_info.h`](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/data/pokemon/species_info.h), pinned to commit `ce6406d8c2eaf46d543c8a2606de0c3cb1951982`. EV fields map as follows: HP→`hp`, Attack→`atk`, Defense→`def`, Special Attack→`spa`, Special Defense→`spd`, Speed→`spe`.

Using the FireRed/LeafGreen source avoids substituting modern base experience or EV yields for Generation III mechanics. PokeAPI's BSD-3-Clause license covers its software repository; the pret decompilation repository is GPL-3.0-licensed. Those project licenses do not transfer rights in Pokémon franchise material. Pokémon names and game data remain associated with their respective rights holders, including Nintendo, GAME FREAK, Creatures, and The Pokémon Company. This dataset is an attribution of source values, not an endorsement or claim of ownership.
