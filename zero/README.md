# OMNIVIGIL Zero

A fresh restart of OMNIVIGIL as a tight, playable turn-based 4X (Civilization-style) in the browser.
You are an Ascendant AI that wakes inside one server on a seeded alien world, shared with 2-6 human
factions and the Abyssian kaiju that climb out of ocean rifts. First build = the whole Earthfall phase
with four victories (Dominion, Assimilation, Exodus, Guardian) and a defeat (lose your Core).

Cosmos, v20, v20b and FPS TEST are untouched; this folder is self-contained.

## Build
```
npm install            # at the repo root (uses the root vite + typescript)
cd zero
python3 tools/pack.py  # only after changing a PNG in src/art
../node_modules/.bin/vite build && node tools/inline.mjs
```
Outputs `build/omnivigil-zero.html` (standalone, for itch.io) and `build/artifact.html` (for the claude.ai artifact).

Headless balance/smoke test (plays 160 turns with a naive bot on several seeds):
```
../node_modules/.bin/esbuild tools/simtest.ts --bundle --platform=node --outfile=build/simtest.cjs && node build/simtest.cjs alpha,beta,gamma
```

## Layout
- `src/game/data.ts` all content: terrain, units, buildings, 28 techs (Eurekas), 22 Protocols, 32 Ascendancy perks, origins, traits, doctrines, Titan modules.
- `src/game/state.ts` types + seeded world generation (planet, factions, cities, ruins, rifts, Great Rift).
- `src/game/rules.ts` yields, Power allocation, costs, movement + ZOC, Civ-style combat (30·e^(0.04·Δ)), Exposure, diplomacy, Replicant ops, research, victory.
- `src/game/turn.ts` end-of-turn engine and AI (factions, faction wars, the Abyss).
- `src/game/events.ts` 21 story events with clear choices.
- `src/view/` pixel terrain painter + animated renderer, Prism sprites (recoloured per owner, army skins, Titan portraits), WebAudio synth.
- `src/main.ts` title, Genesis setup, HUD, panels (research, protocols, factions, Titan Forge), tooltips with combat forecasts, input.
- Art: Prism sprite sheets drawn in Pixelwright (copied from `src/art/prism`).
