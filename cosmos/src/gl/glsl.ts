// Shared GLSL: the same integer hash and value noise as core/hash.ts, Bayer dithering and palette
// ramps (the Atlas renderer's ramps), so every scale is drawn in one crisp pixel-art language.
export const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
`;
export const COMMON = `
uniform sampler2D uRamps;
uint hsh(ivec3 c, uint s){ uint h=(uint(c.x)*0x8da6b343u)^(uint(c.y)*0xd8163841u)^(uint(c.z)*0xcb1ab31fu)^s;
  h^=h>>16; h*=0x7feb352du; h^=h>>15; h*=0x846ca68bu; h^=h>>16; return h; }
float h01(ivec3 c, uint s){ return float(hsh(c,s)>>8)/16777216.0; }
float vnI(ivec2 i, vec2 f, uint s){ vec2 u=f*f*(3.0-2.0*f);
  float a=h01(ivec3(i,0),s), b=h01(ivec3(i+ivec2(1,0),0),s), c=h01(ivec3(i+ivec2(0,1),0),s), d=h01(ivec3(i+ivec2(1,1),0),s);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
float vn2(vec2 p, uint s){ vec2 i=floor(p); return vnI(ivec2(i), p-i, s); }
float fbm2(vec2 p, int oct, uint s){ float t=0.0,n=0.0,a=0.5;
  for(int k=0;k<8;k++){ if(k>=oct) break; t+=a*vn2(p, s+uint(k)*0x9e3779b9u); n+=a; p=p*2.03+vec2(17.1,-9.3); a*=0.5; } return t/n; }
// split-coordinate fbm (exact doubling): position = B + f, B an integer lattice base
float fbmS(ivec2 B, vec2 f, int oct, uint s){ float t=0.0,n=0.0,a=0.5;
  for(int k=0;k<6;k++){ if(k>=oct) break; vec2 fl=floor(f); t+=a*vnI(B+ivec2(fl), f-fl, s+uint(k)*0x9e3779b9u); n+=a;
    B=B*2+ivec2(17,-9); f=f*2.0; a*=0.5; } return t/n; }
float vn3(vec3 p, uint s){ vec3 i=floor(p), f=p-i, u=f*f*(3.0-2.0*f); ivec3 c=ivec3(i);
  float a=h01(c,s), b=h01(c+ivec3(1,0,0),s), cc=h01(c+ivec3(0,1,0),s), d=h01(c+ivec3(1,1,0),s);
  float e=h01(c+ivec3(0,0,1),s), f2=h01(c+ivec3(1,0,1),s), g=h01(c+ivec3(0,1,1),s), h=h01(c+ivec3(1,1,1),s);
  return mix(mix(mix(a,b,u.x),mix(cc,d,u.x),u.y), mix(mix(e,f2,u.x),mix(g,h,u.x),u.y), u.z); }
float fbm3(vec3 p, int oct, uint s){ float t=0.0,n=0.0,a=0.5;
  for(int k=0;k<10;k++){ if(k>=oct) break; t+=a*vn3(p, s+uint(k)*0x9e3779b9u); n+=a; p=p*2.03+vec3(17.1,-9.3,5.7); a*=0.5; } return t/n; }
float bayer(vec2 fc){ ivec2 p=ivec2(fc)&3; int i=p.x+p.y*4;
  int m[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return (float(m[i])+0.5)/16.0; }
vec3 rampC(int r, float v, float d){ float f=clamp(v,0.0,1.0)*5.0; int i=int(floor(f)); if(fract(f)>d) i++;
  return texelFetch(uRamps, ivec2(clamp(i,0,5), r), 0).rgb; }
vec3 rampAt(int r, int i){ return texelFetch(uRamps, ivec2(clamp(i,0,5), r), 0).rgb; }
float luma(vec3 c){ return dot(c, vec3(0.3,0.55,0.15)); }
vec3 fogTint(vec3 c, float fog, float d){ // uncharted: a cold monochrome guess
  if (fog <= 0.0) return c; float l = floor(luma(c)*4.0 + d)/4.0; return mix(c, vec3(0.08,0.2,0.24)*0.4 + vec3(0.25,0.75,0.8)*l*0.55, fog); }
`;
export const QUAD_VS = `${HEAD}
in vec2 aP; out vec2 vP; void main(){ vP=aP; gl_Position=vec4(aP,0.0,1.0); }`;

// ---------------------------------------------------------------- universe: the cosmic web
export const UNI_FS = `${HEAD}${COMMON}
in vec2 vP; out vec4 o;
uniform ivec2 uI; uniform vec2 uF; uniform float uH, uAspect, uTime; uniform vec2 uRes;
uniform uvec4 uSa, uSb; uniform uint uSeed;
uniform vec4 uChart[16]; uniform int uNChart; uniform float uFogOn;
vec3 worley(ivec2 B, vec2 f, uint s){ vec2 fl=floor(f); ivec2 c=B+ivec2(fl); vec2 p=f-fl; float d1=9.0,d2=9.0,d3=9.0; ivec2 c1=c, c2=c;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ ivec2 cc=c+ivec2(i,j); uint h=hsh(ivec3(cc,7),s);
    vec2 o2=vec2(float(i)+0.15+0.7*float(h&0xffffu)/65535.0, float(j)+0.15+0.7*float(h>>16)/65535.0);
    float d=length(o2-p); if(d<d1){d3=d2;d2=d1;c2=c1;d1=d;c1=cc;} else if(d<d2){d3=d2;d2=d;c2=cc;} else if(d<d3) d3=d; }
  float w = h01(ivec3(c1.x+c2.x, c1.y+c2.y, abs(c1.x-c2.x)*7+abs(c1.y-c2.y)*3), s^0x5a5au);
  return vec3(d2-d1, d3-d1, w); }
void main(){
  vec2 off = vP*vec2(uAspect,1.0)*uH; vec2 F = uF + off;
  float pix = 2.0*uH/uRes.y; float d = bayer(gl_FragCoord.xy);
  int oct = pix > 4.0 ? 2 : 3;
  float w0 = fbmS(uI*8, F/128.0, oct, uSa.x), w1 = fbmS(uI*8, F/128.0, oct, uSa.y);
  vec2 W = F + 70.0*(vec2(w0,w1)-0.5);
  vec3 a = worley(uI*16, W/64.0, uSa.z), b = worley(uI*64, W/16.0, uSa.w);
  float fil = exp(-pow(a.x/(0.03+0.07*a.z),2.0))*(0.15+0.85*a.z*a.z), node = exp(-pow(a.y/0.13,2.0))*fil;
  float fil2 = exp(-pow(b.x/0.07,2.0))*b.z*(0.1+0.9*exp(-pow(a.x/0.3,2.0)));
  float D = fil*0.9 + node*2.2 + fil2*0.5 + 0.004;
  // fine gas texture along the filaments
  float gas = fbmS(uI*256, F/4.0, pix < 0.6 ? 4 : 2, uSb.x);
  float vis = smoothstep(0.25, 4.0, uH) * (0.45 + 0.55*smoothstep(6.0, 90.0, uH));
  float g = D*(0.55+0.7*gas);
  vec3 col = vec3(0.016,0.018,0.035);
  if (g > 0.03) {
    int r = g > 1.5 ? R_pink : g > 0.45 ? R_violet : R_navy;
    float v = clamp(g*0.3, 0.0, 1.0);
    vec3 c = rampC(r, v*1.2+0.08, d);
    float al = smoothstep(0.03, 0.5, g)*vis;
    col = mix(col, c, al*0.9);
  }
  // unresolved galaxies: a glitter of the same 1 Mpc cells the CPU fills
  float cellPx = 1.0/pix;
  if (cellPx < 2.6) {
    ivec2 cell = uI*1024 + ivec2(floor(F));
    float lam = D*1.6; float p = 1.0-exp(-lam*0.8);
    float h = h01(ivec3(cell,1), uSeed);
    if (h < p) {
      float h2 = h01(ivec3(cell,9), uSeed);
      float br = (0.45 + 0.55*h2) * (1.0 - smoothstep(1.4, 2.6, cellPx));
      float k = cellPx >= 1.0 ? step(length(fract(F) - vec2(0.1+0.8*h01(ivec3(cell,1000),uSeed), 0.1+0.8*h01(ivec3(cell,1001),uSeed))), pix*0.7) : 1.0;
      if (k > 0.0 && br > d*0.6) col = mix(col, rampC(h2 > 0.6 ? R_sWht : R_sYel, 0.55+0.45*br, d), br);
    }
  }
  // charting: uncharted space is a dim low-detail guess
  if (uFogOn > 0.5) {
    float ch = 0.0, edge = 0.0;
    for (int i=0;i<16;i++){ if(i>=uNChart) break; float dd = length(off - uChart[i].xy) - uChart[i].z; ch = max(ch, smoothstep(pix*2.0, -pix*2.0, dd)); edge = max(edge, 1.0 - smoothstep(0.0, pix*1.2, abs(dd))); }
    col = fogTint(col, (1.0-ch)*0.85, d);
    if (edge > 0.5 && fract(atan(off.y, off.x)*12.0 + uTime*0.1) > 0.5) col = mix(col, vec3(0.45,0.95,0.9), 0.7);
  }
  o = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- galaxies (shared look)
export const GAL_FN = `
// type 0 spiral, 1 barred, 2 elliptical, 3 lenticular, 4 irregular, 5 ring
float galD(vec2 q, int type, float arms, float pitch, float rot, int flags, uint seed, int oct, out float arm, out float core, out float dust, out float hii){
  float r = length(q); arm = 0.0; core = 0.0; dust = 0.0; hii = 0.0;
  if (r > 1.7) return 0.0;
  float bulge = exp(-pow(r/(type==2?0.35:0.13),2.0)); core = bulge;
  if (type == 2) return 2.4*exp(-pow(r/0.3,0.75)*2.2) * (0.92 + 0.16*fbm2(q*9.0, max(oct-2,1), seed^0x99u));
  float warp = fbm2(q*2.2+vec2(11.0,-7.0), 3, seed) - 0.5;
  if (type == 4) { float dd = exp(-r*2.4)*pow(fbm2(q*2.5, 4, seed^0x55u),1.5)*4.5; arm = dd*0.4;
    float k = fbm2(q*14.0, max(oct-1,2), seed^0x3u); if (k > 0.66) hii = (k-0.66)*4.0; return dd*(0.8+0.5*fbm2(q*8.0,max(oct-1,1),seed^0x7u)); }
  float th = atan(q.y, q.x);
  float ph = th*arms - log(r+0.04)*arms/tan(pitch) + rot + warp*2.4*((flags&16)!=0?2.5:1.0);
  float a = pow(0.5+0.5*cos(ph), 3.0);
  if (type == 3) a *= 0.12;
  if (type == 5) a = a*0.3 + exp(-pow((r-0.62)/0.07,2.0))*1.6;
  float disk = exp(-r*3.1)*smoothstep(1.55, 0.9, r);
  float bar = 0.0;
  if (type == 1) { float ca=cos(rot), sa=sin(rot); float u=q.x*ca+q.y*sa, v=-q.x*sa+q.y*ca; bar = exp(-pow(v/0.05,2.0))*smoothstep(0.38,0.2,abs(u)); }
  float D = disk*(0.22 + 1.8*a*(0.6+warp*0.8+0.4)) + bulge*1.9 + bar*1.3 + ((flags&1)!=0 ? exp(-pow(r/0.05,2.0))*3.0 : 0.0);
  arm = a*disk*3.0;
  // visual-only detail: dust lanes on the inner edge of the arms, star-forming knots on them
  if (oct > 1) {
    float n = fbm2(q*7.0, oct, seed^0x77u);
    float lane = pow(0.5+0.5*cos(ph-0.55), 10.0) * smoothstep(0.08, 0.3, r) * smoothstep(1.1, 0.5, r);
    dust = lane*(0.5+n*0.8)*(type==3?0.4:1.0);
    float fil = fbm2(q*16.0+vec2(3.0), max(oct-1,2), seed^0x31u);
    D *= 0.75 + 0.5*n;
    if (type != 3) { float k = fbm2(q*22.0, max(oct-2,2), seed^0x5u); if (k*a > 0.42) hii = (k*a-0.42)*5.0; }
    dust += smoothstep(0.55, 0.75, fil)*0.35*disk*3.0;
  }
  return D;
}
vec4 galCol(vec2 q, int type, float arms, float pitch, float rot, int flags, uint seed, int cr, int ar, float pxR, float d, float fog){
  int oct = clamp(int(log2(1.0/max(pxR,1e-6)))-1, 1, 7);
  float arm, core, dust, hii;
  float D = galD(q, type, arms, pitch, rot, flags, seed, oct, arm, core, dust, hii);
  float r = length(q);
  float halo = (flags&4)!=0 ? exp(-r*1.6)*0.25 : 0.0;
  float L = D*(1.0-clamp(dust,0.0,0.85)) + halo;
  float al = smoothstep(0.02, 0.12, L);
  if (al < d) return vec4(0.0);
  float br = 1.0 - exp(-L*0.95);
  float wc = clamp(core*2.4/(D+0.02), 0.0, 1.0);
  int rr = wc > d ? cr : ar;
  vec3 c = rampC(rr, br*1.05, d);
  if (hii > 0.25 && fog < 0.5) c = rampC(R_pink, 0.45+hii*0.4, d);
  if (dust > 0.45 && L < 0.6) c = mix(c, rampAt(R_dust,1), 0.6);
  if (fog > 0.0) c = fogTint(c, fog, d);
  return vec4(c, 1.0);
}`;

// instanced galaxies in the universe frame
export const GALI_VS = `${HEAD}
in vec2 aP; in vec4 iA; in vec4 iB; in vec4 iC; in uint iSeed;
// iA: center px.xy, R px, extent factor   iB: cos(inc), pa, type, arms   iC: pitch, rot, flags, ramps(cr*64+ar)
uniform vec2 uRes;
out vec2 vS; flat out vec4 fB; flat out vec4 fC; flat out uint fSeed; flat out float fRpx;
void main(){
  float ext = iA.w*max(iA.z, 1.5);
  vec2 px = iA.xy + aP*ext;
  vS = aP*ext/max(iA.z,1e-3); fB=iB; fC=iC; fSeed=iSeed; fRpx=iA.z;
  gl_Position = vec4(px/uRes*2.0-1.0, 0.0, 1.0);
}`;
export const GALI_FS = `${HEAD}${COMMON}${GAL_FN}
in vec2 vS; flat in vec4 fB; flat in vec4 fC; flat in uint fSeed; flat in float fRpx; out vec4 o;
uniform float uTime, uFog;
void main(){
  float d = bayer(gl_FragCoord.xy);
  int type = int(fB.z+0.5); int flags = int(fC.z+0.5); int cr = int(fC.w)/64, ar = int(fC.w)%64;
  float c = max(fB.x, 0.12); float pa = fB.y;
  vec2 t = vec2(cos(pa), sin(pa)), n = vec2(-t.y, t.x);
  vec2 s = vS; // screen offset in units of R
  float fog = uFog;
  if (fRpx < 1.6) { // a point, or a tiny cross for big ones
    vec2 pp = floor(s*fRpx + 0.5); float ax = abs(pp.x), ay = abs(pp.y);
    if (ax + ay < 0.5) { o = vec4(fogTint(rampC(cr, 0.9, d), fog, d), 1.0); return; }
    if (fRpx > 0.7 && ax + ay < 1.5) { o = vec4(fogTint(rampC(ar, 0.55, d), fog, d), 1.0); return; }
    discard; }
  vec2 q = s + (1.0/c - 1.0)*dot(s,n)*n;
  vec4 g = galCol(q, type, fB.w, fC.x, fC.y, flags, fSeed, cr, ar, 1.0/(fRpx*c), d, fog);
  float sinI = sqrt(max(1.0-c*c, 0.0));
  float along = dot(s,n), across = dot(s,t);
  // relativistic jets along the spin axis (seen from the side), blazar glare (seen down the barrel)
  if ((flags&32)!=0) {
    float L = 3.2*(0.25+sinI); float w = 0.05 + abs(along)*0.05;
    if (abs(along) < L && abs(along) > 0.05 && abs(across) < w) {
      float k = 1.0 - abs(along)/L; float knot = 0.6+0.4*sin(abs(along)*18.0 - uTime*3.0);
      if (k*knot > d*0.8) g = vec4(rampC((flags&64)!=0 ? R_sWht : R_sBlu, 0.5+0.5*k, d), 1.0); }
    if ((flags&128)!=0 || (flags&64)!=0) { float rr = length(s); float gl = exp(-rr*rr*((flags&128)!=0?18.0:40.0)); if (gl > d) g = vec4(rampC(R_sWht, 0.6+0.4*gl, d), 1.0);
      if ((flags&128)!=0 && (abs(s.x)<0.03 || abs(s.y)<0.03) && rr < 0.9 && (1.0-rr) > d) g = vec4(rampC(R_sBlu, 0.9-rr*0.5, d), 1.0); }
  }
  if ((flags&2)!=0) { // Fermi bubbles: two lobes along the axis
    for (int sgn=-1; sgn<=1; sgn+=2) { vec2 cc = n*float(sgn)*0.33*(0.4+sinI*0.6); float e = abs(length((s-cc)*vec2(1.0,1.0)) - 0.3);
      if (e < 0.025 + 0.6/fRpx && g.a < 0.5) g = vec4(rampC(R_magenta, 0.6, d), 1.0); } }
  if ((flags&8)!=0) { // tidal stream: a faint arc torn off the disk
    float rr = length(q), an = atan(q.y,q.x); float e = abs(rr - 1.35 - 0.15*sin(an*1.5));
    if (e < 0.03 && an > 0.2 && an < 2.4 && g.a < 0.5 && d < 0.6) g = vec4(rampC(R_blue, 0.35, d), 1.0); }
  if (g.a < 0.5) discard;
  o = g;
}`;

// the focused galaxy, full screen, in the galaxy frame
export const GALF_FS = `${HEAD}${COMMON}${GAL_FN}
in vec2 vP; out vec4 o;
uniform vec2 uRes; uniform float uAspect, uH, uTime;
uniform ivec2 uI; uniform vec2 uF;          // camera in kly (split by 64)
uniform float uR, uC, uPa; uniform int uType, uFlags, uCr, uAr; uniform float uArms, uPitch, uRot; uniform uint uSeed, uGSeed;
uniform vec4 uChart[24]; uniform int uNChart; uniform float uFogOn;
float star(ivec2 cell, vec2 fl, float S, float pix, float D, float k, uint s, out float h2){
  float h = h01(ivec3(cell, 3), s); h2 = h01(ivec3(cell, 4), s);
  if (h > 1.0 - exp(-D*k)) return 0.0;
  vec2 sp = vec2(0.1+0.8*h01(ivec3(cell,5),s), 0.1+0.8*h01(ivec3(cell,6),s));
  float dd = length(fl - sp)*S/pix; return dd < 0.75 ? 1.0 : (h2 > 0.93 && dd < 1.6 ? 0.5 : 0.0);
}
void main(){
  vec2 off = vP*vec2(uAspect,1.0)*uH;            // screen offset in kly
  float pix = 2.0*uH/uRes.y; float d = bayer(gl_FragCoord.xy);
  vec2 t = vec2(cos(uPa), sin(uPa)), n = vec2(-t.y, t.x);
  vec2 offU = off + (1.0/max(uC,0.12) - 1.0)*dot(off,n)*n;   // un-squash to face-on
  vec2 local = (uF + offU) + vec2(uI)*64.0;     // only used normalised by R (bounded)
  vec2 q = local/uR;
  // chart fog
  float fog = 0.0, edge = 0.0;
  if (uFogOn > 0.5) { float ch = 0.0;
    for (int i=0;i<24;i++){ if(i>=uNChart) break; float dd = length(offU - uChart[i].xy) - uChart[i].z; ch = max(ch, smoothstep(pix*2.0, -pix*2.0, dd)); edge = max(edge, 1.0 - smoothstep(0.0, pix*1.2, abs(dd))); }
    fog = (1.0-ch)*0.9; }
  vec4 g = galCol(q, uType, uArms, uPitch, uRot, uFlags, uGSeed, uCr, uAr, pix/uR, d, fog);
  float arm, core, dust, hii; float D = galD(q, uType, uArms, uPitch, uRot, uFlags, uGSeed, 3, arm, core, dust, hii);
  // close up, the smooth disk (unresolved starlight) dissolves into a soft tint behind resolved stars
  float glow = smoothstep(0.004, 0.08, pix*480.0/uR);
  float L = D*(1.0-clamp(dust,0.0,0.85));
  float wc = clamp(core*2.4/(D+0.02), 0.0, 1.0);
  float tb = (1.0-exp(-L*0.8)); tb = floor(tb*6.0 + d)/6.0;
  vec3 tint = mix(rampAt(uAr, 1), rampAt(uCr, 2), wc) * (0.08 + 0.5*tb) * (0.35 + 0.65*glow);
  float tA = smoothstep(0.0, 0.06, L);
  vec3 col; float al;
  if (glow >= 0.999) { col = g.rgb; al = g.a; }
  else { col = g.a > 0.5 && d < glow ? g.rgb : tint; al = max(g.a*glow, tA); if (g.a < 0.5) al = tA; }
  // star layers: S = 2, 1/2, 1/8 kly lattices of unresolved stars, then faint far-background stars
  for (int L2=0; L2<4; L2++) {
    float S = L2==0 ? 2.0 : L2==1 ? 0.5 : L2==2 ? 0.125 : 0.0078125; float cellPx = S/pix;
    float vis = L2==3 ? smoothstep(3.0, 6.0, cellPx) : smoothstep(2.0, 4.0, cellPx) * (1.0 - smoothstep(L2==2 ? 26.0 : 40.0, L2==2 ? 34.0 : 60.0, cellPx));
    if (vis <= 0.0) continue;
    float m = 64.0/S; vec2 p = (uF + offU)/S; vec2 fl = floor(p); ivec2 cell = uI*int(m) + ivec2(fl);
    float h2; float k = star(cell, p-fl, S, pix, max(D, 0.05), L2==0 ? 2.5 : L2==1 ? 1.4 : L2==2 ? 0.9 : 0.5, uSeed + uint(L2)*77u, h2);
    if (k > 0.0 && vis > d*0.8) { int rr = h2 < 0.45 ? R_sYel : h2 < 0.7 ? R_sWht : h2 < 0.88 ? R_sOra : R_sBlu;
      col = rampC(rr, L2==3 ? 0.25+0.15*h2 : 0.6+0.4*k, d); al = 1.0; }
  }
  if (fog > 0.0) col = fogTint(col, fog, d);
  if (edge > 0.5 && fract(atan(offU.y,offU.x)*10.0 + uTime*0.15) > 0.5) { col = vec3(0.45,0.95,0.9); al = 1.0; }
  if (al < 0.01) { o = vec4(0.0); return; }
  o = vec4(col*al, al);
}`;
