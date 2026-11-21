# FPS TEST

A separate physics test bench for OMNIVIGIL (it does not change Cosmos). One HTML page simulates:

- **Orbits**: real Keplerian ellipses (a, e, i, node, periapsis) solved from Kepler's equation every frame (`src/physics/kepler.ts`).
- **Gravity where it matters**: heliocentric N-body (leapfrog, adaptive sub-steps) only for probes, rogue stars, bodies inside a planet's Hill sphere, and all planets while a rogue star is near. Bodies go back on rails with their new osculating orbits afterwards (`src/sim/world.ts`).
- **Stars**: mass-luminosity-radius laws, blackbody colour, main-sequence brightening, subgiant, red giant, helium burning, AGB, planetary nebula, white dwarf; or supergiant, supernova, neutron star or black hole. Slow mass loss widens orbits (a·M constant); a supernova's sudden mass loss can unbind planets. Kopparapu (2014) habitable zone (`src/physics/star.ts`).
- **Climates**: 18-band energy-balance model with seasonal insolation from tilt and eccentricity, ice-albedo and water-vapour feedback, a moist runaway-greenhouse limit, tidally locked worlds, and Sudarsky classes for giants (`src/physics/climate.ts`). Calibrated: Earth about 14 °C, Venus about 463 °C, Mars about −55 °C (`test/calib.ts`).
- **Rendering**: a software pixel framebuffer (`src/render/`), so the look is true pixel art; FPS counter, 1% lows, physics/draw timings and a ramping benchmark.

Build: `npm install` at the repo root, then `cd fpstest && npx vite build && node tools/inline.mjs` writes `fpstest/build/fps-test.html`.
Climate check: `npx esbuild fpstest/test/calib.ts --bundle --platform=node --outfile=/tmp/calib.js && node /tmp/calib.js`.
