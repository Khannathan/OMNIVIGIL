// OMNIVIGIL Cosmic Atlas: procedural pixel-art renderer.
// Every portrait is drawn per pixel onto palette ramps with 4x4 Bayer dithering,
// lit from the upper left, with a dark outline around solid bodies (Diorama look).
(function(){
const HX = h => [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const RAMPS = {
  rock:['#16121a','#2e2630','#4a3e44','#6e6066','#9a8c88','#c4b8ae'],
  dust:['#1a1210','#3a2618','#6a4426','#9a6a3a','#c8995a','#ecd09a'],
  sand:['#2a1c12','#5a3e22','#8e6634','#c2944e','#e6c27a','#fae6b4'],
  rust:['#1e0e0c','#46201a','#7a3622','#a8552c','#cc7e44','#ecb070'],
  lava:['#1a0806','#5a1206','#a02a08','#e0620e','#ffa62a','#fff0a0'],
  ocean:['#060a1e','#0b1a40','#123a6a','#1d6a98','#3aa0c0','#8ad8e8'],
  deep:['#04050e','#080e24','#0e1c3e','#18305a','#284c7a','#4a74a0'],
  grass:['#0e180e','#1c3216','#2e5020','#4f7a2a','#7ea83e','#b8d870'],
  jungle:['#06120c','#0c2416','#143e22','#1e5e30','#3a8a3e','#74b850'],
  ice:['#16203a','#2a3a5a','#4a6a90','#8ab0d0','#c8e2f4','#f4fcff'],
  salt:['#3a3640','#6a6670','#9a96a0','#c8c4cc','#e8e6ec','#ffffff'],
  tar:['#020204','#08070c','#121018','#1e1a26','#2e2838','#463c52'],
  diamond:['#2a3448','#4a5a78','#6a7a90','#a8c0d8','#e0f0ff','#ffffff'],
  crystal:['#1a0a2a','#3a1458','#6a2a8a','#a04ac0','#d080e8','#f8c8ff'],
  cyan:['#04141a','#0a2e36','#105a62','#1fb5ad','#7cf4da','#d8fff4'],
  circuit:['#04100a','#08140f','#0e2a1e','#165a3a','#2a8a5a','#6ae0a0'],
  violet:['#0a0614','#1a1030','#2e1e54','#4a3080','#7a54b0','#b490e0'],
  flesh:['#1a0608','#3e0e14','#6e1e26','#a03a3e','#d06a62','#f4a898'],
  gold:['#1a1006','#4a3008','#8a5e10','#c8901c','#f0c040','#fff0a0'],
  teal:['#041010','#0a2626','#124444','#1e6a62','#3a9a88','#7ed0b8'],
  bone:['#1a1814','#3a362e','#6a6456','#a09884','#d0c8b0','#f4f0e0'],
  steam:['#202630','#3a4450','#5a6672','#8a96a0','#b8c4cc','#e8f0f4'],
  sulfur:['#1a1604','#3e3608','#6a5a10','#b0a020','#e0d84a','#fff8a0'],
  toxic:['#0a1004','#1a2a06','#3a5a0a','#6a9a10','#a8d830','#e8ff8a'],
  pink:['#1e0818','#4a1438','#8a2a62','#c8508e','#f08ab8','#ffd0e4'],
  navy:['#04060e','#0a0e1c','#121a30','#1e2a48','#30406a','#4a5c90'],
  metal:['#0e0e12','#1e1e24','#34343c','#50505a','#7a7a86','#b4b4c0'],
  copper:['#140a06','#3a1c0e','#6a3418','#a05a28','#d08a44','#f4c080'],
  green:['#04140a','#0a3018','#14582a','#22903e','#4cc860','#a8f8a0'],
  red:['#120404','#3a0808','#6e1010','#b0201c','#e85030','#ff9a70'],
  blue:['#040818','#0a1840','#14327a','#2a5ac0','#5a90f0','#b0d8ff'],
  magenta:['#14041a','#3a0a44','#6e1478','#b020b0','#f050e0','#ffb0ff'],
  white:['#2a2c38','#5a5e70','#9aa0b4','#d0d4e0','#f0f2f8','#ffffff'],
  // star / emissive ramps
  sYel:['#5a2a06','#b0600e','#f0a028','#ffd060','#fff0b0','#ffffff'],
  sOra:['#4a1606','#9a3608','#e06a14','#ff9a30','#ffd080','#fff4d8'],
  sRed:['#2a0604','#5e0e06','#a02008','#e04a14','#ff8a40','#ffc890'],
  sBlu:['#0a1a5a','#1a3aa0','#3a70e0','#7ab0ff','#c8e4ff','#ffffff'],
  sWht:['#3a4058','#7a84a0','#b8c0d8','#e0e6f4','#f8faff','#ffffff'],
  plasma:['#200a3a','#4a1a8a','#8a30d0','#d060f0','#ffa0ff','#ffffff'],
  ember:['#2a0804','#6a1a08','#c2412f','#ff7a52','#ffb08a','#ffe8d8'],
  lights:['#4a2a08','#a06010','#ffb42e','#ffd880','#fff4c8','#ffffff'],
  aurora:['#04201a','#0a5a40','#1fb58a','#5af0b0','#b0ffd8','#ffffff'],
  disk:['#2a0802','#7a2004','#d05a0a','#ffa030','#ffe0a0','#ffffff'],
  void:['#000000','#020204','#05050a','#0a0a14','#12121e','#1c1c2c'],
};
const RGB = {}; for (const k in RAMPS) RGB[k] = RAMPS[k].map(HX);
const OUT = HX('#08070d');
const BAYER = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(v => (v + .5) / 16);

// ---- noise ----
function hash(x,y,z,s){ let h = (x*374761393 + y*668265263 + z*1274126177 + s*974634177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vn(x,y,z,s){ const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z); let xf=x-xi,yf=y-yi,zf=z-zi;
  xf=xf*xf*(3-2*xf); yf=yf*yf*(3-2*yf); zf=zf*zf*(3-2*zf);
  const a=hash(xi,yi,zi,s),b=hash(xi+1,yi,zi,s),c=hash(xi,yi+1,zi,s),d=hash(xi+1,yi+1,zi,s);
  const e=hash(xi,yi,zi+1,s),f=hash(xi+1,yi,zi+1,s),g=hash(xi,yi+1,zi+1,s),h=hash(xi+1,yi+1,zi+1,s);
  const l1=a+(b-a)*xf, l2=c+(d-c)*xf, l3=e+(f-e)*xf, l4=g+(h-g)*xf;
  const m1=l1+(l2-l1)*yf, m2=l3+(l4-l3)*yf; return m1+(m2-m1)*zf; }
function fbm(x,y,z,s,o){ o=o||4; let v=0,a=.5,t=0; for(let i=0;i<o;i++){ v+=a*vn(x,y,z,s+i*17); t+=a; x*=2.03; y*=2.03; z*=2.03; a*=.5; } return v/t; }
const cl = (v,a,b) => v<a?a:v>b?b:v;
const fr = v => v - Math.floor(v);
function srand(seed){ let s = seed >>> 0 || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 | 0; s ^= s >>> 13; return ((s >>> 0) % 100000) / 100000; }; }
function strSeed(str){ let h = 2166136261; for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---- drawing context ----
function Ctx(N, t, seed){
  this.N=N; this.t=t; this.seed=seed;
  this.px = new Uint8ClampedArray(N*N*4);
  this.solid = new Uint8Array(N*N);
}
Ctx.prototype.put = function(x,y,ramp,v,solid){
  if (x<0||y<0||x>=this.N||y>=this.N) return;
  const R = RGB[ramp] || RGB.rock, n = R.length;
  const f = cl(v,0,1)*(n-1); let i = Math.floor(f); if (f-i > BAYER[(y&3)*4+(x&3)]) i++;
  const c = R[cl(i,0,n-1)], o = (y*this.N+x)*4;
  this.px[o]=c[0]; this.px[o+1]=c[1]; this.px[o+2]=c[2]; this.px[o+3]=255;
  if (solid) this.solid[y*this.N+x]=1;
};
// dithered translucency: draws only where alpha beats the Bayer threshold
Ctx.prototype.al = function(x,y,ramp,v,a){ if (a > BAYER[((y+1)&3)*4+((x+2)&3)]) this.put(x,y,ramp,v,0); };
Ctx.prototype.rgb = function(x,y,c){ if (x<0||y<0||x>=this.N||y>=this.N) return; const o=(y*this.N+x)*4; this.px[o]=c[0];this.px[o+1]=c[1];this.px[o+2]=c[2];this.px[o+3]=255; };
Ctx.prototype.outline = function(){
  const N=this.N, s=this.solid, p=this.px, mark=[];
  for (let y=0;y<N;y++) for (let x=0;x<N;x++){ const i=y*N+x; if (s[i]) continue;
    if ((x>0&&s[i-1])||(x<N-1&&s[i+1])||(y>0&&s[i-N])||(y<N-1&&s[i+N])) mark.push(i); }
  for (const i of mark){ p[i*4]=OUT[0]; p[i*4+1]=OUT[1]; p[i*4+2]=OUT[2]; p[i*4+3]=255; }
};
// loop over a box in normalized coords
function box(c, cx, cy, rx, ry, fn){
  const N=c.N, x0=Math.max(0,Math.floor((cx-rx)*N)), x1=Math.min(N-1,Math.ceil((cx+rx)*N)), y0=Math.max(0,Math.floor((cy-ry)*N)), y1=Math.min(N-1,Math.ceil((cy+ry)*N));
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++) fn(x,y,(x+.5)/N,(y+.5)/N);
}
function full(c, fn){ const N=c.N; for (let y=0;y<N;y++) for (let x=0;x<N;x++) fn(x,y,(x+.5)/N,(y+.5)/N); }

const L = (()=>{ const v=[-.62,-.52,.58], m=Math.hypot(...v); return v.map(a=>a/m); })();

// ---- background ----
function background(c, kind){
  if (kind==='none') return;
  const N=c.N, rnd=srand(c.seed*7+3);
  const base = kind==='void' ? RGB.void[1] : HX('#0b0d17');
  full(c,(x,y,u,v)=>{
    let col = base;
    if (kind==='dense' || kind==='nebula'){ const n=fbm(u*3,v*3,1.3,c.seed%997,3); if (n>.55) { c.al(x,y,kind==='nebula'?'violet':'navy',(n-.55)*2.2,(n-.55)*2.4); return; } }
    c.rgb(x,y,col);
  });
  const stars = kind==='void' ? 3 : kind==='dense' ? N*0.9 : N*0.35;
  for (let i=0;i<stars;i++){ const x=Math.floor(rnd()*N), y=Math.floor(rnd()*N), b=rnd();
    c.rgb(x,y, b>.93?[255,244,220]: b>.7?[150,160,190]:[70,76,104]); }
}

// ---- spheres (planets, moons, stars) ----
function rot(P, nx, ny, nz, t){
  const a = (P.spin==null? .25 : P.spin)*t + (P.ph||0), ca=Math.cos(a), sa=Math.sin(a);
  let X = nx*ca - nz*sa, Z = nx*sa + nz*ca, Y = ny;
  const tl = P.tilt||.25, ct=Math.cos(tl), st=Math.sin(tl);
  const X2 = X*ct - Y*st, Y2 = X*st + Y*ct; return [X2, Y2, Z];
}
function shapeR(P, ang){
  if (P.lump) return 1 - P.lump*vn(Math.cos(ang)*2.2+5, Math.sin(ang)*2.2+5, 3, P.sd||1);
  return 1;
}
function sphere(c, P, shade){
  const cx=P.x==null?.5:P.x, cy=P.y==null?.5:P.y, r=P.r||.34, ob=P.ob||1;
  box(c,cx,cy,r*1.02,r*1.02/ob,(x,y,u,v)=>{
    let dx=(u-cx)/r, dy=(v-cy)/r*ob, d2=dx*dx+dy*dy;
    if (P.lump){ const k=shapeR(P,Math.atan2(dy,dx)); d2/=k*k; dx/=k; dy/=k; }
    if (d2>1) return;
    const nz=Math.sqrt(1-d2), lam=dx*L[0]+dy*L[1]+nz*L[2];
    const s = shade(dx,dy,nz,lam,x,y);
    if (!s) return;
    let val = s.v;
    if (!s.e){ const li = cl(lam*.82+.28,0,1); val = cl(li*.78 + (s.v-.5)*.55 + .06, 0, 1); if (lam<-.05 && P.night!==false) val*=.55; }
    c.put(x,y,s.r,val,!P.noOutline);
  });
}
function atmo(c,P,ramp,w,str){
  const cx=P.x==null?.5:P.x, cy=P.y==null?.5:P.y, r=P.r||.34; w=w||.14; str=str||.8;
  box(c,cx,cy,r*(1+w),r*(1+w),(x,y,u,v)=>{ const d=Math.hypot(u-cx,v-cy)/r; if (d<1||d>1+w) return;
    const a=(1-(d-1)/w); const sideLit = cl(.6-((u-cx)*L[0]+(v-cy)*L[1])/r*-.8,0.25,1);
    c.al(x,y,ramp,.4+a*.5,a*a*str*sideLit); });
}
function ring(c,P,front){
  const cx=P.x==null?.5:P.x, cy=P.y==null?.5:P.y, r=P.r||.34;
  const r0=(P.ri||1.35)*r, r1=(P.ro||2.1)*r, tilt=P.rt||.28, rr=P.rg||'bone', ang=P.ra||-.25;
  const ca=Math.cos(ang), sa=Math.sin(ang);
  box(c,cx,cy,r1,r1,(x,y,u,v)=>{
    const dx=u-cx, dy=v-cy, X=dx*ca+dy*sa, Y=(-dx*sa+dy*ca)/tilt, d=Math.hypot(X,Y);
    if (d<r0||d>r1) return; const isFront = Y>0; if (isFront!==front) return;
    if (!front){ const pd=Math.hypot(dx,dy*(P.ob||1)); if (pd<r) return; }
    const k=(d-r0)/(r1-r0), band=vn(k*14,1,1,(c.seed%50)+3);
    if (band<.25) return;
    // planet shadow on the back of the ring
    let sv=.3+band*.6; if (!front && X>0 && Math.abs(Y*tilt) < r*.9) sv*=.5;
    c.put(x,y,rr,sv,1);
  });
}

// planet surface shader
function planet(c, P){
  const t=c.t, sd=(P.sd||c.seed)%9973, f=P.f||2.2, sl=P.sl==null?-1:P.sl;
  const craters=[]; if (P.cra){ const rnd=srand(sd*13+1); for(let i=0;i<P.cra;i++){ const a=rnd()*6.283,b=Math.acos(rnd()*2-1); craters.push([Math.sin(b)*Math.cos(a),Math.cos(b),Math.sin(b)*Math.sin(a),.08+rnd()*.22]); } }
  if (P.rg) ring(c,P,false);
  sphere(c,P,(nx,ny,nz,lam,px,py)=>{
    const [X,Y,Z]=rot(P,nx,ny,nz,t);
    const pat=P.p;
    if (pat==='check'){ const k=(Math.floor((Math.atan2(Z,X)+3.15)*2.5)+Math.floor((Y+1)*4))&1; return {r:k?'magenta':'tar',v:k?.75:.4,e:0}; }
    if (pat==='grid'){ const a=Math.atan2(Z,X), gx=fr(a*3/Math.PI), gy=fr((Y+1)*3); const k=((gx<.5)^(gy<.5)); return {r:k?'bone':'tar',v:k?.75:.35}; }
    if (pat==='circuit'){ const a=Math.atan2(Z,X)*8, b=Y*8; const ln = Math.min(Math.abs(fr(a)-.5),Math.abs(fr(b)-.5)); const h=hash(Math.floor(a),Math.floor(b),1,sd); if (ln<.06 && h>.45) return {r:P.v||'cyan',v:.6+.4*Math.sin(t*3+h*9)*.5+.3,e:1}; return {r:P.t||'circuit',v:.25+fbm(X*4,Y*4,Z*4,sd,2)*.4}; }
    if (pat==='facet'){ const q=[X*3,Y*3,Z*3].map(Math.floor); const h=hash(q[0],q[1],q[2],sd); return {r:P.t||'crystal',v:.25+h*.75}; }
    if (pat==='gear'){ const a=Math.atan2(Z,X)+(Math.floor((Y+1)*3)%2?t*.6:-t*.6), ring=fr((Y+1)*3); const tooth=Math.sin(a*14)>0; return {r:P.t||'copper',v:(ring<.15||ring>.85)?.15:tooth?.75:.5}; }
    if (pat==='eye'){ const d=Math.hypot(X-.0,Y)*1; const fz=Z; if (fz>0){ const e=Math.hypot(X,Y); if (e<.18) return {r:'tar',v:.1,e:1}; if (e<.42) return {r:P.v||'red',v:.5+.4*vn(Math.atan2(Y,X)*6,e*10,1,sd),e:1}; } return {r:P.t||'bone',v:.5+fbm(X*3,Y*3,Z*3,sd,2)*.4}; }
    if (pat==='fract'){ let zx=X*1.4-.5, zy=Y*1.4, i=0; const cx2=zx, cy2=zy; for(;i<18;i++){ const nx2=zx*zx-zy*zy+cx2*.9-.2, ny2=2*zx*zy+cy2*.9; zx=nx2; zy=ny2; if (zx*zx+zy*zy>4) break; } return i>=18?{r:P.t||'grass',v:.5+fbm(X*6,Y*6,Z*6,sd,2)*.4}:{r:P.s||'ocean',v:.2+(i/18)*.7}; }
    if (pat==='text'){ const a=Math.atan2(Z,X)*10, b=(Y+1)*14; const h=hash(Math.floor(a*2),Math.floor(b),2,sd); const inGlyph=fr(b)<.6&&h>.35; return inGlyph?{r:P.v||'gold',v:.65+h*.3,e:P.e?1:0}:{r:P.t||'bone',v:.35}; }
    if (pat==='flesh'){ const n=fbm(X*3,Y*3,Z*3,sd,4), ridge=1-Math.abs(fbm(X*5+t*.05,Y*5,Z*5,sd+9,3)*2-1); if (ridge>.9) return {r:'red',v:.65,e:0}; return {r:P.t||'flesh',v:n}; }
    let h = fbm(X*f+sd%31, Y*f, Z*f, sd, P.oct||4);
    if (P.b){ const w=fbm(X*1.6,Y*1.6,Z*1.6,sd+5,3); const bv=.5+.5*Math.sin(Y*P.b*Math.PI+w*4*(P.turb||1)); h=bv*.8+h*.2;
      if (P.st){ const sx=X-.35, sy=Y+.25; const sdd=Math.hypot(sx,sy*1.6); if (Z>0 && sdd<.2) { return {r:P.st,v:.4+.5*Math.sin(sdd*30-Math.atan2(sy,sx)*2)}; } } }
    if (P.ridge) h = 1-Math.abs(h*2-1);
    // ice caps
    if (P.ic && Math.abs(Y) > 1-P.ic+(h-.5)*.25) return {r:'ice',v:.55+h*.4};
    // craters
    for (const k of craters){ const d=Math.hypot(X-k[0],Y-k[1],Z-k[2]); if (d<k[3]){ const q=d/k[3]; return {r:P.t||'rock',v: q>.8? .85 : .2+q*.35}; } }
    // glowing veins (lava cracks, energy)
    if (P.v){ const vv=1-Math.abs(fbm(X*f*1.6,Y*f*1.6,Z*f*1.6,sd+77,3)*2-1); if (vv>(P.vw||.9)) return {r:P.v,v:.45+(vv-.9)*5,e:1}; }
    // city lights on the night side
    if (P.lt && lam<.05 && h>sl && hash(px>>1,py>>1,3,sd)>.78) return {r:'lights',v:.6+hash(px,py,1,1)*.4,e:1};
    // clouds
    if (P.c){ const cc=fbm(X*2.6+t*.03,Y*4,Z*2.6,sd+31,4); if (cc>1-P.c) return {r:P.cr||'white',v:.55+(cc-(1-P.c))*1.5}; }
    if (sl>0 && h<sl) return {r:P.s||'ocean',v:.15+h/sl*.6, e:P.se?1:0};
    const land = sl>0 ? (h-sl)/(1-sl) : h;
    if (P.t2 && land > (P.t2l||.55)) return {r:P.t2,v:(land-(P.t2l||.55))/(1-(P.t2l||.55))*.8+.2};
    return {r:P.t||'rock', v: P.e? land : land*.9+.05, e:P.e?1:0};
  });
  if (P.a) atmo(c,P,P.a,P.aw,P.as);
  if (P.rg) ring(c,P,true);
  if (P.m){ for (let i=0;i<P.m;i++){ const a=c.t*.4*(1+i*.3)+i*2.3, d=(P.r||.34)*(1.5+i*.35);
    const mx=(P.x==null?.5:P.x)+Math.cos(a)*d, my=(P.y==null?.5:P.y)+Math.sin(a)*d*.35;
    if (Math.sin(a)<0) continue; planet(c,{x:mx,y:my,r:(P.r||.34)*(.14+.05*(i%2)),t:P.mt||'rock',cra:2,sd:(P.sd||7)+i*11,spin:.1}); } }
}

function star(c,P){
  const cx=P.x==null?.5:P.x, cy=P.y==null?.5:P.y, r=P.r||.18, col=P.c||'sYel', t=c.t;
  const cor=P.cor||1.9;
  box(c,cx,cy,r*cor,r*cor,(x,y,u,v)=>{ const d=Math.hypot(u-cx,v-cy)/r; if (d<1||d>cor) return;
    const a=Math.atan2(v-cy,u-cx); const spike = P.fl ? Math.pow(Math.max(0,Math.sin(a*P.fl+t)),6)*.6 : 0;
    const k=1-(d-1)/(cor-1); const n=vn(a*3+t*.3,d*3-t*.5,1,c.seed%91);
    c.al(x,y,col,.35+k*.5,k*k*(.55+n*.5)+spike*k); });
  sphere(c,{...P,x:cx,y:cy,r,noOutline:1,night:false},(nx,ny,nz,lam)=>{
    const [X,Y,Z]=rot({spin:.08},nx,ny,nz,t); const g=fbm(X*6,Y*6,Z*6,(c.seed%97)+2,3);
    let v=.62+g*.35+nz*.15; if (P.sp && fbm(X*2.5,Y*2.5,Z*2.5,(c.seed%97)+40,2)>.62) v=.2;
    return {r:col,v:cl(v,0,1),e:1};
  });
}

function blackhole(c,P){
  const cx=P.x==null?.5:P.x, cy=P.y==null?.5:P.y, r=P.r||.1, t=c.t, dc=P.dc||'disk';
  const R0=r*1.5, R1=r*(P.dw||3.6), tilt=P.tilt||.22;
  const diskAt=(u,v,front)=>{ const dx=u-cx, dy=v-cy, Y=dy/tilt, d=Math.hypot(dx,Y); if (d<R0||d>R1) return null; if ((dy>0)!==front) return null;
    const a=Math.atan2(Y,dx), k=(d-R0)/(R1-R0); const sw=vn(a*3+k*9-t*1.4,k*6,1,c.seed%61);
    const dop = .5 - dx/R1*.45; return .25+ (1-k)*.55*dop + sw*.3; };
  // back disk
  if (!P.nodisk) box(c,cx,cy,R1,R1,(x,y,u,v)=>{ const s=diskAt(u,v,false); if (s!=null) c.put(x,y,dc,s,0); });
  // lensed halo
  if (!P.nodisk) box(c,cx,cy,r*2.2,r*2.2,(x,y,u,v)=>{ const d=Math.hypot(u-cx,v-cy)/r; if (d<1.05||d>1.9) return; const a=Math.atan2(v-cy,u-cx);
    const k=1-Math.abs(d-1.35)/.55; const n=vn(a*4-t,d*4,2,c.seed%33); c.al(x,y,dc,.45+k*.4+n*.15,k*(a<0?.95:.55)); });
  // photon ring and horizon
  box(c,cx,cy,r*1.1,r*1.1,(x,y,u,v)=>{ const d=Math.hypot(u-cx,v-cy)/r; if (d>1.08) return; if (d>.96) c.put(x,y,P.pr||'sWht',.85,0); else { const o=(y*c.N+x)*4; c.px[o]=0;c.px[o+1]=0;c.px[o+2]=0;c.px[o+3]=255; } });
  if (!P.nodisk) box(c,cx,cy,R1,R1,(x,y,u,v)=>{ const s=diskAt(u,v,true); if (s!=null) c.put(x,y,dc,s+.08,0); });
  if (P.jet){ box(c,cx,cy,r*.6,.5,(x,y,u,v)=>{ const dx=Math.abs(u-cx), dy=Math.abs(v-cy); if (dy<r) return; const w=r*.18+dy*.08; if (dx>w) return;
    c.al(x,y,P.jc||'sBlu',.9-dx/w*.4,(1-dx/w)*(1-dy*1.6)+.2*vn(dy*30-t*6,1,1,3)); }); }
}

function nebula(c,P){
  const t=c.t, col=P.c||'violet', col2=P.c2, sd=(P.sd||c.seed)%997, f=P.f||2.6, th=P.th==null?.42:P.th;
  full(c,(x,y,u,v)=>{
    let n=fbm(u*f+t*.02,v*f,sd*.13,sd,5); n=(n-.5)*1.9+.5;
    if (P.sh==='ring'){ const d=Math.hypot(u-.5,v-.5); n = n*.6 + (1-Math.abs(d-.28)/.12)*.6 - .05; }
    if (P.sh==='pillar'){ const col_=Math.max(1-Math.abs(u-.38)/.09*(1-(1-v)*.4), 1-Math.abs(u-.66)/.07*(1-(1-v)*.3)*(v>.35?1:3)); n = n*.55 + col_*.5*(v>.15?1:0); }
    if (P.sh==='blob'){ const d=Math.hypot(u-.5,v-.5); n = n*.5 + (1-d/.3)*.7; }
    if (P.sh==='shell'){ const d=Math.hypot(u-.5,v-.5)+(n-.5)*.12; n = (1-Math.abs(d-.3)/.06)*.9 + n*.25; }
    if (P.sh==='disk'){ const d=Math.hypot((u-.5),(v-.5)/.35); n = n*.5 + (1-d/.42)*.6; }
    if (n<th) return;
    const k=(n-th)/(1-th);
    if (P.dark){ c.al(x,y,'tar',.3+k,k*2.5); return; }
    c.al(x,y, (col2 && fbm(u*5,v*5,2,sd+4,2)<.48 && k>.25)? col2: col, .2+k*1.1, k*3);
  });
  if (P.stars){ const rnd=srand(sd+5); for(let i=0;i<P.stars;i++){ const x=Math.floor(rnd()*c.N), y=Math.floor(rnd()*c.N); c.put(x,y,'sWht',.9,0); if (c.N>=96){ c.put(x+1,y,'sWht',.6,0); c.put(x-1,y,'sWht',.6,0);} } }
}

function galaxy(c,P){
  const t=c.t, col=P.c||'sBlu', core=P.core||'sYel', sd=(P.sd||c.seed)%997, tilt=P.tilt||.55, sz=P.sz||.42, kind=P.g||'spiral';
  const one=(cx,cy,sz,rotA,tl)=>{
    full(c,(x,y,u,v)=>{ const dx=u-cx, dy=(v-cy)/tl; const ca=Math.cos(rotA), sa=Math.sin(rotA); const X=dx*ca-dy*sa, Y=dx*sa+dy*ca;
      const d=Math.hypot(X,Y)/sz; if (d>1.1) return; const a=Math.atan2(Y,X);
      let s;
      if (kind==='ellip') s = Math.pow(1-d,1.6);
      else if (kind==='ring') s = (1-Math.abs(d-.75)/.15)*.9 + (d<.15?(1-d/.15):0);
      else { const arms = P.arms||2; const sp = Math.cos(arms*(a - Math.log(d+.05)*2.6 - t*.15)); s = Math.max(0,sp)*(1-d)*.9 + Math.pow(Math.max(0,1-d/.28),2);
        if (kind==='bar' && Math.abs(Y)<.05*sz/sz && Math.abs(X)/sz<.38) s=Math.max(s,.8); }
      s += (fbm(u*8,v*8,1,sd,3)-.5)*.35;
      if (s<.12) return;
      const isCore = d<.2;
      c.al(x,y,isCore?core:col,.35+s*.8,s*2.4);
    });
  };
  if (kind==='merge'){ one(.38,.45,.3,.4+t*.05,.5); one(.64,.56,.26,-.8-t*.05,.7); }
  else one(.5,.5,sz,P.rot||.3,tilt);
}

function belt(c,P){
  const rnd=srand(((P.sd||c.seed)%997)+9), n=P.n||40, t=c.t;
  for (let i=0;i<n;i++){
    let a=rnd()*6.283, rr=P.arc? .25+rnd()*.2 : rnd(), x, y;
    if (P.mode==='cloud'){ x=.5+(rnd()-.5)*.9; y=.5+(rnd()-.5)*.9; }
    else if (P.mode==='trojan'){ const g=i%2? -1.05: 1.05; a = -1.57+g + (rnd()-.5)*.6 + t*.05; rr=.36+(rnd()-.5)*.08; x=.5+Math.cos(a)*rr; y=.5+Math.sin(a)*rr*.5; }
    else { a+=t*.05*(1-rr*.4); const R=P.arc? rr : .2+rr*.25; x=.5+Math.cos(a)*R; y=.5+Math.sin(a)*R*(P.flat||.35); }
    const r=(P.min||.012)+rnd()*(P.max||.03);
    planet(c,{x,y,r,t:P.t||'rock',lump:.35,cra:1,sd:i*7+3,spin:.2,f:3});
  }
}

function comet(c,P){
  const t=c.t, cx=P.x||.62, cy=P.y||.4, r=P.r||.05, ang=P.ang==null?2.5:P.ang, len=P.len||.55, col=P.c||'ice';
  const dxA=Math.cos(ang), dyA=Math.sin(ang);
  full(c,(x,y,u,v)=>{ const dx=u-cx, dy=v-cy; const along=dx*dxA+dy*dyA, perp=Math.abs(-dx*dyA+dy*dxA);
    if (along<0||along>len) return; const w=r*.9+along*.35; if (perp>w) return; const k=(1-along/len)*(1-perp/w);
    c.al(x,y,col,.4+k*.6,k*1.3*(.6+.4*vn(along*20-t*3,perp*20,1,4))); });
  if (P.tail2) full(c,(x,y,u,v)=>{ const a2=ang+.35, dx=u-cx, dy=v-cy; const along=dx*Math.cos(a2)+dy*Math.sin(a2), perp=Math.abs(-dx*Math.sin(a2)+dy*Math.cos(a2)); if (along<0||along>len*.8||perp>.012) return; c.al(x,y,'sBlu',.8,(1-along/len)); });
  planet(c,{x:cx,y:cy,r,t:P.t||'ice',lump:.3,cra:1,sd:5,a:col,aw:.6,as:.9});
}

// ---- effects ----
function burst(c,P){
  const t=c.t, cx=P.x==null?.5:P.x, cy=P.y==null?.5:P.y, col=P.c||'sYel', rays=P.rays||12, sz=P.sz||.48;
  full(c,(x,y,u,v)=>{ const dx=u-cx, dy=v-cy, d=Math.hypot(dx,dy)/sz, a=Math.atan2(dy,dx); if (d>1) return;
    const ray=Math.pow(Math.max(0,Math.cos(a*rays/2+vn(a*3,1,1,c.seed%9)*3)),8)*(1-d);
    const coreV=Math.pow(Math.max(0,1-d/.25),2);
    const sh = P.shell ? Math.max(0,1-Math.abs(d-(.55+.1*Math.sin(t)))/.08)*(.5+fbm(u*6,v*6,t*.1,3,3)) : 0;
    const k=Math.max(ray*1.2,coreV,sh); if (k<.05) return; c.al(x,y,col,.35+k*.65,k*1.6); });
}
function beam(c,P){
  const t=c.t, ang=P.ang==null?-.6:P.ang, w=P.w||.05, col=P.c||'sWht', cx=P.x==null?.5:P.x, cy=P.y==null?.5:P.y;
  const dx_=Math.cos(ang), dy_=Math.sin(ang);
  full(c,(x,y,u,v)=>{ const dx=u-cx, dy=v-cy, along=dx*dx_+dy*dy_, perp=Math.abs(-dx*dy_+dy*dx_); if (P.half && along<0) return; const ww=w*(1+Math.abs(along)*(P.spread||.4)); if (perp>ww*1.8) return;
    const k=perp<ww? 1-perp/ww*.6 : (1-(perp-ww)/(ww*.8))*.4; c.al(x,y,col,.4+k*.6,k*(.8+.3*vn(along*24-t*8,1,1,2))); });
}
function waves(c,P){
  const t=c.t, cx=P.x==null?.5:P.x, cy=P.y==null?.5:P.y, col=P.c||'cyan', sp=P.sp||.09, ob=P.ob||1, arc=P.arc;
  full(c,(x,y,u,v)=>{ const dx=u-cx, dy=(v-cy)*ob, d=Math.hypot(dx,dy); if (d>.5) return; if (arc!=null){ const a=Math.atan2(dy,dx); if (Math.abs(((a-arc+Math.PI*3)%(Math.PI*2))-Math.PI)>.55) return; }
    const ph=fr((d - t*.05)/sp); const k=Math.max(0,1-Math.abs(ph-.5)/.16)*(1-d*1.6); if (k<.05) return; c.al(x,y,col,.5+k*.5,k*2.6); });
}
function vortex(c,P){
  const t=c.t, cx=P.x==null?.5:P.x, cy=P.y==null?.5:P.y, col=P.c||'steam', col2=P.c2, sz=P.sz||.45, ob=P.ob||1;
  full(c,(x,y,u,v)=>{ const dx=u-cx, dy=(v-cy)*ob, d=Math.hypot(dx,dy)/sz; if (d>1) return; const a=Math.atan2(dy,dx);
    const s=fbm(Math.cos(a+d*(P.tw||5)-t*.4)*2+3, Math.sin(a+d*(P.tw||5)-t*.4)*2+3, d*3, c.seed%77, 4);
    const k=s*(1-d)*1.6 - (P.hole && d<.12 ? 2:0); if (k<.25) return; c.al(x,y,(col2&&s>.6)?col2:col,.2+k*.8,k*1.4); });
}
function field(c,P){
  const t=c.t, cx=P.x==null?.5:P.x, cy=P.y==null?.5:P.y, col=P.c||'cyan', n=P.n||5, sz=P.sz||.42;
  full(c,(x,y,u,v)=>{ const X=(u-cx)/sz, Y=(v-cy)/sz; const r=Math.hypot(X,Y); if (r<.05||r>1.2) return; const s2=(X*X)/(r*r); const L_=r/(s2+1e-3);
    const ph=fr(L_*n*.25 - t*.1); const k=Math.max(0,1-Math.abs(ph-.5)/.14)*(1-r/1.3); if (k<.08) return; c.al(x,y,col,.5+k*.5,k*2.6); });
}
function streaks(c,P){
  const t=c.t, rnd=srand((P.sd||c.seed)%97+3), n=P.n||18, ang=P.ang==null?.7:P.ang, col=P.c||'sWht', len=P.len||.25;
  const dx=Math.cos(ang), dy=Math.sin(ang);
  for (let i=0;i<n;i++){ const ox=rnd()*1.4-.2, oy=rnd()*1.4-.2, sp=.3+rnd()*.7, ph=fr(rnd()+t*.15*sp);
    const sx=ox+dx*(ph-.5)*1.2, sy=oy+dy*(ph-.5)*1.2;
    for (let s=0;s<len*c.N*sp;s++){ const u=sx-dx*s/c.N, v=sy-dy*s/c.N; const k=1-s/(len*c.N*sp); c.al(Math.floor(u*c.N),Math.floor(v*c.N),col,.4+k*.6,k*1.2); } }
}
function rift(c,P){
  const t=c.t, col=P.c||'magenta', sd=(P.sd||c.seed)%97, ang=P.ang||1.2, w=P.w||.035;
  const dx=Math.cos(ang), dy=Math.sin(ang);
  full(c,(x,y,u,v)=>{ const X=u-.5, Y=v-.5, along=X*dx+Y*dy, perp=-X*dy+Y*dx; if (Math.abs(along)>.42) return;
    const jag=(vn(along*14,1,1,sd)-.5)*.12 + (vn(along*40,2,1,sd)-.5)*.03; const p=Math.abs(perp-jag); const ww=w*(1-Math.abs(along)/.45);
    if (p<ww*.45) { c.put(x,y,P.inner||'sWht',.85+.15*vn(along*30,t,1,2),0); return; }
    if (p<ww*2.6){ const k=1-(p-ww*.45)/(ww*2.15); c.al(x,y,col,.3+k*.7,k*1.2); } });
}
function bubble(c,P){
  const t=c.t, cx=P.x==null?.5:P.x, cy=P.y==null?.5:P.y, r=(P.r||.3)*(1+(P.grow?Math.sin(t*.4)*.05:0)), col=P.c||'cyan', inside=P.in;
  full(c,(x,y,u,v)=>{ const d=Math.hypot(u-cx,v-cy)/r; if (d>1.12) return;
    if (d<.94 && inside){ const n=fbm(u*5,v*5,t*.1,c.seed%31,3); if (inside==='void'){ const o=(y*c.N+x)*4; const g=n>.6?14:4; c.px[o]=g;c.px[o+1]=g;c.px[o+2]=g+6;c.px[o+3]=255; } else c.al(x,y,inside,.2+n*.6,.6+n*.4); return; }
    const k=1-Math.abs(d-1)/.12; if (k<0) return; c.al(x,y,col,.5+k*.5,k*1.3); });
}
function lens(c,P){
  const cx=P.x==null?.5:P.x, cy=P.y==null?.5:P.y, r=P.r||.24, col=P.c||'sBlu', t=c.t;
  full(c,(x,y,u,v)=>{ const d=Math.hypot(u-cx,v-cy)/r; const a=Math.atan2(v-cy,u-cx); const k=1-Math.abs(d-1)/(.08+.06*vn(a*3,1,1,4)); if (k<0) return; c.al(x,y,col,.5+k*.5,k*(P.full?1.2:.4+.9*Math.max(0,Math.sin(a*2+t*.2)))); });
}
function stringL(c,P){
  const t=c.t, col=P.c||'sWht', ang=P.ang==null?-.35:P.ang; const dx=Math.cos(ang), dy=Math.sin(ang);
  full(c,(x,y,u,v)=>{ const X=u-.5, Y=v-.5, perp=-X*dy+Y*dx, along=X*dx+Y*dy; const wob=Math.sin(along*18-t*2)*.008*(P.wob||1);
    const p=Math.abs(perp-wob); if (p<.006) { c.put(x,y,col,1,0); return; } if (p<.05) c.al(x,y,P.c2||'sBlu',.6,(1-p/.05)*.5); });
}
function glitch(c,P){
  const N=c.N, rnd=srand((Math.floor(c.t*3)*31+c.seed)>>>0), p=c.px, rows=P.n||6;
  for (let i=0;i<rows;i++){ const y0=Math.floor(rnd()*N), h=1+Math.floor(rnd()*N*.08), sh=Math.floor((rnd()-.5)*N*.25);
    for (let y=y0;y<Math.min(N,y0+h);y++){ const row=p.slice(y*N*4,(y+1)*N*4); for(let x=0;x<N;x++){ const sx=((x-sh)%N+N)%N; for(let k=0;k<4;k++) p[(y*N+x)*4+k]=row[sx*4+k]; } } }
  for (let i=0;i<(P.blocks||3);i++){ const bx=Math.floor(rnd()*N*.8), by=Math.floor(rnd()*N*.8), bw=Math.floor(N*(.05+rnd()*.12)), bh=Math.floor(N*(.03+rnd()*.08));
    for (let y=by;y<by+bh;y++) for (let x=bx;x<bx+bw;x++){ const k=((x>>1)+(y>>1))&1; c.rgb(x,y,k?[255,0,220]:[0,0,0]); } }
  if (P.rgb){ for (let y=0;y<N;y++) for (let x=N-1;x>1;x--){ const o=(y*N+x)*4, o2=(y*N+x-2)*4; p[o]=p[o2]; } }
}
function clock(c,P){
  const t=c.t, cx=.5, cy=.5, r=P.r||.34, col=P.c||'gold';
  full(c,(x,y,u,v)=>{ const dx=u-cx, dy=v-cy, d=Math.hypot(dx,dy)/r, a=Math.atan2(dy,dx);
    if (Math.abs(d-1)<.06) { c.put(x,y,col,.8,1); return; }
    if (d<1 && d>.82 && Math.abs(Math.sin(a*6))<.12) { c.put(x,y,col,.95,0); return; }
    const hand=(ang,len,w)=>{ const hx=Math.cos(ang), hy=Math.sin(ang); const al=dx*hx+dy*hy, pp=Math.abs(-dx*hy+dy*hx); return al>0 && al<len*r && pp<w; };
    const sp=P.rev?-1:1;
    if (hand(sp*t*.8-1.57,.85,.014)||hand(sp*t*.08+.6,.6,.022)) { c.put(x,y,'sWht',.9,0); return; }
    if (d<1){ const n=fbm(u*4,v*4,t*.1,7,3); c.al(x,y,P.c2||'navy',.3+n*.5,.5); } });
}
function loopL(c,P){
  const t=c.t, col=P.c||'cyan';
  full(c,(x,y,u,v)=>{ const X=(u-.5)*2.4, Y=(v-.5)*2.4; // lemniscate band
    const a=Math.atan2(Y,X), r=Math.hypot(X,Y), target=Math.sqrt(Math.max(0,Math.cos(2*a)))*1.0; const d=Math.abs(r-target);
    if (d<.09 && Math.cos(2*a)>0){ const k=1-d/.09; const pulse=.5+.5*Math.sin(a*6-t*3); c.put(x,y,col,.35+k*.45+pulse*.2,1); } });
}
function eyeL(c,P){
  const t=c.t, col=P.c||'sRed', r=P.r||.36, blink=P.blink? Math.max(.08,Math.abs(Math.sin(t*.5))) : 1;
  full(c,(x,y,u,v)=>{ const dx=(u-.5)/r, dy=(v-.5)/(r*.55*blink); const lid=dx*dx+dy*dy; if (lid>1) { const g=1-(Math.sqrt(lid)-1)/.4; if (g>0) c.al(x,y,col,.4,g*.5); return; }
    const ix=dx*1, iy=(v-.5)/r; const ir=Math.hypot(ix-Math.sin(t*.3)*.2,iy)/.55;
    if (ir<.35) { c.put(x,y,'tar',.05,1); return; }
    if (ir<1) { c.put(x,y,col,.35+ir*.5+.15*vn(Math.atan2(iy,ix)*8,ir*5,1,2),1); return; }
    c.put(x,y,'bone',.85-lid*.3,1); });
}
function beast(c,P){
  const t=c.t, col=P.c||'teal', glow=P.g||'cyan', kind=P.b||'whale', sc=P.sc||1;
  const S=(u,v)=>{ const X=(u-.5)/sc, Y=(v-.5)/sc + Math.sin(X*6+t)*.03*(kind==='serpent'?2:1);
    if (kind==='moth'){ const body=Math.hypot(X/.05,Y/.18)<1; const wing=Math.hypot((Math.abs(X)-.18)/(.17+.03*Math.sin(t*4)),(Y+.04)/.16)<1; return body?2:wing?1:0; }
    if (kind==='swarm'){ return 0; }
    if (kind==='serpent'){ const w=.06*(1-Math.abs(X)/.46); return Math.abs(X)<.46 && Math.abs(Y - Math.sin(X*9-t*1.5)*.08)<w ? (Math.abs(X+.4)<.05?2:1):0; }
    // whale / leviathan: tapered ellipse with fin & tail
    const body = (X/.36)**2 + (Y/(.12*(1-Math.max(0,X)/.6)))**2 < 1;
    const tail = X>.3 && X<.46 && Math.abs(Y)< (X-.3)*1.6 && Math.abs(Y)>(X-.3)*.4;
    const fin = Math.abs(X+.05)<.08 && Y>.06 && Y<.17-(Math.abs(X+.05))*.6;
    return body?2:(tail||fin)?1:0; };
  if (kind==='swarm'){ const rnd=srand(17); for (let i=0;i<(P.n||22);i++){ const a=rnd()*6.28+t*.2*(rnd()>.5?1:-1), d=rnd()*.35; const sx=.5+Math.cos(a)*d, sy=.5+Math.sin(a)*d*.7;
      beast(c,{...P,b:P.sub||'moth',sc:.12+rnd()*.06,ox:sx-.5,oy:sy-.5}); } return; }
  const ox=P.ox||0, oy=P.oy||0;
  full(c,(x,y,u,v)=>{ const s=S(u-ox,v-oy); if (!s) return; const X=(u-ox-.5)/sc, Y=(v-oy-.5)/sc;
    const spot = hash(Math.floor(X*30),Math.floor(Y*30),1,P.sd||3)>.9 && s===2;
    if (spot) { c.put(x,y,glow,.85,1); return; }
    const sh = .55 - Y*1.6 - X*.3 + (fbm(X*8,Y*8,1,4,2)-.5)*.3; c.put(x,y,col,cl(sh,.05,.95),1); });
}
function crystals(c,P){
  const rnd=srand((P.sd||c.seed)%97+1), col=P.c||'crystal', n=P.n||6;
  const shards=[]; for(let i=0;i<n;i++) shards.push({x:.5+(rnd()-.5)*.35, y:.62+(rnd()-.5)*.1, a:-1.57+(rnd()-.5)*1.3, l:.18+rnd()*.25, w:.04+rnd()*.035});
  full(c,(x,y,u,v)=>{ for (const s of shards){ const dx=u-s.x, dy=v-s.y, ca=Math.cos(s.a), sa=Math.sin(s.a); const al=dx*ca+dy*sa, pp=-dx*sa+dy*ca;
      if (al<0||al>s.l) continue; const w=s.w*(al>s.l*.75? (s.l-al)/(s.l*.25):1); if (Math.abs(pp)>w) continue;
      c.put(x,y,P.e?col:col,pp<0? .8-al/s.l*.2 : .45-al/s.l*.15 + (P.e?.2:0),1); return; } });
}
function slab(c,P){
  const t=c.t, w=P.w||.14, h=P.h||.46, col=P.c||'tar';
  box(c,.5,.5,w*.5+.01,h*.5+.01,(x,y,u,v)=>{ const X=(u-.5)/(w*.5), Y=(v-.5)/(h*.5); if (Math.abs(X)>1||Math.abs(Y)>1) return; const edge=X<-.8||Y<-.92; c.put(x,y,col,edge?.7:.15+(Y+1)*.08,1); });
  if (P.glow) full(c,(x,y,u,v)=>{ const d=Math.hypot((u-.5)/(w*.5+.08),(v-.5)/(h*.5+.08)); if (d<1||d>1.6) return; c.al(x,y,P.glow,.6,(1.6-d)*(.6+.3*Math.sin(t*2))); });
}
function pylon(c,P){
  const t=c.t, col=P.c||'metal', g=P.g||'cyan';
  full(c,(x,y,u,v)=>{ const X=u-.5, top=.12; if (v<top||v>.86) return; const w=.012+(v-top)*.11; if (Math.abs(X)>w) return; c.put(x,y,col,X<0?.65:.3,1); });
  full(c,(x,y,u,v)=>{ const d=Math.hypot(u-.5,v-.13); if (d>.12) return; const k=1-d/.12; c.al(x,y,g,.5+k*.5,k*1.6*(.7+.3*Math.sin(t*3))); });
}
function cylinder(c,P){
  const t=c.t, L_=P.len||.62, R=P.rad||.12, ang=P.ang==null?-.35:P.ang, col=P.c||'metal';
  const dx=Math.cos(ang), dy=Math.sin(ang);
  full(c,(x,y,u,v)=>{ const X=u-.5, Y=v-.5, al=X*dx+Y*dy, pp=-X*dy+Y*dx; if (Math.abs(al)>L_/2||Math.abs(pp)>R) return;
    const nn=pp/R; const stripe=fr((Math.asin(cl(nn,-1,1))/Math.PI+.5)*3 + t*.05);
    const win = stripe<.33; const lit = .55 - nn*.4;
    if (Math.abs(al)>L_/2-.02) { c.put(x,y,col,.3,1); return; }
    c.put(x,y, win?(P.w||'green'):col, win? .35+lit*.5 : lit, 1); });
}
function torus(c,P){
  const t=c.t, R=P.R||.3, r=P.rr||.1, tilt=P.tilt||.45, col=P.t||'grass';
  full(c,(x,y,u,v)=>{ const X=u-.5, Y=(v-.5)/tilt; const d=Math.hypot(X,Y); const k=Math.abs(d-R)/(r/ (P.flat?1:1)); if (k>1 || Math.abs(v-.5)>r+R*tilt) return;
    const a=Math.atan2(Y,X); const nzish=Math.sqrt(1-k*k); const lit=(.5 - (X/R)*.25 - (v-.5)*1.2)*nzish+.3;
    const n=fbm(Math.cos(a+t*.1)*3+3,Math.sin(a+t*.1)*3+3,k*2,9,3);
    const front = Y>0; if (!front && d<R && Math.abs(X)<R*.8) {}
    c.put(x,y, n<(P.sl||0)? (P.s||'ocean') : col, cl(lit*.8+(n-.5)*.4,.05,.95), 1); });
}
function cube(c,P){
  const t=c.t, s=P.s||.26, col=P.t||'grass', col2=P.t2||'rock';
  const cx=.5, cy=.52;
  // isometric cube: top, left, right faces
  full(c,(x,y,u,v)=>{ const X=(u-cx)/s, Y=(v-cy)/s;
    const iu=(X/0.866 + (Y+.5)*1) , iv=(-X/0.866 + (Y+.5)*1);
    let face=null, a=0, b=0;
    // top face: rhombus above center
    const tx=X/0.866, ty=Y+.5; const p=(ty - tx*.5), q=(ty + tx*.5);
    if (Y<=0 && Math.abs(X)<=0.866){ const pp=( Y + .5 ) ; }
    const top = (Math.abs(X)/0.866 + Math.abs(Y+0.5)*2) <= 1;
    if (top){ face='top'; a=X; b=Y; }
    else if (X<0 && X>=-0.866 && Y>=-0.5+(-X/0.866)*0.5-.0 && Y<=0.5+(-X/0.866)*0.5 && Y> -0.5 + (0.866+X)/0.866*0.5 - 0.5) { face='l'; a=X; b=Y; }
    else if (X>=0 && X<=0.866 && Y<=0.5+(X/0.866)*0.5 && Y> -0.5 + (0.866-X)/0.866*0.5 - 0.5) { face='r'; a=X; b=Y; }
    if (!face) return;
    const n=fbm(a*4+(face==='l'?9:face==='r'?19:0),b*4,1,7,3);
    const base = face==='top'?.75: face==='l'?.5:.28;
    const rmp = face==='top'? col : (P.t3||col2);
    c.put(x,y, n<(P.sl||0)?(P.sea||'ocean'):rmp, cl(base+(n-.5)*.5,.05,.95),1); });
}
function disc(c,P){ // flat disk object (Alderson disk, pancake world)
  const t=c.t, R=P.R||.42, tilt=P.tilt||.3, col=P.t||'grass';
  full(c,(x,y,u,v)=>{ const X=u-.5, Y=(v-.5)/tilt, d=Math.hypot(X,Y); if (d>R) return; if (P.hole && d<P.hole) return;
    const a=Math.atan2(Y,X); const n=fbm(X*6+3,Y*6+3,t*.02,11,4); c.put(x,y, n<(P.sl||0)?(P.s||'ocean'):col, cl(.3+n*.6 - Y*.4,.05,.95),1); });
  full(c,(x,y,u,v)=>{ const X=u-.5, Y=(v-.5); if (Y<0) return; const d=Math.hypot(X,Y/tilt); if (d>R||d<R-.01 && Y<.015) return; });
}
function ringworld(c,P){
  const t=c.t, R=P.R||.42, tilt=P.tilt||.3, col=P.t||'grass', gap=P.gap, w=P.w||.05;
  const draw=(front)=>full(c,(x,y,u,v)=>{ const X=u-.5, Yr=v-.5; // ring band: ellipse X^2+(Y/tilt)^2=R^2 extended by height w
    for (let hh=0; hh<=0; hh++){}
    const Y0 = Yr; // check if any point of band at this x: band spans y from ellipseY to ellipseY - w
    if (Math.abs(X)>R) return; const ey=Math.sqrt(R*R-X*X)*tilt; const ys = front? [ey] : [-ey];
    for (const e of ys){ if (Yr<=e+.003 && Yr>=e-w){ const a=Math.atan2(e/tilt,X); const ang=(a+Math.PI*2+t*.05)%(Math.PI*2);
        if (gap && ang>gap[0] && ang<gap[1]) return; const k=(e-Yr)/w;
        const inner=!front; const n=fbm(Math.cos(a)*4+3,Math.sin(a)*4,k*2,5,3);
        c.put(x,y, inner? (n<.45?(P.s||'ocean'):col) : (P.o||'metal'), inner? .3+n*.6 : .25+k*.5,1); return; } } });
  draw(false); if (P.star) star(c,{c:P.star,r:.06,cor:2.6}); draw(true);
}
function swarm(c,P){
  const t=c.t, rnd=srand(31), n=P.n||90, col=P.c||'gold';
  if (P.star!==false) star(c,{c:P.star||'sYel',r:P.sr||.11,cor:P.cor||2});
  for (let i=0;i<n;i++){ const R=.2+rnd()*.24, a=rnd()*6.28+t*.12*(1.2-R*1.5), inc=(rnd()-.5)*2.2; const X=Math.cos(a)*R, Z=Math.sin(a)*R; const Y=Z*Math.sin(inc)*.6;
    const px=Math.floor((.5+X)*c.N), py=Math.floor((.5+Y*.9+Z*.25*Math.cos(inc))*c.N);
    if (Z<0 && Math.hypot(X,Y)<(P.sr||.11)) continue; const sz=c.N>=96?2:1; for(let a1=0;a1<sz;a1++) for(let b1=0;b1<sz;b1++) c.put(px+a1,py+b1,col,.5+rnd()*.5,1); }
}
function shells(c,P){
  const t=c.t, n=P.n||3, col=P.c||'metal';
  star(c,{c:P.star||'sOra',r:.08,cor:1.6});
  for (let i=0;i<n;i++){ const r=.18+i*.08; const cut=.9+i*.5+t*.05*(i%2?1:-1);
    sphere(c,{r,spin:0,noOutline:0},(nx,ny,nz,lam)=>{ const a=Math.atan2(ny,nx); const open=Math.cos(a-cut)>.35; if (open) return null;
      const g=hash(Math.floor((nx+1)*r*c.N/3),Math.floor((ny+1)*r*c.N/3),i,3)>.82; return g?{r:P.g||'cyan',v:.8,e:1}:{r:col,v:.35+lam*.3}; }); }
}
function gate(c,P){
  const t=c.t, R=P.R||.34, tilt=P.tilt||.8, col=P.c||'metal', g=P.g||'cyan';
  full(c,(x,y,u,v)=>{ const X=u-.5, Y=(v-.5)/tilt, d=Math.hypot(X,Y); if (d<R-.05){ const a=Math.atan2(Y,X); const sw=fbm(Math.cos(a+d*8-t)*2+3,Math.sin(a+d*8-t)*2+3,d*2,8,3);
      c.al(x,y,g,.3+sw*.7,.4+sw*.8); return; }
    if (d<R+.04){ const a=Math.atan2(Y,X); const seg=Math.abs(Math.sin(a*8))<.12; c.put(x,y, seg?g:col, seg?.9:.45-Y*.8,1); } });
}
function terminal(c,P){
  const t=c.t, N=c.N, col=P.c||'green';
  full(c,(x,y,u,v)=>{ if (u<.1||u>.9||v<.16||v>.84) return; if (u<.12||u>.88||v<.19||v>.81){ c.put(x,y,'metal',.5,1); return; }
    const row=Math.floor((v-.22)*N/ (N*.07)); const col_=Math.floor((u-.15)*N/(N*.03)); const lineLen= 6+Math.floor(hash(row,1,1,7)*20);
    const show = col_<lineLen && row*1 <= (t*4)%14 && fr((v-.22)/.07)<.6 && hash(col_,row,2,5)>.25;
    const cursor = row===Math.floor((t*4)%14) && col_===lineLen && Math.floor(t*3)%2;
    c.put(x,y, (show||cursor)?col:'tar', (show||cursor)?.8:.12,1); });
}
function tesseract(c,P){
  const t=c.t, col=P.c||'cyan', a=t*.4;
  const pts=[]; for (let i=0;i<16;i++){ let p=[(i&1)?1:-1,(i&2)?1:-1,(i&4)?1:-1,(i&8)?1:-1];
    const ca=Math.cos(a), sa=Math.sin(a); let [x0,y0,z0,w0]=p; [x0,w0]=[x0*ca-w0*sa,x0*sa+w0*ca]; const cb=Math.cos(a*.6), sb=Math.sin(a*.6); [y0,z0]=[y0*cb-z0*sb,y0*sb+z0*cb];
    const k=1/(2.6-w0); pts.push([.5+(x0*k)*.32+z0*k*.08, .5+(y0*k)*.32+z0*k*.05]); }
  const edges=[]; for (let i=0;i<16;i++) for (let j=0;j<4;j++){ const k=i^(1<<j); if (k>i) edges.push([i,k]); }
  for (const [i,j] of edges){ const [x0,y0]=pts[i], [x1,y1]=pts[j]; const steps=Math.ceil(Math.hypot(x1-x0,y1-y0)*c.N*1.5);
    for (let s=0;s<=steps;s++){ const u=x0+(x1-x0)*s/steps, v=y0+(y1-y0)*s/steps; c.put(Math.floor(u*c.N),Math.floor(v*c.N),col,.7+.3*(s/steps),0); } }
}
function plane(c,P){ // flattened 2D zone: perspective grid
  const t=c.t, col=P.c||'magenta';
  full(c,(x,y,u,v)=>{ if (v<.45) return; const z=(v-.45); const X=(u-.5)/z; const Zc=1/z; const gx=fr(X*.25), gz=fr(Zc*.3+t*.3);
    if (gx<.06||gz<.08) c.put(x,y,col,.5+z,0); });
  if (P.sun) star(c,{c:P.sun,r:.12,y:.38,cor:1.5});
}
function scene(c,P){ // sky above a world surface: horizon with something in the sky
  const t=c.t, g=P.g||'rock', hz=P.hz||.72, sd=(P.sd||c.seed)%97;
  full(c,(x,y,u,v)=>{ if (v<hz-(fbm(u*4,1,1,sd,3)-.5)*.12) return; const n=fbm(u*8,v*8,1,sd+3,3); c.put(x,y,g,cl(.2+n*.5-(v-hz)*.4,.05,.9),1); });
}

const K = { pl:planet, star, bh:blackhole, neb:nebula, gal:galaxy, belt, comet, burst, beam, waves, vortex, field, streaks, rift, bubble, lens, str:stringL, glitch, clock, loop:loopL, eye:eyeL, beast, crys:crystals, slab, pylon, cyl:cylinder, torus, cube, disc, rw:ringworld, swarm, shells, gate, term:terminal, tess:tesseract, plane, scene };

function render(spec, N, t, seed, noBg){
  const c = new Ctx(N, t||0, seed||1);
  const layers = Array.isArray(spec) ? spec : [spec];
  const bgL = layers.find(l => l && l.bg); const bg = (bgL && bgL.bg) || 'space';
  background(c, noBg ? 'none' : bg);
  for (const L_ of layers){ const fn = K[L_.k]; if (fn) fn(c, L_); }
  c.outline();
  // re-run post layers (glitch) after outline so tears cover the outline too
  return c;
}
function renderTo(canvas, spec, N, t, seed, noBg){
  const c = render(spec, N, t, seed, noBg);
  canvas.width = N; canvas.height = N;
  const g = canvas.getContext('2d'); const img = g.createImageData(N, N); img.data.set(c.px); g.putImageData(img, 0, 0);
}
window.OVR = { render, renderTo, strSeed, RAMPS };
})();
