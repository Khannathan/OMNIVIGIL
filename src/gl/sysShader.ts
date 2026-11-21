// The star-system ray caster (ported from the Pixelwright world-map preview, preview/system/).
// One full-screen pass: every body is a sphere found per pixel, coloured by procedural cube-sphere
// tiles from the Pixelwright terrain atlas (biome rows x 16 tile kinds x 3 shades). Worlds that have
// a real game map take their continents, seas and settlements from a mask (one 256x128 slot each),
// so the planet you zoom into is the same planet the globe shows.
//
// Body table (RGBA32F, 6 texels per body, row = body index):
//   0 pos.xyz (camera-relative, focus units), R     1 biome, sea, river, lunar
//   2 tint.rgb, seed                                3 atmosphere.rgb, orbit radius (focus units)
//   4 cloud.rgb, parent index + 1 (0 = the star)    5 mask slot (-1 none), dim (uncharted world), unused, cloud cover 0..1
export const SYS_VS = `#version 300 es
in vec2 aP; out vec2 vP; void main(){ vP = aP; gl_Position = vec4(aP, 0.0, 1.0); }`;

export const SYS_FS = `#version 300 es
precision highp float; precision highp int;
in vec2 vP; out vec4 o;
uniform vec2 uRes; uniform vec3 uCam; uniform float uCamC; uniform vec3 uFwd, uRight, uUp; uniform float uTanH, uAspect;
uniform sampler2D uAtlas, uBodies, uMask; uniform float uMaskRows;
uniform float uTime, uCloud, uLodBias, uHazeAmt;
uniform vec4 uOut[16]; uniform int uNOut;
uniform vec3 uHaze, uSpace;
uniform int uNB, uFocus;
uniform vec3 uSunRel[2]; uniform float uSunR[2]; uniform vec3 uSunCol[2]; uniform int uSunKind[2]; uniform int uNSun;
uniform float uTerm, uRings, uEclY, uSel;
uniform vec3 uFocusLight; uniform float uFocusLightK;
uniform vec4 uNeb; uniform float uNebSeed;
uint gSeed; float gSea, gRiver; int gBiome; float gBowl, gRim; float gMask;
vec4 BT(int i, int k){ return texelFetch(uBodies, ivec2(k, i), 0); }
uint hsh(ivec3 c, uint s){ uint h=(uint(c.x)*0x8da6b343u)^(uint(c.y)*0xd8163841u)^(uint(c.z)*0xcb1ab31fu)^s;
  h^=h>>16; h*=0x7feb352du; h^=h>>15; h*=0x846ca68bu; h^=h>>16; return h; }
float h01(ivec3 c, uint s){ return float(hsh(c,s)>>8)/16777216.0; }
float vn(vec3 p, uint s){ vec3 i=floor(p), f=p-i, u=f*f*(3.0-2.0*f); ivec3 c=ivec3(i);
  float a=h01(c,s), b=h01(c+ivec3(1,0,0),s), cc=h01(c+ivec3(0,1,0),s), d=h01(c+ivec3(1,1,0),s);
  float e=h01(c+ivec3(0,0,1),s), f2=h01(c+ivec3(1,0,1),s), g=h01(c+ivec3(0,1,1),s), h=h01(c+ivec3(1,1,1),s);
  return mix(mix(mix(a,b,u.x),mix(cc,d,u.x),u.y), mix(mix(e,f2,u.x),mix(g,h,u.x),u.y), u.z)*2.0-1.0; }
float fbm(vec3 p, int oct, uint s){ float a=0.5,t=0.0,n=0.0;
  for(int k=0;k<16;k++){ if(k>=oct) break; t+=a*vn(p, s+uint(k)*0x9e3779b9u); n+=a; p=p*2.03+vec3(17.1,-9.3,5.7); a*=0.5; }
  return t/n; }
float crater(vec3 d, int oct){
  float hs=0.0; gBowl=0.0; gRim=0.0;
  int n=clamp(oct-2,3,12); float sc=3.0;
  for(int s=0;s<12;s++){ if(s>=n) break;
    vec3 q=d*sc; vec3 ci=floor(q); vec3 f=q-ci;
    uint hh=hsh(ivec3(ci), gSeed^(0x3141u+uint(s)*0x9e37u));
    if((hh&255u)<110u){
      float rad=0.12+0.21*float((hh>>8)&255u)/255.0; float m0=1.4*rad;
      vec3 cc=m0+(1.0-2.0*m0)*vec3(float((hh>>16)&15u),float((hh>>20)&15u),float((hh>>24)&15u))/15.0;
      float x=length(f-cc)/rad;
      if(x<1.4){ float dep=0.45*rad/sc; float rv=exp(-(x-1.0)*(x-1.0)/0.025);
        hs+=(x<1.0?(x*x-1.0)*dep:0.0)+rv*dep*0.5; gBowl=max(gBowl,1.0-x); gRim=max(gRim,rv); } }
    sc*=2.3; }
  return hs; }
vec2 eqUV(vec3 d){ return vec2(atan(d.x, d.z)/6.283185307 + 0.5, 0.5 - asin(clamp(d.y,-1.0,1.0))/3.141592653); }
vec4 maskAt(vec3 d){ vec2 uv = eqUV(d); float v = (gMask*128.0 + clamp(uv.y*128.0, 0.5, 127.5)) / uMaskRows; return texture(uMask, vec2(uv.x, v)); }
float H(vec3 d, int oct){
  if (gMask >= 0.0) {
    float e = (maskAt(d).r - 0.5)*2.5;
    float r = 1.0-abs(fbm(d*9.0+vec3(3.1), max(oct-3,2), gSeed^0x51u));
    float det = fbm(d*7.0, max(oct-2,3), gSeed)*0.07;
    return e*1.25 + det + (e > 0.0 ? r*r*r*0.12*smoothstep(0.0, 0.25, e) : 0.0);
  }
  float c=fbm(d*1.35, oct, gSeed);
  if (gBiome==6) return c*0.45 + crater(d, oct);
  float r=1.0-abs(fbm(d*2.6+vec3(3.1), max(oct-1,2), gSeed^0x51u));
  float m=smoothstep(0.08,0.30,c);
  float r4=r*r*r*r; return (c-0.06)*1.15 + r4*r4*0.42*m + gSea; }
vec3 cubeST(vec3 d){ vec3 A=abs(d); float face, sc, tc, ma;
  if (A.x>=A.y && A.x>=A.z){ ma=A.x; if(d.x>0.0){face=0.0;sc=-d.z;tc=-d.y;} else {face=1.0;sc=d.z;tc=-d.y;} }
  else if (A.y>=A.z){ ma=A.y; if(d.y>0.0){face=2.0;sc=d.x;tc=d.z;} else {face=3.0;sc=d.x;tc=-d.z;} }
  else { ma=A.z; if(d.z>0.0){face=4.0;sc=d.x;tc=-d.y;} else {face=5.0;sc=-d.x;tc=-d.y;} }
  float k=4.0/3.141592653589793; return vec3((k*atan(sc/ma)+1.0)*0.5,(k*atan(tc/ma)+1.0)*0.5,face); }
vec3 toDir(float face, float s, float t){ float a=tan((s*2.0-1.0)*0.7853981633974483), b=tan((t*2.0-1.0)*0.7853981633974483); vec3 v;
  if(face<0.5) v=vec3(1.0,-b,-a); else if(face<1.5) v=vec3(-1.0,-b,a); else if(face<2.5) v=vec3(a,1.0,b);
  else if(face<3.5) v=vec3(a,-1.0,-b); else if(face<4.5) v=vec3(a,-b,1.0); else v=vec3(-a,-b,-1.0);
  return normalize(v); }
float bayer(vec2 fc){ ivec2 p=ivec2(fc)&3; int i=p.x+p.y*4;
  int m[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return (float(m[i])+0.5)/16.0; }

void main(){
  vec2 sp = vP*vec2(uTanH*uAspect, uTanH);
  vec3 rd = normalize(uFwd + uRight*sp.x + uUp*sp.y);
  float pixAng = 2.0*uTanH/uRes.y;
  float dith = bayer(gl_FragCoord.xy);
  float tB = 1e30; int k = -1;
  for (int i=0;i<96;i++){ if(i>=uNB) break;
    vec4 b0 = BT(i,0); vec3 c = b0.xyz; float R = b0.w; float t;
    if (i == uFocus) { float b = dot(uCam, rd); float disc = b*b - uCamC; if (disc < 0.0) continue; t = -b - sqrt(disc); }
    else { float b = dot(c, rd); if (b <= 0.0) continue; vec3 cx = cross(c, rd); float d2 = dot(cx,cx); if (d2 >= R*R) continue; t = b - sqrt(R*R - d2); }
    if (t > 0.0 && t < tB) { tB = t; k = i; } }
  // the stars (up to two)
  int sHit = -1; float sdHit = 0.0;
  for (int s=0;s<2;s++){ if (s>=uNSun) break;
    float bs = dot(uSunRel[s], rd); if (bs <= 0.0) continue;
    float sd = length(cross(uSunRel[s], rd)) / uSunR[s];
    if (sd < 1.0) { float ts = bs - uSunR[s]*sqrt(1.0 - sd*sd); if (ts < tB) { sHit = s; sdHit = sd; tB = ts; k = -1; } } }
  vec3 col;
  if (k < 0) {
    vec3 q = floor(rd*420.0); float stv = h01(ivec3(q), 0x5151u);
    col = uSpace + (stv > 0.9988 ? vec3(0.55+0.45*h01(ivec3(q)+3, 7u)) : vec3(0.0));
    // the sky this system sits in: a nebula, cluster or galactic glow
    if (uNeb.a > 0.0) {
      float n1 = fbm(rd*2.2, 5, uint(uNebSeed)), n2 = fbm(rd*4.7+vec3(9.0), 4, uint(uNebSeed)+7u);
      float a = clamp((n1*0.8+n2*0.4+0.1)*1.6, 0.0, 1.0); a = floor(a*5.0 + dith)/5.0;
      col = mix(col, uNeb.rgb*(0.55+0.45*n2), a*uNeb.a);
    }
    for (int s=0;s<2;s++){ if (s>=uNSun) break;
      float bs = dot(uSunRel[s], rd);
      if (s == sHit) {
        float sd = sdHit, limb = sqrt(max(1.0 - sd*sd, 0.0));
        vec3 sp3 = normalize(rd*tB - uSunRel[s]);
        if (uSunKind[s] == 1) { col = vec3(0.0); continue; }
        float gran = h01(ivec3(floor(sp3*60.0 + vec3(uTime*0.4,0.0,0.0))), 0x77u);
        float lv = floor((limb*0.85 + gran*0.25)*4.0 + dith)/4.0;
        col = mix(uSunCol[s]*vec3(0.95,0.42,0.2)*1.1, mix(uSunCol[s], vec3(1.0), 0.55), clamp(lv,0.0,1.0));
      } else if (bs > 0.0) {
        float sd = length(cross(uSunRel[s], rd)) / uSunR[s];
        if (uSunKind[s] == 1) {
          // a black hole: lensing ring and a hot, flattened accretion disk
          float ring = exp(-(sd-1.5)*(sd-1.5)*9.0);
          vec3 rel = rd*bs - uSunRel[s]; float dy = abs(dot(rel, vec3(0.0,1.0,0.0)))/uSunR[s];
          float disk = (sd > 1.2 && sd < 5.0) ? exp(-dy*dy*18.0)*(1.0 - (sd-1.2)/3.8) : 0.0;
          float g = clamp(ring*0.9 + disk, 0.0, 1.0); g = floor(g*6.0 + dith)/6.0;
          col += mix(vec3(0.9,0.4,0.15), vec3(1.0,0.9,0.7), g)*g;
        } else {
          float g = exp(-(sd-1.0)*(uSunKind[s] == 2 ? 3.2 : 1.9)); float gq = floor(g*9.0 + dith)/9.0;
          col += mix(uSunCol[s]*vec3(0.9,0.38,0.14), uSunCol[s]*vec3(1.0,0.82,0.5), gq)*gq*0.8;
          if (uSunKind[s] == 2) { // pulsar beams
            vec3 rel = normalize(rd*bs - uSunRel[s]); float ang = uTime*2.2; vec3 ax = vec3(cos(ang), 0.35, sin(ang));
            float beam = pow(abs(dot(rel, normalize(ax))), 60.0); col += vec3(0.6,0.8,1.0)*floor(beam*4.0+dith)/4.0*0.8; }
        }
      }
    }
    // atmosphere halos
    for (int i=0;i<96;i++){ if(i>=uNB) break;
      vec4 b1 = BT(i,1), b3 = BT(i,3); if (b1.w > 0.5 || dot(b3.rgb, vec3(1.0)) < 0.02) continue;
      vec4 b0 = BT(i,0); vec3 c = b0.xyz; float R = b0.w; float b = dot(c, rd); if (b <= 0.0) continue;
      float dmin = length(cross(c, rd))/R; if (dmin < 1.0) continue;
      float cl = i == uFocus ? uCloud : 1.0;
      vec3 Ls = i == uFocus ? normalize(mix(normalize(uSunRel[0] - c), uFocusLight, uFocusLightK)) : normalize(uSunRel[0] - c);
      float lit = 0.35 + 0.65*clamp(dot(normalize(rd*b - c), Ls)*1.5+0.5, 0.0, 1.0);
      float g = exp(-(dmin-1.0)*28.0); col = mix(col, b3.rgb*lit, clamp(g,0.0,1.0)*0.85*cl); }
    col = mix(col, uHaze*0.75, (1.0-uCloud)*0.9*smoothstep(-0.25,0.05,dot(rd, normalize(uCam))));
  } else {
    vec4 Bk = BT(k,0); vec4 bp = BT(k,1); vec4 bt = BT(k,2); vec4 ba = BT(k,3); vec4 bc = BT(k,4); vec4 bx = BT(k,5);
    gBiome = int(bp.x+0.5); gSea = bp.y; gRiver = bp.z; gSeed = uint(bt.w + 0.5); gMask = bx.x;
    bool moon = bp.w > 0.5; bool isF = k == uFocus;
    float R = Bk.w; vec3 p; float tHit;
    if (isF) { p = normalize(uCam + rd*tB); tHit = tB; } else { p = normalize((rd*tB - Bk.xyz)/R); tHit = tB/R; }
    float cloudK = (moon || dot(bc.rgb, vec3(1.0)) < 0.02) ? 0.0 : (isF ? uCloud : 1.0);
    vec3 Ls = normalize(uSunRel[0] - Bk.xyz);
    if (isF) Ls = normalize(mix(Ls, uFocusLight, uFocusLightK));
    float foot = tHit*pixAng / max(abs(dot(p, rd)), 0.22);
    float Lf = clamp(log2(1.5708/foot) + uLodBias, 5.0, 19.0);
    float L0 = floor(Lf); float L = L0 + (dith < Lf-L0 ? 1.0 : 0.0); L = min(L, 19.0);
    int oct = clamp(int(L)-1, 4, 15);
    vec3 cst = cubeST(p); float N = exp2(L);
    float fx = floor(cst.x*N), fy = floor(cst.y*N);
    ivec2 it = ivec2(int(fx), int(fy));
    vec3 d  = toDir(cst.z, (fx+0.5)/N, (fy+0.5)/N);
    vec3 dU = toDir(cst.z, (fx+1.5)/N, (fy+0.5)/N);
    vec3 dV = toDir(cst.z, (fx+0.5)/N, (fy+1.5)/N);
    float h = H(d, oct);
    float bowl = gBowl, rimv = gRim;
    float jit = (h01(ivec3(it, int(L)), gSeed^0x77u)-0.5);
    float hj = h + jit*clamp(0.02*exp2(-(L-7.0)*0.8), 0.00005, 0.02)*(1.0+abs(h));
    float lat = abs(d.y);
    int tile; bool water = false;
    float m = fbm(d*2.2+vec3(7.7), min(oct,8), gSeed^0xA3u) + jit*0.05;
    float settle = 0.0;
    if (moon) {
      float ej = fbm(d*7.0+vec3(2.2), min(oct,7), gSeed^0x5Eu);
      if (m < -0.1) tile = (m < -0.22 ? 1 : (jit > 0.2 ? 6 : 2)); else tile = (h > 0.05 ? 5 : 4);
      if (bowl > 0.12) tile = bowl > 0.7 ? 8 : 3;
      if (rimv > 0.55) tile = 10; else if (rimv > 0.3) tile = 7;
      if (ej > 0.34 && tile != 3 && tile != 8) tile = 11;
      if (lat > 0.94) tile = 11;
    } else if (gBiome == 13) {
      float wv = fbm(d*vec3(1.2,4.0,1.2)+vec3(uTime*0.004,0.0,0.0), min(oct,9), gSeed^0x4Bu);
      float bv = d.y*6.5 + wv*1.6;
      int bi = int(mod(floor(bv), 9.0));
      int BTt[9] = int[9](0,3,1,4,2,5,9,10,11); tile = BTt[bi];
      float stv = fbm(d*3.0+vec3(5.1), min(oct,8), gSeed^0x5Cu);
      if (stv > 0.33) tile = stv > 0.4 ? 6 : 7; else if (stv < -0.38) tile = 8;
    } else {
      float sL = 0.0, sE = dot(d, Ls) + fbm(d*4.0, 5, gSeed^0x0Eu)*0.08;
      bool eye = gBiome == 8 && gMask < 0.0;
      if (eye) sL = (sE - 0.55)*0.5;
      float hl = hj - sL;
      water = hl < 0.0;
      float temp = eye ? (sE + 0.18)*2.2 - max(h,0.0)*0.35 : 1.0 - lat*1.2 - max(h,0.0)*0.35 + jit*0.04;
      bool polar = eye ? sE < -0.3 : lat > 0.9 + fbm(d*9.0, 4, gSeed^0x99u)*0.05;
      if (water) {
        tile = hl < -0.16 ? 0 : (hl < -0.05 ? 1 : 2);
        if (polar) { tile = 11; water = false; }
      } else {
        float rv = abs(fbm(d*3.3+vec3(1.3), min(oct,9), gSeed^0xC5u));
        float rw = gRiver*(1.0-h*1.5);
        if (hl < 0.0018) tile = m > 0.12 ? 6 : 3;
        else if (hj > 0.68 || temp < 0.0) tile = 11;
        else if (hj > 0.55) tile = 10;
        else if (hj > 0.42) tile = (m > 0.05 && hj < 0.48) ? 8 : 9;
        else if (rv < rw && h < 0.3) { tile = 2; water = true; }
        else if (m > -0.06) tile = (temp < 0.45 || h > 0.3) ? 8 : 7;
        else if (m > -0.16) tile = 4;
        else tile = 5;
        if (!water && rv < rw*2.4 && h < 0.3 && (tile==7||tile==8||tile==4)) tile = 5;
      }
      // settlements from the real map: your sites and the natives' cities
      if (gMask >= 0.0 && !water) {
        vec4 mk = maskAt(d); settle = mk.g;
        float br = fbm(d*180.0, 3, gSeed^0xE1u)*0.25;
        if (settle + br > 0.55) tile = (settle + br > 0.8 && mk.b > 0.5) ? 13 : 12;
      }
    }
    // moon outposts
    if (moon) for (int i=0;i<16;i++){ if(i>=uNOut) break;
      vec4 c = uOut[i]; if (int(c.w) != k) continue;
      vec3 od = normalize(c.xyz); float ang = sqrt(max(2.0*(1.0-dot(d,od)),0.0));
      float t = ang/0.09 * (1.0 + 0.45*fbm(d*60.0+vec3(float(i)), 4, gSeed^0xE1u));
      if (t < 1.0) tile = t < 0.45 ? 13 : 12; else if (t < 1.6 && h01(ivec3(it>>3, 5), gSeed) < 0.5) tile = 15; }
    int shade = 1;
    if (gBiome == 13) { float sv = fbm(d*9.0, min(oct,8), gSeed^0x6Du); shade = sv > 0.18 ? 2 : (sv < -0.18 ? 0 : 1); }
    else if (!water) {
      float hu = H(dU, oct), hv = H(dV, oct);
      float e = length(dU-d);
      vec3 tu = normalize(dU-d), tv = normalize(dV-d);
      vec3 Lw = normalize(-uRight*0.75 + uUp*0.9);
      Lw = normalize(Lw - p*dot(Lw,p));
      float slope = ((hu-h)*dot(tu,Lw) + (hv-h)*dot(tv,Lw)) / e * (moon ? 0.6 : 0.42);
      shade = slope > 0.16 ? 2 : (slope < -0.16 ? 0 : 1);
    }
    uint fl = hsh(ivec3(it>>4, 31), gSeed);
    int ux = (fl & 1u) != 0u ? 15 - (it.x & 15) : (it.x & 15);
    int uy = (fl & 2u) != 0u ? 15 - (it.y & 15) : (it.y & 15);
    ivec2 tc = ivec2(tile*16 + ux, (gBiome*3 + shade)*16 + uy);
    col = texelFetch(uAtlas, tc, 0).rgb * bt.rgb;
    if (gBiome == 14 && tile < 12) {
      float a = sin(uTime*0.35 + dot(d, vec3(2.1,1.3,-1.7))*2.0)*1.3; vec3 kx = vec3(0.57735);
      col = clamp(col*cos(a) + cross(kx,col)*sin(a) + kx*dot(kx,col)*(1.0-cos(a)), 0.0, 1.0); }
    if (gBiome == 15 && col.r - max(col.g, col.b) > 0.3) col *= 1.0 + 0.25*sin(uTime*2.6 + fbm(d*40.0, 3, gSeed)*9.0);
    vec3 lit0 = col; float mxc = max(col.r, max(col.g, col.b)), mnc = min(col.r, min(col.g, col.b));
    bool glow = gBiome >= 7 && mxc - mnc > 0.42 && mxc > 0.62;
    bool warm = (tile==12||tile==13) && col.r > 0.8 && col.g > 0.5 && col.b < 0.45;
    if (settle > 0.55) warm = warm || tile == 13;
    if (cloudK > 0.01) {
      float Lc = min(L, 9.0); float Nc = exp2(Lc);
      vec3 dc = toDir(cst.z, (floor(cst.x*Nc)+0.5)/Nc, (floor(cst.y*Nc)+0.5)/Nc);
      vec3 drift = vec3(uTime*0.006, 0.0, uTime*0.002);
      float cl = fbm(dc*2.6+drift, 6, gSeed^0xCCu);
      float sh = fbm((dc+uRight*0.025-uUp*0.025)*2.6+drift, 6, gSeed^0xCCu);
      float thr = 0.30 - bx.w*0.28;
      if (sh > thr) col *= mix(1.0, 0.72, cloudK);
      if (cl > thr) { float a = (cl > 0.24 ? 0.95 : 0.65) * cloudK; vec3 cc = bc.rgb*(cl > 0.3 ? 1.0 : 0.82); col = mix(col, cc, a); warm = false; glow = false; }
    }
    float sdot = dot(p, Ls);
    float dayK = smoothstep(-0.08, 0.16, sdot + (dith-0.5)*0.05);
    if (gBiome == 12) dayK = 0.0;
    float nightAmt = uTerm*(1.0-dayK);
    if (gBiome == 12) nightAmt = max(nightAmt, 0.9);
    if (nightAmt > 0.0) {
      vec3 nc = col*vec3(0.18,0.21,0.36);
      if (warm) nc = col*1.1; else if (glow) nc = lit0*1.08; else if ((tile==14||tile==12) && h01(ivec3(it,9),3u) > 0.9) nc = vec3(1.0,0.75,0.35);
      col = mix(col, nc, nightAmt);
    }
    float rim = 1.0 - abs(dot(p, rd));
    col = mix(col, ba.rgb*mix(1.0, dayK, uTerm*0.8), pow(rim, 3.0)*0.65*cloudK);
    float fogK = isF ? (moon ? 0.3 : 1.0)*(1.0-cloudK) : 0.0;
    float fog = 1.0 - exp(-tHit / max(uHazeAmt, 1e-6));
    col = mix(col, uHaze, clamp(fog,0.0,1.0)*fogK*0.85);
    if (bx.y > 0.5) col = mix(col, vec3(dot(col, vec3(0.3,0.5,0.2)))*vec3(0.42,0.48,0.62), 0.78); // uncharted: a grey silhouette
  }
  // orbit rings in the ecliptic, over space and over far bodies
  if (uRings > 0.01 && abs(rd.y) > 1e-6) {
    float tp = uEclY / rd.y;
    if (tp > 0.0 && tp < tB) { vec3 hp = rd*tp; float w = tp*pixAng*0.75/max(abs(rd.y), 0.08); float a = 0.0; float sel = 0.0;
      for (int i=0;i<96;i++){ if(i>=uNB) break; vec4 bc = BT(i,4), ba = BT(i,3); float pi = bc.w; vec3 oc = pi < 0.5 ? uSunRel[0] : BT(int(pi+0.5)-1, 0).xyz;
        float dd = abs(length(hp.xz - oc.xz) - ba.w); if (dd < w) { a = 1.0; if (float(i) == uSel) sel = 1.0; } }
      if (a > 0.0) col = mix(col, sel > 0.5 ? vec3(0.95,0.98,1.0) : vec3(0.32,0.78,0.74), (sel > 0.5 ? 0.7 : 0.42)*uRings); }
  }
  o = vec4(col, 1.0);
}`;
