const GROUND_FS = `#version 300 es
precision highp float; precision highp int;
in vec2 vP; out vec4 o;
uniform vec2 uRes; uniform vec3 uCam; uniform float uCamC; uniform vec3 uFwd, uRight, uUp; uniform float uTanH, uAspect;
uniform sampler2D uAtlas; uniform float uTime, uNight, uCloud, uLodBias, uHazeAmt;
uniform vec4 uCities[12]; uniform int uNCity; uniform vec3 uHaze, uSpace;
uniform vec4 uB[32]; uniform vec4 uBP[32]; uniform vec4 uBT[32]; uniform vec4 uBA[32]; uniform vec4 uBC[32];
uniform int uNB, uFocus; uniform vec3 uSunRel; uniform float uSunR, uTerm, uRings, uEclY;
uint gSeed; float gSea, gRiver; int gBiome; float gBowl, gRim;
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
// moon craters: one bowl per occupied 3D cell, at a ladder of scales; sets gBowl / gRim for the classifier
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
float H(vec3 d, int oct){
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
  // nearest body along the ray (the focus body uses the exact camera terms for street-level precision)
  float tB = 1e30; int k = -1;
  for (int i=0;i<32;i++){ if(i>=uNB) break;
    vec3 c = uB[i].xyz; float R = uB[i].w; float t;
    if (i == uFocus) { float b = dot(uCam, rd); float disc = b*b - uCamC; if (disc < 0.0) continue; t = -b - sqrt(disc); }
    else { float b = dot(c, rd); if (b <= 0.0) continue; vec3 cx = cross(c, rd); float d2 = dot(cx,cx); if (d2 >= R*R) continue; t = b - sqrt(R*R - d2); }
    if (t > 0.0 && t < tB) { tB = t; k = i; } }
  // the star
  float bs = dot(uSunRel, rd); vec3 sxv = cross(uSunRel, rd); float sd = sqrt(dot(sxv,sxv)) / uSunR;
  bool sunHit = false;
  if (bs > 0.0 && sd < 1.0) { float ts = bs - uSunR*sqrt(1.0 - sd*sd); if (ts < tB) { sunHit = true; tB = ts; k = -1; } }
  vec3 col;
  if (k < 0) {
    vec3 q = floor(rd*420.0); float st = h01(ivec3(q), 0x5151u);
    col = uSpace + (st > 0.9988 ? vec3(0.55+0.45*h01(ivec3(q)+3, 7u)) : vec3(0.0));
    if (sunHit) {
      float limb = sqrt(max(1.0 - sd*sd, 0.0));
      vec3 sp3 = normalize(rd*tB - uSunRel);
      float gran = h01(ivec3(floor(sp3*60.0 + vec3(uTime*0.4,0.0,0.0))), 0x77u);
      float lv = floor((limb*0.85 + gran*0.25)*4.0 + dith)/4.0;
      col = mix(vec3(0.95,0.36,0.12), vec3(1.0,0.96,0.78), clamp(lv,0.0,1.0));
    } else if (bs > 0.0) {
      float g = exp(-(sd-1.0)*1.9); float gq = floor(g*9.0 + dith)/9.0;
      col += mix(vec3(0.9,0.35,0.12), vec3(1.0,0.78,0.42), gq)*gq*0.8;
    }
    // atmosphere halos (fade with the focus clouds near the ground)
    for (int i=0;i<32;i++){ if(i>=uNB) break; if (uBP[i].w > 0.5 || dot(uBA[i].rgb, vec3(1.0)) < 0.02) continue;
      vec3 c = uB[i].xyz; float R = uB[i].w; float b = dot(c, rd); if (b <= 0.0) continue;
      float dmin = length(cross(c, rd))/R; if (dmin < 1.0) continue;
      float cl = i == uFocus ? uCloud : 1.0;
      float lit = 0.35 + 0.65*clamp(dot(normalize(rd*b - c), normalize(uSunRel - c))*1.5+0.5, 0.0, 1.0);
      float g = exp(-(dmin-1.0)*28.0); col = mix(col, uBA[i].rgb*lit, clamp(g,0.0,1.0)*0.85*cl); }
    col = mix(col, uHaze*0.75, (1.0-uCloud)*0.9*smoothstep(-0.25,0.05,dot(rd, normalize(uCam))));
  } else {
    vec4 Bk = uB[k]; vec4 bp = uBP[k];
    gBiome = int(bp.x+0.5); gSea = bp.y; gRiver = bp.z; gSeed = uint(uBT[k].w + 0.5);
    bool moon = bp.w > 0.5; bool isF = k == uFocus;
    float R = Bk.w; vec3 p; float tHit;
    if (isF) { p = normalize(uCam + rd*tB); tHit = tB; } else { p = normalize((rd*tB - Bk.xyz)/R); tHit = tB/R; }
    float cloudK = (moon || dot(uBC[k].rgb, vec3(1.0)) < 0.02) ? 0.0 : (isF ? uCloud : 1.0);
    vec3 Ls = normalize(uSunRel - Bk.xyz);
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
    if (moon) {
      // maria, highlands, crater floors, bright rims, boulders and ejecta
      float ej = fbm(d*7.0+vec3(2.2), min(oct,7), gSeed^0x5Eu);
      if (m < -0.1) tile = (m < -0.22 ? 1 : (jit > 0.2 ? 6 : 2)); else tile = (h > 0.05 ? 5 : 4);
      if (bowl > 0.12) tile = bowl > 0.7 ? 8 : 3;
      if (rimv > 0.55) tile = 10; else if (rimv > 0.3) tile = 7;
      if (ej > 0.34 && tile != 3 && tile != 8) tile = 11;
      if (lat > 0.94) tile = 11;
    } else if (gBiome == 13) {
      // gas giant: latitude bands warped by turbulence, with storms
      float wv = fbm(d*vec3(1.2,4.0,1.2)+vec3(uTime*0.004,0.0,0.0), min(oct,9), gSeed^0x4Bu);
      float bv = d.y*6.5 + wv*1.6;
      int bi = int(mod(floor(bv), 9.0));
      int BT[9] = int[9](0,3,1,4,2,5,9,10,11); tile = BT[bi];
      float stv = fbm(d*3.0+vec3(5.1), min(oct,8), gSeed^0x5Cu);
      if (stv > 0.33) tile = stv > 0.4 ? 6 : 7; else if (stv < -0.38) tile = 8;
    } else {
      float sL = 0.0, sE = dot(d, Ls) + fbm(d*4.0, 5, gSeed^0x0Eu)*0.08;
      bool eye = gBiome == 8;
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
    }
    // cities and outposts (focus body only)
    if (isF && !water) for (int i=0;i<12;i++){ if(i>=uNCity) break;
      vec4 c = uCities[i]; float ang = sqrt(max(2.0*(1.0-dot(d,c.xyz)),0.0));
      if (ang > c.w*2.4) continue;
      float t = ang/c.w * (1.0 + 0.45*fbm(d*1400.0/ (c.w*250.0) +vec3(float(i)), 5, gSeed^0xE1u));
      if (t < 1.0 && ((tile != 11 && tile != 10) || gBiome == 13)) {
        tile = t < 0.42 ? 13 : 12;
        int B = int(L) - 15; if (B >= 3) { int mk = (1<<B)-1; if ((it.x & mk)==0 || (it.y & mk)==0) tile = 14; }
        int B2 = int(L) - 12; if (B2 >= 2) { int mk = (1<<B2)-1; int w = max(1, B2-4); if ((it.x & mk) < w || (it.y & mk) < w) tile = 14; }
      } else if (t < 1.5 && (moon || tile==4 || tile==5) && h01(ivec3(it>>4, 5), gSeed) < 0.55 - (t-1.0)) tile = 15;
    }
    // hillshade from the height gradient, lit from the upper left of the screen
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
    col = texelFetch(uAtlas, tc, 0).rgb * uBT[k].rgb;
    if (gBiome == 14 && tile < 12) { // strange matter: the hue drifts across the ground
      float a = sin(uTime*0.35 + dot(d, vec3(2.1,1.3,-1.7))*2.0)*1.3; vec3 kx = vec3(0.57735);
      col = clamp(col*cos(a) + cross(kx,col)*sin(a) + kx*dot(kx,col)*(1.0-cos(a)), 0.0, 1.0); }
    if (gBiome == 15 && col.r - max(col.g, col.b) > 0.3) col *= 1.0 + 0.25*sin(uTime*2.6 + fbm(d*40.0, 3, gSeed)*9.0); // the world has a pulse
    vec3 lit0 = col; float mxc = max(col.r, max(col.g, col.b)), mnc = min(col.r, min(col.g, col.b));
    bool glow = gBiome >= 7 && mxc - mnc > 0.42 && mxc > 0.62;
    bool warm = (tile==12||tile==13) && col.r > 0.8 && col.g > 0.5 && col.b < 0.45;
    if (cloudK > 0.01) {
      float Lc = min(L, 9.0); float Nc = exp2(Lc);
      vec3 dc = toDir(cst.z, (floor(cst.x*Nc)+0.5)/Nc, (floor(cst.y*Nc)+0.5)/Nc);
      vec3 drift = vec3(uTime*0.006, 0.0, uTime*0.002);
      float cl = fbm(dc*2.6+drift, 6, gSeed^0xCCu);
      float sh = fbm((dc+uRight*0.025-uUp*0.025)*2.6+drift, 6, gSeed^0xCCu);
      if (sh > 0.14) col *= mix(1.0, 0.72, cloudK);
      if (cl > 0.14) { float a = (cl > 0.24 ? 0.95 : 0.65) * cloudK; vec3 cc = uBC[k].rgb*(cl > 0.3 ? 1.0 : 0.82); col = mix(col, cc, a); warm = false; glow = false; }
    }
    // the star lights the day side; the night side keeps its city lights
    float sdot = dot(p, Ls);
    float dayK = smoothstep(-0.08, 0.16, sdot + (dith-0.5)*0.05);
    if (gBiome == 12) dayK = 0.0; // a rogue world: no star of its own
    float nightAmt = max(uNight, uTerm*(1.0-dayK));
    if (gBiome == 12) nightAmt = max(nightAmt, 0.9);
    if (nightAmt > 0.0) {
      vec3 nc = col*vec3(0.18,0.21,0.36);
      if (warm) nc = col*1.1; else if (glow) nc = lit0*1.08; else if (tile==14 && h01(ivec3(it,9),3u) > 0.93) nc = vec3(1.0,0.75,0.35);
      col = mix(col, nc, nightAmt);
    }
    float rim = 1.0 - abs(dot(p, rd));
    col = mix(col, uBA[k].rgb*mix(1.0, dayK, uTerm*0.8), pow(rim, 3.0)*0.65*cloudK);
    float fogK = isF ? (moon ? 0.3 : 1.0)*(1.0-cloudK) : 0.0;
    float fog = 1.0 - exp(-tHit / max(uHazeAmt, 1e-6));
    col = mix(col, uHaze*mix(1.0, 0.35, uNight), clamp(fog,0.0,1.0)*fogK*0.85);
  }
  // orbit rings in the ecliptic, over space and over far bodies
  if (uRings > 0.01 && abs(rd.y) > 1e-6) {
    float tp = uEclY / rd.y;
    if (tp > 0.0 && tp < tB) { vec3 hp = rd*tp; float w = tp*pixAng*0.75/max(abs(rd.y), 0.08); float a = 0.0;
      for (int i=0;i<32;i++){ if(i>=uNB) break; float pi = uBC[i].w; vec3 oc = pi < 0.5 ? uSunRel : uB[int(pi+0.5)-1].xyz;
        float dd = abs(length(hp.xz - oc.xz) - uBA[i].w); if (dd < w) a = 1.0; }
      if (a > 0.0) col = mix(col, vec3(0.32,0.78,0.74), 0.42*uRings); }
  }
  o = vec4(col, 1.0);
}`;
