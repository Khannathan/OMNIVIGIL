// Units of the three nested frames. Positions are doubles inside a frame; the GPU only ever sees
// camera-relative offsets, so precision holds from the cosmic web down to a planet's surface.
export const KLY_PER_MPC = 3261.56;      // universe frame: megaparsecs
export const AU_PER_KLY = 63241077;      // galaxy frame: thousands of light years
export const KM_PER_AU = 149597870.7;    // system frame: astronomical units
export const LY_PER_MPC = 3261560;
export const U_BASE = 1024;              // integer split for universe coordinates on the GPU
export const G_BASE = 64;                // integer split for galaxy coordinates on the GPU
export const U_CELL = 1;                 // one galaxy cell = 1 Mpc
export const U_SUPER = 64;               // universe feature supercell
export const G_SECTOR = 1 / 32;          // star sector (about 31 light years)
export const G_LUM = 1 / 2;              // luminous-star lattice (about 500 light years)
export const G_REGION = 2;               // galaxy feature region cell
export const R_EARTH_AU = 4.26e-5;
