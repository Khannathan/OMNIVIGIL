import { HEAD, COMMON } from './glsl';
// ---------------------------------------------------------------- the star system and planet globes
// Body table (RGBA32F, 10 texels per body, row = body):
// 0 pos.xy px, dispR px, kind (0 star 1 planet 2 moon 3 belt 4 oort 5 black hole 6 pulsar 7 remnant)
// 1 orbit centre.xy px, orbit radius px, orbit style (0 none 1 solid 2 dashed)
// 2 base, t2, sea, cloud ramps     3 atmo, vein, ring, pattern     4 sea level, clouds, bands, craters
// 5 ice, vein width, emissive, spin angle     6 ring inner, ring outer, atmo width, highlight
// 7 fog, city lights, ridge, t2 level     8 freq, turbulence, sea emissive, storm ramp     9 seed, tilt, nebula/corona px, belt width px
export const SYS_FS = `${HEAD}${COMMON}
in vec2 vP; out vec4 o;
uniform sampler2D uB; uniform int uNB; uniform vec2 uRes; uniform float uTime, uPixAU; uniform vec2 uSun; uniform int uSunRamp;
vec4 BT(int i, int k){ return texelFetch(uB, ivec2(k, i), 0); }
uint gS; float gCra;
float crater(vec3 dd, out float rim){
  float bowl = 0.0; rim = 0.0; float sc = 2.5;
  for (int s=0;s<4;s++){ vec3 q = dd*sc; vec3 ci = floor(q); vec3 f = q - ci; uint hh = hsh(ivec3(ci), gS^(0x3141u+uint(s)*0x9e37u));
    if (float(hh&255u) < 40.0 + gCra*9.0) { float rad = 0.15+0.2*float((hh>>8)&255u)/255.0; vec3 cc = 0.3+0.4*vec3(float((hh>>16)&15u),float((hh>>20)&15u),float((hh>>24)&15u))/15.0;
      float x = length(f-cc)/rad; if (x < 1.0) bowl = max(bowl, 1.0-x); rim = max(rim, exp(-(x-1.0)*(x-1.0)/0.02)); }
    sc *= 2.1; }
  return bowl; }
// returns ramp in .x, value in .y, emissive in .z
vec3 shadeP(int i, vec3 P, float lam, vec2 fc, int oct){
  vec4 b2=BT(i,2), b3=BT(i,3), b4=BT(i,4), b5=BT(i,5), b7=BT(i,7), b8=BT(i,8);
  int base=int(b2.x+0.5), t2=int(b2.y+0.5), sea=int(b2.z+0.5), cloud=int(b2.w+0.5);
  int vein=int(b3.y+0.5), pat=int(b3.w+0.5); float sl=b4.x, cc=b4.y, bands=b4.z; gCra=b4.w;
  float ic=b5.x, vw=b5.y; bool em=b5.z>0.5; float f=b8.x, turb=b8.y; bool se=b8.z>0.5; int st=int(b8.w+0.5);
  float X=P.x, Y=P.y, Z=P.z; float t=uTime;
  if (pat==1){ float k=mod(floor((atan(Z,X)+3.15)*2.5)+floor((Y+1.0)*4.0),2.0); return k>0.5?vec3(float(R_magenta),0.75,1.0):vec3(float(R_tar),0.4,1.0); }
  if (pat==2){ float a=atan(Z,X); float gx=fract(a*3.0/3.14159), gy=fract((Y+1.0)*3.0); bool k=(gx<0.5)!=(gy<0.5); return k?vec3(float(R_bone),0.75,0.0):vec3(float(R_tar),0.35,0.0); }
  if (pat==3){ float a=atan(Z,X)*8.0, b=Y*8.0; float ln=min(abs(fract(a)-0.5),abs(fract(b)-0.5)); float h=h01(ivec3(int(floor(a)),int(floor(b)),1),gS);
    if (ln<0.06 && h>0.45) return vec3(float(vein>=0?vein:R_cyan), 0.6+0.2*sin(t*3.0+h*9.0)+0.15, 1.0); return vec3(float(base), 0.25+fbm3(P*4.0,2,gS)*0.4, 0.0); }
  if (pat==4){ vec3 q=floor(P*3.0); float h=h01(ivec3(q),gS); return vec3(float(base), 0.25+h*0.75, 0.0); }
  if (pat==5){ float a=atan(Z,X)+(mod(floor((Y+1.0)*3.0),2.0)>0.5?t*0.6:-t*0.6); float rg=fract((Y+1.0)*3.0); bool tooth=sin(a*14.0)>0.0; return vec3(float(base),(rg<0.15||rg>0.85)?0.15:tooth?0.75:0.5,0.0); }
  if (pat==6){ if (Z>0.0){ float e=length(vec2(X,Y)); if(e<0.18) return vec3(float(R_tar),0.1,1.0); if(e<0.42) return vec3(float(vein>=0?vein:R_red),0.5+0.4*vn2(vec2(atan(Y,X)*6.0,e*10.0),gS),1.0);} return vec3(float(base),0.5+fbm3(P*3.0,2,gS)*0.4,0.0); }
  if (pat==7){ float zx=X*1.4-0.5, zy=Y*1.4; float cx=zx, cy=zy; int k=0; for(int j=0;j<18;j++){ float nx=zx*zx-zy*zy+cx*0.9-0.2, ny=2.0*zx*zy+cy*0.9; zx=nx; zy=ny; k=j; if(zx*zx+zy*zy>4.0) break; }
    return k>=17?vec3(float(base),0.5+fbm3(P*6.0,2,gS)*0.4,0.0):vec3(float(sea),0.2+float(k)/18.0*0.7,0.0); }
  if (pat==8){ float a=atan(Z,X)*10.0, b=(Y+1.0)*14.0; float h=h01(ivec3(int(floor(a*2.0)),int(floor(b)),2),gS); bool g=fract(b)<0.6&&h>0.35; return g?vec3(float(vein>=0?vein:R_gold),0.65+h*0.3,em?1.0:0.0):vec3(float(base),0.35,0.0); }
  if (pat==9){ float n=fbm3(P*3.0,4,gS), ridge=1.0-abs(fbm3(P*5.0+vec3(t*0.05,0.0,0.0),3,gS+9u)*2.0-1.0); if(ridge>0.9) return vec3(float(R_red),0.65,0.0); return vec3(float(base),n,0.0); }
  float h = fbm3(P*f + vec3(float(gS%31u),0.0,0.0), oct, gS);
  if (bands > 0.0) { float w = fbm3(P*1.6, 3, gS+5u); float bv = 0.5+0.5*sin(Y*bands*3.14159 + w*4.0*turb + fbm3(P*6.0,max(oct-3,2),gS+8u)*1.2); h = bv*0.8 + h*0.2;
    if (st >= 0) { vec2 sd = vec2(X-0.35, (Y+0.25)*1.6); float r = length(sd); if (Z > 0.0 && r < 0.2) return vec3(float(st), 0.4+0.5*sin(r*30.0-atan(sd.y,sd.x)*2.0+t), 0.0); } }
  if (b7.z > 0.5) h = 1.0 - abs(h*2.0-1.0);
  if (ic > 0.0 && abs(Y) > 1.0-ic+(h-0.5)*0.25) return vec3(float(R_ice), 0.55+h*0.4, 0.0);
  if (gCra > 0.0) { float rim; float bw = crater(P, rim); if (bw > 0.0) return vec3(float(base), 0.2 + (1.0-bw)*0.35, 0.0); if (rim > 0.5) return vec3(float(base), 0.85, 0.0); }
  if (vein >= 0) { float vv = 1.0-abs(fbm3(P*f*1.6, 3, gS+77u)*2.0-1.0); if (vv > vw) return vec3(float(vein), 0.45+(vv-0.9)*5.0, 1.0); }
  if (b7.y > 0.5 && lam < 0.05 && h > sl) { float hc = h01(ivec3(ivec2(floor(P.xy*90.0)), int(floor(P.z*90.0))), gS^0x11u); if (hc > 0.8 - fbm3(P*5.0,2,gS^3u)*0.25) return vec3(float(R_lights), 0.6+hc*0.4, 1.0); }
  if (cc > 0.0) { float c2 = fbm3(vec3(X*2.6+t*0.03, Y*4.0, Z*2.6), max(oct-1,3), gS+31u); if (c2 > 1.0-cc) return vec3(float(cloud), 0.55+(c2-(1.0-cc))*1.5, 0.0); }
  if (sl > 0.0 && h < sl) return vec3(float(sea), 0.15+h/sl*0.6, se?1.0:0.0);
  float land = sl > 0.0 ? (h-sl)/(1.0-sl) : h;
  if (t2 >= 0 && land > b7.w) return vec3(float(t2), (land-b7.w)/(1.0-b7.w)*0.8+0.2, 0.0);
  return vec3(float(base), em ? land : land*0.9+0.05, em ? 1.0 : 0.0);
}
void main(){
  vec2 p = gl_FragCoord.xy; float d = bayer(p);
  vec3 col = vec3(0.0); float al = 0.0;
  int hit = -1; float hitR = 0.0; vec2 hitC = vec2(0.0);
  // orbits, belts, coronas, halos (behind the bodies)
  for (int i=0;i<128;i++){ if(i>=uNB) break;
    vec4 b0=BT(i,0), b1=BT(i,1), b9=BT(i,9); int kind=int(b0.w+0.5);
    float dist = length(p - b0.xy);
    if (b1.w > 0.5 && b1.z > 5.0 && b1.z < 20000.0) { float od = abs(length(p - b1.xy) - b1.z);
      if (od < 0.55) { float ang = atan(p.y-b1.y, p.x-b1.x); bool dash = b1.w > 1.5 && fract(ang*b1.z/6.0) > 0.5; float hl = BT(i,6).w;
        if (!dash) { col = hl > 0.5 ? rampAt(R_cyan, 3) : rampAt(R_teal, b1.z > 600.0 ? 1 : 2); al = 1.0; } } }
    if ((kind == 3 || kind == 4) && b9.w > 0.5) { // belts and clouds: particles in AU space
      float rr = dist; float w = b9.w; float prof = exp(-pow((rr - b1.z)/w, 2.0)*2.0);
      if (prof > 0.02) { float cs = exp2(ceil(log2(uPixAU*(kind==4?3.0:2.0)))); vec2 rel = (p - b0.xy)*uPixAU; vec2 q = rel/cs;
        if (abs(q.x) < 1e8 && abs(q.y) < 1e8) { vec2 fl = floor(q); ivec3 c = ivec3(ivec2(fl), 5); uint sd = uint(b9.x);
          float h = h01(c, sd); float dens = prof*(kind==4 ? 0.06 : 0.32);
          if (h < dens) { vec2 pp = (fl + 0.2 + 0.6*vec2(h01(c,sd^1u), h01(c,sd^2u)))*cs; if (length(rel-pp)/uPixAU < 0.75) { col = rampC(int(BT(i,2).x+0.5), 0.35+0.5*h01(c,sd^3u), d); al = 1.0; } } } } }
    if (kind == 0 || kind >= 5) { // stellar glow, black-hole disk, pulsar beams, remnant shell
      vec4 b2=BT(i,2); int ramp=int(b2.x+0.5); float R=b0.z; float cor=max(b9.z, R*1.9);
      if (kind == 5) { float r = dist/R; vec2 rel = p - b0.xy; float an = atan(rel.y, rel.x);
        if (r > 1.0 && r < 6.0) { float k = (r-1.0)/5.0; float sw = vn2(vec2(an*3.0 + k*9.0 - uTime*1.4, k*6.0), gS^5u); float v = 0.25 + (1.0-k)*0.6 + sw*0.3;
          if ((1.0-k)*0.9 + sw*0.2 > d*0.8) { col = rampC(R_disk, v, d); al = 1.0; } } }
      else if (dist > R && dist < cor) { float k = 1.0-(dist-R)/(cor-R); float an = atan(p.y-b0.y,p.x-b0.x); float n = vn2(vec2(an*3.0+uTime*0.3, dist/R*1.5-uTime*0.5), 91u);
        float g = k*k*(0.55+n*0.5); if (g > d*0.9) { col = rampC(ramp, 0.35+k*0.55, d); al = 1.0; } }
      if (kind == 6) { float a = uTime*2.0; vec2 dir = vec2(cos(a), sin(a)); vec2 rel = p - b0.xy; float along = dot(rel,dir), across = abs(rel.x*dir.y-rel.y*dir.x);
        float L = max(cor*3.0, 30.0); if (across < 0.8 + abs(along)*0.03 && abs(along) < L && abs(along) > R) { if ((1.0-abs(along)/L) > d*0.7) { col = rampC(R_sBlu, 0.9-abs(along)/L*0.5, d); al = 1.0; } } }
      if (kind == 7 || b9.z > R*12.0) { float nr = b9.z; float rr = dist/nr; if (rr > 0.55 && rr < 1.25) { float an = atan(p.y-b0.y,p.x-b0.x); float n = fbm2(vec2(an*2.0, rr*4.0), 3, 7u);
        float k = 1.0-abs(rr-0.9)/0.35; if (k*0.8+n*0.4-0.35 > d) { col = rampC(n > 0.55 ? int(b2.z+0.5) : int(b2.y+0.5), 0.3+k*0.5, d); al = 1.0; } } }
    }
    // the body discs: topmost wins (later rows draw over earlier ones)
    if (kind != 3 && kind != 4) { float R = b0.z; vec4 b6 = BT(i,6);
      if (dist < R + 0.5) { hit = i; hitR = R; hitC = b0.xy; }
      else if (b6.w > 0.5 && dist > R+1.5 && dist < R+2.6) { float an = atan(p.y-b0.y,p.x-b0.x); if (fract(an*2.0/3.14159 + uTime*0.25) < 0.6) { col = vec3(0.55,1.0,0.9); al = 1.0; } }
      // atmosphere halo
      vec4 b3=BT(i,3); if ((kind==1||kind==2) && b3.x >= 0.0 && R > 3.0) { float aw = max(b6.z, 1.5/R); float k = (dist/R - 1.0)/aw;
        if (k > 0.0 && k < 1.0) { vec2 Ld = normalize(uSun - b0.xy + 1e-4); float side = clamp(0.6 + dot(normalize(p-b0.xy), Ld)*0.8, 0.2, 1.0); float a = (1.0-k)*(1.0-k)*side;
          if (a > d) { col = rampC(int(b3.x+0.5), 0.4+(1.0-k)*0.5, d); al = 1.0; } } }
      // rings (top-down ellipse, back half hidden by the planet)
      if (b3.z >= 0.0 && R > 1.5) { vec4 b9b = b9; float tl = 0.45 + 0.4*b9b.y; vec2 rel = (p - b0.xy)/R; float ca=cos(b9b.y*2.0), sa=sin(b9b.y*2.0); vec2 rr2 = vec2(rel.x*ca+rel.y*sa, (-rel.x*sa+rel.y*ca)/tl);
        float rd = length(rr2); if (rd > b6.x && rd < b6.y && !(dist < R && rr2.y < 0.0)) { float k = (rd-b6.x)/(b6.y-b6.x); float band = vn2(vec2(k*14.0, 1.0), uint(b9b.x)+3u);
          if (band > 0.25) { col = rampC(int(b3.z+0.5), 0.3+band*0.6, d); al = 1.0; if (dist < R && rr2.y > 0.0) { hit = -2; } } } }
    }
  }
  if (hit >= 0) {
    int i = hit; vec4 b0=BT(i,0), b2=BT(i,2), b5=BT(i,5), b7=BT(i,7), b9=BT(i,9); int kind=int(b0.w+0.5);
    vec2 rel = (p - b0.xy)/hitR; float r2 = dot(rel,rel); gS = uint(b9.x);
    if (r2 > 1.0) { col = vec3(0.03,0.027,0.05); al = 1.0; } // outline
    else {
      float nz = sqrt(1.0-r2); vec3 N = vec3(rel, nz);
      if (kind == 5) { col = r2 > 0.86 ? rampAt(R_sWht, 4) : vec3(0.0); al = 1.0; }
      else if (kind == 0 || kind >= 6) { // a star's surface
        float a = uTime*0.05; vec3 Q = vec3(N.x*cos(a)-N.z*sin(a), N.y, N.x*sin(a)+N.z*cos(a));
        int oct = clamp(int(log2(hitR))+1, 2, 6); float g = fbm3(Q*4.0 + vec3(0.0, uTime*0.02, 0.0), oct, gS);
        float cellv = 1.0-abs(fbm3(Q*(10.0 + hitR*0.08) + vec3(uTime*0.03), clamp(oct+1,3,7), gS+7u)*2.0-1.0); float v = (0.22 + g*0.32 + cellv*cellv*0.42)*(0.5+0.5*nz) + 0.12; float spot = fbm3(Q*3.5, 3, gS+40u); if (spot > (b5.x > 0.5 ? 0.64 : 0.73)) v *= spot > (b5.x > 0.5 ? 0.68 : 0.76) ? 0.25 : 0.55;
        col = rampC(int(b2.x+0.5), v, d); al = 1.0;
      } else {
        float sp = b5.w, tl = b9.y; vec3 Pn = N;
        float ct = cos(tl), st = sin(tl); Pn = vec3(Pn.x*ct - Pn.y*st, Pn.x*st + Pn.y*ct, Pn.z);
        float cs = cos(sp), sn = sin(sp); vec3 P = vec3(Pn.x*cs - Pn.z*sn, Pn.y, Pn.x*sn + Pn.z*cs);
        vec2 Ld2 = uSun - b0.xy; vec3 L = normalize(vec3(normalize(Ld2 + 1e-4)*0.92, 0.38));
        float lam = dot(N, L);
        int oct = clamp(int(log2(hitR))+2, 3, 9);
        vec3 s = shadeP(i, P, lam, p, oct);
        float val = s.y;
        if (s.z < 0.5) { float li = clamp(lam*0.82+0.28, 0.0, 1.0); val = clamp(li*0.78 + (s.y-0.5)*0.55 + 0.06, 0.0, 1.0); if (lam < -0.05) val *= 0.5; }
        col = rampC(int(s.x+0.5), val, d); al = 1.0;
        if (b7.x > 0.5) { col = r2 > 0.8 && lam > 0.0 ? rampAt(R_teal, 3) : rampAt(R_navy, 1 + int(lam > 0.2)); }
      }
    }
  }
  if (al < 0.5) { o = vec4(0.0); return; }
  o = vec4(col, 1.0);
}`;
