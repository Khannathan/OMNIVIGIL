// OMNIVIGIL v6 - cube-sphere conventions shared with the art layer (src/art).
// World space = G.cellToWorld: unit sphere, y up, lon 0 at +z.
// Faces in GL cubemap order 0 +X, 1 -X, 2 +Y, 3 -Y, 4 +Z, 5 -Z; per face (sc, tc, ma) as the GL
// spec; a = sc/|ma|, b = tc/|ma|; tangent-adjusted u = 4/pi atan(a), v = 4/pi atan(b);
// face texel s = (u+1)/2 left->right, t = (v+1)/2 top row down. Tiles (face, level, i, j) cover
// s in [i, i+1]/2^level, t in [j, j+1]/2^level, painted with a 1-texel gutter (canvas = size + 2).

export function fromDir(x: number, y: number, z: number): { face: number; s: number; t: number } {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let face: number, sc: number, tc: number, ma: number;
  if (ax >= ay && ax >= az) { ma = ax; if (x > 0) { face = 0; sc = -z; tc = -y; } else { face = 1; sc = z; tc = -y; } }
  else if (ay >= az) { ma = ay; if (y > 0) { face = 2; sc = x; tc = z; } else { face = 3; sc = x; tc = -z; } }
  else { ma = az; if (z > 0) { face = 4; sc = x; tc = -y; } else { face = 5; sc = -x; tc = -y; } }
  const a = sc / ma, b = tc / ma, k = 4 / Math.PI;
  return { face, s: (k * Math.atan(a) + 1) / 2, t: (k * Math.atan(b) + 1) / 2 };
}
export function toDir(face: number, s: number, t: number): [number, number, number] {
  const a = Math.tan((s * 2 - 1) * Math.PI / 4), b = Math.tan((t * 2 - 1) * Math.PI / 4);
  let x: number, y: number, z: number;
  switch (face) {
    case 0: x = 1; z = -a; y = -b; break;
    case 1: x = -1; z = a; y = -b; break;
    case 2: y = 1; x = a; z = b; break;
    case 3: y = -1; x = a; z = -b; break;
    case 4: z = 1; x = a; y = -b; break;
    default: z = -1; x = -a; y = -b; break;
  }
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
}

// GLSL twin of fromDir: returns (s, t, face)
export const cubeGLSL = /* glsl */ `
vec3 cubeST(vec3 d) {
  vec3 A = abs(d); float face, sc, tc, ma;
  if (A.x >= A.y && A.x >= A.z) { ma = A.x; if (d.x > 0.0) { face = 0.0; sc = -d.z; tc = -d.y; } else { face = 1.0; sc = d.z; tc = -d.y; } }
  else if (A.y >= A.z) { ma = A.y; if (d.y > 0.0) { face = 2.0; sc = d.x; tc = d.z; } else { face = 3.0; sc = d.x; tc = -d.z; } }
  else { ma = A.z; if (d.z > 0.0) { face = 4.0; sc = d.x; tc = -d.y; } else { face = 5.0; sc = -d.x; tc = -d.y; } }
  float k = 4.0 / 3.141592653589793;
  return vec3((k * atan(sc / ma) + 1.0) * 0.5, (k * atan(tc / ma) + 1.0) * 0.5, face);
}
`;
