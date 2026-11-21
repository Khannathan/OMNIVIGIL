# Cosmic Atlas preview (standalone, not wired into the game)

All 434 entries of `cosmic-catalog.md` (celestial bodies B, phenomena P, weirdness W) drawn as procedural pixel-art portraits, plus a "roll a system" view weighted by rarity.

- `render.js`: per-pixel renderer onto palette ramps with Bayer dithering and dark outlines (planets, stars, black holes, nebulae, galaxies, megastructures, effects, creatures).
- `specs.js`: one look per entry id (a layer or a list of layers).
- `python3 parse.py` turns the catalog into `data.json`; `python3 build.py` inlines everything into `index.html`.
