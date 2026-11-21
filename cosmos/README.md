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
