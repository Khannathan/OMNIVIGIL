import { HEAD, COMMON } from './glsl';
// ---------------------------------------------------------------- galaxy features (nebulae, clusters, anomalies)
export const INST_VS = `${HEAD}
in vec2 aP; in vec4 iA; in vec4 iB; in vec4 iC; in uint iSeed;
uniform vec2 uRes;
out vec2 vS; flat out vec4 fA; flat out vec4 fB; flat out vec4 fC; flat out uint fSeed;
void main(){ float ext = iA.z*1.15 + 1.0; vec2 px = iA.xy + aP*ext; vS = aP*ext/max(iA.z,1e-3); fA=iA; fB=iB; fC=iC; fSeed=iSeed;
  gl_Position = vec4(px/uRes*2.0-1.0, 0.0, 1.0); }`;
export const FEAT_FS = `${HEAD}${COMMON}
in vec2 vS; flat in vec4 fA; flat in vec4 fB; flat in vec4 fC; flat in uint fSeed; out vec4 o;
uniform float uTime; uniform vec2 uRes;
void main(){
  float d = bayer(gl_FragCoord.xy); int kind = int(fB.x+0.5); int c1 = int(fB.y+0.5), c2 = int(fB.z+0.5);
  float ca = cos(fA.w), sa = sin(fA.w); vec2 s = vec2(vS.x*ca + vS.y*sa, (-vS.x*sa + vS.y*ca)/max(fB.w,0.2));
  float r = length(s); float px = fA.z; float fog = fC.x; float fade = fC.z;
  int oct = clamp(int(log2(max(px,1.0))), 2, 7);
  vec3 col; float al = 0.0;
  if (kind == 1) { // star cluster
    vec2 p = vS*px/2.0; vec2 fl = floor(p); ivec3 c = ivec3(ivec2(fl), 2);
    float prob = exp(-r*r*4.0)*0.9; float h = h01(c, fSeed);
    if (h < prob) { col = rampC(h01(c, fSeed^9u) > 0.3 ? R_sYel : R_sWht, 0.7+0.3*h01(c,fSeed^3u), d); al = 1.0; }
    float glow = exp(-r*r*6.0)*0.8; if (al < 0.5 && glow > d + 0.25) { col = rampC(R_sYel, glow*0.6, d); al = 1.0; }
  } else {
    vec2 q = s*1.6 + vec2(float(fSeed&255u)*0.13, float((fSeed>>8)&255u)*0.11);
    float n = fbm2(q, oct, fSeed), n2 = 1.0 - abs(fbm2(q*2.3+vec2(4.0), max(oct-1,2), fSeed^0x5u)*2.0-1.0);
    float dens = (1.0 - r*0.95) + (n-0.5)*1.3 + (n2-0.6)*0.5;
    if (kind == 3) { float rd = r + 0.25*(n-0.5); float band = 1.0 - abs(rd-0.65)/0.09; float sh = fbm2(q*4.0 + vec2(uTime*0.2,0.0), 3, fSeed^0x77u);
      dens = max(band, 0.0)*1.2 + (r < 0.6 ? (sh-0.55)*2.5*(1.0-r) : 0.0); }
    // up close you are inside the cloud: it thins into wisps and filaments
    float closeT = kind == 3 ? 0.0 : smoothstep(uRes.y*0.4, uRes.y*3.0, px)*0.6;
    float wisp = n2 + (n-0.5)*0.6;
    if (dens > 0.08 + d*0.35 && wisp > closeT + d*0.25*step(0.01, closeT)) {
      al = 1.0; float v = clamp(0.18 + n2*0.62 + (n-0.5)*0.5 + min(dens,1.0)*0.15, 0.0, 1.0);
      if (kind == 2) col = rampC(R_tar, 0.15 + v*0.25, d);
      else col = rampC(n2 > 0.72 ? c2 : c1, v, d);
    }
  }
  if (al < 0.5 || fade < d) discard;
  o = vec4(fogTint(col, fog, d), 1.0);
}`;

// ---------------------------------------------------------------- stars (resolved systems)
export const STAR_VS = `${HEAD}
in vec2 aP; in vec4 iA; in vec4 iB;
uniform vec2 uRes;
out vec2 vS; flat out vec4 fA; flat out vec4 fB;
void main(){ float ext = 4.5 + iA.z*1.5; vec2 px = floor(iA.xy) + 0.5 + aP*ext; vS = aP*ext; fA=iA; fB=iB;
  gl_Position = vec4(px/uRes*2.0-1.0, 0.0, 1.0); }`;
export const STAR_FS = `${HEAD}${COMMON}
in vec2 vS; flat in vec4 fA; flat in vec4 fB; out vec4 o;
uniform float uTime;
void main(){
  float d = bayer(gl_FragCoord.xy); vec2 p = floor(vS + 0.5); float ax = abs(p.x), ay = abs(p.y);
  int size = int(fA.z+0.5), kind = int(fA.w+0.5), ramp = int(fB.x+0.5); float fog = fB.y, hl = fB.z, fade = fB.w;
  vec3 col; bool hit = false;
  if (kind == 1) { // black hole: a hot ring around nothing
    float rr = length(p); if (rr < 0.8) { col = vec3(0.0); hit = true; } else if (rr < 2.2) { col = rampC(R_disk, 0.85 - (rr-0.8)*0.3, d); hit = true; } }
  else {
    float tw = 0.75 + 0.25*sin(uTime*2.0 + fA.x*0.37 + fA.y*0.71);
    if (ax + ay < 0.5) { col = rampC(ramp, 0.92, d); hit = true; }
    else if (size >= 1 && ((ax < 0.5 && ay < 1.5 + float(size-1)) || (ay < 0.5 && ax < 1.5 + float(size-1)))) { float k = 1.0 - (ax+ay)/(2.5+float(size)); if (k*tw > d*0.7) { col = rampC(ramp, 0.4 + k*0.5, d); hit = true; } }
    else if (size >= 2 && ax == ay && ax < float(size)-0.5) { if (0.5 > d) { col = rampC(ramp, 0.35, d); hit = true; } }
    else if (size >= 3 && ax*ax+ay*ay < 7.0 && d < 0.35) { col = rampC(ramp, 0.3, d); hit = true; }
    if (kind == 2 && !hit) { float a = uTime*4.0; vec2 dir = vec2(cos(a), sin(a)); float along = dot(p, dir), across = abs(p.x*dir.y - p.y*dir.x);
      if (across < 0.6 && abs(along) < 3.5 && abs(along) > 0.6 && d < 0.7) { col = rampC(R_sBlu, 0.6, d); hit = true; } }
    if (kind == 3 && !hit) { float rr = length(p); if (abs(rr - 3.0) < 0.6 && d < 0.75) { col = rampC(int(fB.x+0.5) == R_sBlu ? R_cyan : R_pink, 0.6, d); hit = true; } }
  }
  if (hl > 0.5 && !hit) { float rr = max(ax, ay); if (rr > 3.5 && rr < 4.5 && (ax < 1.5 || ay < 1.5)) { col = vec3(0.55,1.0,0.9); hit = true; } }
  if (!hit || fade < d) discard;
  o = vec4(fogTint(col, fog*0.8, d), 1.0);
}`;

// ---------------------------------------------------------------- textured sprites (Atlas portraits)
export const SPR_VS = `${HEAD}
in vec2 aP; in vec4 iA; in vec4 iB; in vec4 iC;
uniform vec2 uRes;
out vec2 vUV; flat out vec4 fC;
void main(){ vec2 px = floor(iA.xy) + aP*iA.z; vUV = iB.xy + vec2(aP.x*0.5+0.5, 0.5-aP.y*0.5)*iB.zw; fC = iC;
  gl_Position = vec4(px/uRes*2.0-1.0, 0.0, 1.0); }`;
export const SPR_FS = `${HEAD}${COMMON}
in vec2 vUV; flat in vec4 fC; out vec4 o;
uniform sampler2D uTex;
void main(){ float d = bayer(gl_FragCoord.xy); vec4 c = texture(uTex, vUV); if (c.a < 0.5 || fC.y < d) discard;
  o = vec4(fogTint(c.rgb, fC.x, d), 1.0); }`;

// ---------------------------------------------------------------- final blit (with photo-mode tilt)
export const BLIT_FS = `${HEAD}
in vec2 vP; out vec4 o;
uniform sampler2D uTex; uniform float uTilt, uK, uAspect, uVig; uniform vec2 uTexRes;
void main(){
  vec2 uv;
  if (uTilt < 0.001) uv = vP*0.5+0.5;
  else {
    float tf = 0.6; vec3 dir = normalize(vec3(vP.x*uAspect*tf, vP.y*tf, -1.0));
    float th = uTilt; vec3 nrm = vec3(0.0, sin(th), cos(th)); vec3 P0 = vec3(0.0, 0.0, -1.0/tf);
    float t = dot(P0, nrm)/dot(dir, nrm); if (t <= 0.0) { o = vec4(0.0,0.0,0.0,1.0); return; }
    vec3 hp = dir*t - P0; float u = hp.x, v = dot(hp, vec3(0.0, cos(th), -sin(th)));
    uv = vec2(u/(uAspect*uK*(1.0/tf)), v/(uK*(1.0/tf)))*0.5+0.5;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { o = vec4(0.008,0.01,0.02,1.0); return; }
  }
  vec3 c = texture(uTex, uv).rgb;
  if (uVig > 0.0) { float r = length(vP*vec2(1.0, 0.8)); c *= 1.0 - uVig*smoothstep(0.6, 1.5, r); }
  o = vec4(c, 1.0);
}`;
export { HEAD, COMMON };
