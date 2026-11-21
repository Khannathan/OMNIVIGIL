# OMNIVIGIL Cosmos

The new base for OMNIVIGIL: an infinite, seed-generated universe with seamless zoom
from the cosmic web, through galaxies, arms and star sectors, down to star systems and
planet globes. Every one of the 434 Cosmic Atlas entries can appear and be searched for.

Also a first visual of space movement: jump lanes between stars, intergalactic routes
(wormholes, cosmic strings, precursor gates), an orbital ring grid with station slots
inside systems, and sample ships and stations you can move on turns.

## Build

    npm install            # at the repo root (Vite + TypeScript live there)
    cd cosmos
    npx vite build && node tools/inline.mjs

The single-file page is written to `cosmos/build/omnivigil-cosmos.html`.

## Layout

- `src/core` hashing, noise, constants, procedural names
- `src/atlas` catalog data, portrait renderer and specs from the Cosmic Atlas
- `src/gen` universe (cosmic web, galaxies), galaxy interiors, star systems, search
- `src/view` camera with nested frames (Mpc / kly / AU) and fly-to
- `src/gl` WebGL2 renderer and shaders (low-res pixel FBO, palette ramps, dithering)
- `src/ui` panels, chart, audio, saved state, fleets

## The game (first playable slice)

`src/game/` turns the explorer into a turn-based game. You are an ascendant AI:

- **Earthfall**: on your seeded home world, the squad (3 TBUs + Observer) breaks the Coalition
  garrison by the capital on the surface combat grid (move, then fire at range 3; N ends the turn).
- **Sunreach**: the Ark claims worlds of the home system on the orbital ring grid; stations go into
  slots (Extractor, Solar array, Relay spire, Shipyard).
- **Starward**: the shipyard builds probes, warships and arks. Probes chart the lanes (the fog
  sharpens) and can light relay beacons, arks found outposts. The Pale Choir (a rival ascendant) and
  the void swarm push back; fights play out in a hex battle bubble.
- **Intercontinuum**: break the rival's core or hold 10 systems. Play continues after.

Resources are alloy, energy and compute (compute buys self-rewrites). The game saves per seed.
Art: space units and the Coalition tank are Pixelwright sprites (project "OMNIVIGIL Cosmos"),
`src/art/space-units.png` (8 units x 2 frames, 32 px, magenta = team colour).
