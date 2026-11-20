// GLSL for the WebGL globe. The look follows the old CPU renderer: banded, dithered sun light,
// golden-hour terminator, night-side city lights, drifting clouds with shadows, ocean glints,
// rift vortices, an atmosphere rim and fog of war. Everything is computed per fragment from the
// sphere's object-space position, so the planet stays one sphere at every zoom.

import { cubeGLSL } from './cube';

export const bayer = /* glsl */ `
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.y) * 4 + int(q.x);
  float b[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  for (int k = 0; k < 16; k++) if (k == i) return b[k] / 16.0 - 0.5;
  return 0.0;
}
`;

export const sphereVert = /* glsl */ `
varying vec3 vObj;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vUv = uv;
  vObj = normalize(position);
  vN = normalize(mat3(modelMatrix) * position);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

// shared lighting: returns light multiplier (rgb) for view normal n and the sun
export const lightFn = /* glsl */ `
vec3 sunLight(vec3 n, vec3 sun, float bay, out float L) {
  L = dot(n, sun);
  if (L > 0.0) {
    float q = clamp(floor(L * 6.0 + bay * 0.9 + 0.5) / 6.0, 0.0, 1.0);
    float k = 0.3 + q * 0.92;
    float warm = L < 0.28 ? (0.28 - L) / 0.28 : 0.0;
    return vec3(k * (1.0 + warm * 0.35), k * (1.0 + warm * 0.05), k * (1.0 - warm * 0.3));
  }
  float tw = (L > -0.12 && (L + 0.12) / 0.12 + bay * 0.5 > 0.5) ? 1.0 : 0.0;
  return tw > 0.5 ? vec3(0.3, 0.22, 0.4) : vec3(0.17, 0.2, 0.36);
}
`;

export const sphereFrag = /* glsl */ `
precision highp float;
uniform sampler2D albedo, emis, water, clouds, fog, base, art, artEm, cubeTex, cubeEm, tileTex, tileEm;
uniform float useArt, useCube, cubeSize, src, gridOn;
uniform vec3 sun, atm, cloudCol;
uniform vec2 texWH, mapWH, cloudWH;
uniform float t, px, cloudOff, cloudFade, hasAtm, cloudsOn, fogOn, dith, TS;
uniform vec3 rifts[8];
uniform int nRifts;
varying vec3 vObj;
varying vec3 vN;
varying vec2 vUv;
${bayer}
${lightFn}
${cubeGLSL}
const float PI = 3.141592653589793;
vec2 cubeUV(vec3 st) {
  float g = 1.0, S = cubeSize + 2.0;
  return vec2((g + st.x * cubeSize) / S, (st.z * S + g + st.y * cubeSize) / (6.0 * S));
}
void main() {
  if (src > 0.5 && vN.z < 0.0) discard;
  vec2 sp = gl_FragCoord.xy / px;
  float bay = bayer4(sp);
  vec3 o = normalize(vObj);
  float lat = asin(clamp(o.y, -1.0, 1.0)), lon = atan(o.x, o.z);
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
  // dithered texel lookup: soft pixel-art transitions between texels
  vec2 tc = floor(uv * texWH + vec2(bay, bayer4(sp + vec2(2.0, 1.0))) * dith);
  tc.x = mod(tc.x, texWH.x); tc.y = clamp(tc.y, 0.0, texWH.y - 1.0);
  vec2 tuv = (tc + 0.5) / texWH;
  vec3 col = texture2D(albedo, tuv).rgb * 255.0;
  // the art thread's painted planet (landart.globeTexture), with territory tints and borders
  // carried over as the difference between globe.js's overlaid and bare albedo
  vec3 over = col - texture2D(base, tuv).rgb * 255.0;
  vec2 cuvA = vec2(0.0);
  if (src > 0.5) col = clamp(texture2D(tileTex, vUv).rgb * 255.0 + over, 0.0, 255.0);
  else if (useCube > 0.5) { cuvA = cubeUV(cubeST(o)); col = clamp(texture2D(cubeTex, cuvA).rgb * 255.0 + over, 0.0, 255.0); }
  else if (useArt > 0.5) col = clamp(texture2D(art, tuv).rgb * 255.0 + over, 0.0, 255.0);
  vec3 n = normalize(vN);
  float L;
  vec3 lit = sunLight(n, sun, bay, L);
  // cloud shadow (day only)
  vec2 cuv = vec2(fract(tc.x / texWH.x + cloudOff / cloudWH.x), tc.y / texWH.y);
  if (cloudsOn > 0.5 && hasAtm > 0.5 && L > 0.0) {
    float sh = texture2D(clouds, vec2(fract(cuv.x + 3.0 / cloudWH.x), cuv.y)).r * 255.0;
    if (sh >= 1.5 && cloudFade > 0.4) lit *= vec3(0.74, 0.76, 0.82);
  }
  col *= lit;
  // ocean glint
  float w = texture2D(water, tuv).r * 255.0;
  if (w > 0.5 && L > 0.0) {
    vec3 h = normalize(sun + vec3(0.0, 0.0, 1.0));
    float s = dot(n, h);
    if (s > 0.94) {
      float k = (s - 0.94) / 0.06;
      col += vec3(40.0, 44.0, 40.0) * k;
      float hsh = fract(sin(dot(tc + floor(t * 2.0), vec2(12.9898, 78.233))) * 43758.5453);
      if (s > 0.985 && hsh < 0.06) col += vec3(110.0, 110.0, 100.0);
    }
  }
  // emissive: city and structure lights, strongest at night
  vec4 e = texture2D(emis, tuv);
  vec3 aeS = src > 0.5 ? texture2D(tileEm, vUv).rgb : useCube > 0.5 ? texture2D(cubeEm, cuvA).rgb : vec3(-1.0);
  if (aeS.r >= 0.0) { float am = max(aeS.r, max(aeS.g, aeS.b)); if (am > e.a) e = vec4(aeS / max(am, 0.001), am); }
  else if (useArt > 0.5) { vec3 ae = texture2D(artEm, tuv).rgb; float am = max(ae.r, max(ae.g, ae.b)); if (am > e.a) e = vec4(ae / max(am, 0.001), am); }
  if (e.a > 0.0) {
    float night = clamp(0.35 - L * 2.5, 0.0, 1.0);
    float ea = e.a * (0.25 + night * 0.95);
    if (ea > 0.05) col += e.rgb * 255.0 * ea * (1.0 + night * 0.4);
  }
  // rifts: animated vortex
  vec2 cellp = tc / TS;
  for (int i = 0; i < 8; i++) {
    if (i >= nRifts) break;
    vec3 rf = rifts[i];
    vec2 d2 = cellp - rf.xy;
    d2.x = mod(d2.x + mapWH.x * 0.5, mapWH.x) - mapWH.x * 0.5;
    float d = length(d2);
    if (d > 3.2) continue;
    float ang = atan(d2.y, d2.x);
    float sw = sin(d * 2.2 - ang * 3.0 + t * (rf.z > 0.0 ? 0.6 : 2.4));
    float k = (sw * 0.5 + 0.5) * max(0.0, 1.0 - d / 3.2) * (rf.z > 0.0 ? 0.35 : 1.0);
    float q = floor(k * 4.0 + bay) / 4.0;
    if (q > 0.0) col = mix(col, vec3(255.0, 40.0, 110.0), q);
    if (d < 0.5) col = vec3(20.0, 0.0, 12.0);
  }
  // clouds
  if (cloudsOn > 0.5 && hasAtm > 0.5) {
    float c = texture2D(clouds, cuv).r * 255.0;
    if (c > 0.5) {
      float a = (c > 2.5 ? 0.85 : c > 1.5 ? 0.55 : 0.22) * cloudFade;
      float cl = L > 0.0 ? 0.42 + min(1.0, floor(L * 4.0 + bay + 0.5) / 4.0) * 0.6 : 0.12;
      vec3 wc = cloudCol * cl * vec3((L > 0.0 && L < 0.25) ? 1.12 : 1.0, 1.0, L <= 0.0 ? 1.6 : 1.0);
      col = mix(col, wc, a);
    }
  }
  // atmospheric rim
  if (hasAtm > 0.5) {
    float f = 1.0 - n.z;
    float fr = f * f * f * 0.85 * max(0.15, L + 0.35);
    col += (atm - col) * fr * vec3(0.6, 0.6, 0.7);
  }
  // fog of war
  if (fogOn > 0.5) {
    vec2 cell = floor(cellp);
    float fv = texture2D(fog, (vec2(mod(cell.x, mapWH.x), clamp(cell.y, 0.0, mapWH.y - 1.0)) + 0.5) / mapWH).r * 255.0;
    if (fv < 0.5) {
      float chk = mod(floor(tc.x / 4.0) + floor(tc.y / 4.0), 2.0);
      float g = 0.12 + 0.05 * chk + bay * 0.04;
      col = col * g + vec3(10.0, 14.0, 26.0);
    } else if (fv < 1.5) col *= vec3(0.72, 0.74, 0.82);
  }
  // the tile grid, drawn on the sphere so it bends with it
  if (gridOn > 0.0) {
    vec2 cp = uv * mapWH, fw = fwidth(cp);
    vec2 d = abs(fract(cp + 0.5) - 0.5) / max(fw, vec2(1e-5));
    if (min(d.x, d.y) < 0.75) col = mix(col, vec3(255.0), 0.10 * gridOn);
  }
  gl_FragColor = vec4(min(col, 255.0) / 255.0, 1.0);
}
`;

// The close-up ground: the flat surface art (terrain, cities, fog, grid) painted into a canvas,
// draped over the same sphere as a patch. Light softens to the art's own colours as you zoom in.
export const patchVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * position);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;
export const patchFrag = /* glsl */ `
precision highp float;
uniform sampler2D map;
uniform vec3 sun;
uniform float px, soft, alpha;
uniform vec2 edge;
varying vec2 vUv;
varying vec3 vN;
${bayer}
${lightFn}
void main() {
  vec4 c = texture2D(map, vUv);
  vec3 n = normalize(vN);
  float L;
  vec3 lit = sunLight(n, sun, bayer4(gl_FragCoord.xy / px), L);
  vec3 col = c.rgb * mix(lit, vec3(1.0), soft);
  // the limb darkens like the globe's
  if (n.z < 0.6) col *= 1.0 - ((0.6 - n.z) / 0.6) * 0.75;
  // feather the patch border into the globe underneath
  vec2 d = min(vUv, 1.0 - vUv) / edge;
  float a = clamp(min(d.x, d.y), 0.0, 1.0) * alpha;
  gl_FragColor = vec4(col, a);
}
`;

export const haloFrag = /* glsl */ `
precision highp float;
uniform vec3 atm, sun;
uniform float px;
varying vec2 vP;
${bayer}
void main() {
  float rr = length(vP);
  if (rr <= 1.0 || rr > 1.12) discard;
  float f = 1.0 - (rr - 1.0) / 0.12;
  float facing = clamp(((vP.x * sun.x + vP.y * sun.y) / rr) * 0.7 + 0.45, 0.08, 1.0);
  float a = f * f * facing;
  float q = floor(a * 5.0 + bayer4(gl_FragCoord.xy / px)) / 5.0;
  if (q <= 0.0) discard;
  gl_FragColor = vec4(atm, q);
}
`;
export const quadVert = /* glsl */ `
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }
`;

export const ringVert = /* glsl */ `
varying vec2 vP;
varying vec3 vN;
void main() { vP = position.xy; vN = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0)); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }
`;
export const ringFrag = /* glsl */ `
precision highp float;
uniform vec3 color;
uniform float inner, outer, gaps, px;
varying vec2 vP;
${bayer}
void main() {
  float d = length(vP);
  float f = (d - inner) / (outer - inner);
  float a = 0.55 + 0.35 * sin(f * 37.0 + gaps) * sin(f * 11.0);
  for (int g = 1; g <= 8; g++) { if (float(g) > gaps) break; if (abs(f - float(g) / (gaps + 1.0)) < 0.025) a = 0.0; }
  if (a <= 0.08) discard;
  a = min(0.9, a);
  float q = floor(a * 4.0 + bayer4(gl_FragCoord.xy / px)) / 4.0;
  if (q <= 0.0) discard;
  float sh = 0.75 + 0.25 * sin(f * 23.0);
  gl_FragColor = vec4(color * sh, q);
}
`;

export const starVert = /* glsl */ `
attribute float bright;
attribute float phase;
uniform float t, size;
varying float vB;
void main() {
  vB = (0.35 + 0.65 * bright) * (0.7 + 0.3 * sin(t * 1.5 + phase));
  gl_PointSize = size;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;
export const starFrag = /* glsl */ `
precision highp float;
varying float vB;
void main() { float k = vB * 200.0 / 255.0; gl_FragColor = vec4(k * 0.92, k, min(1.0, k + 30.0 / 255.0), 1.0); }
`;
