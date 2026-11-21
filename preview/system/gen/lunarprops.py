import json, random, sys
sys.argv=['x']
exec(open('props.py').read().split("def biome(b):")[0])
g=[canvas() for _ in range(N)]; rng=random.Random(9)
REG=['regolith.0','regolith.1','regolith.2','regolith.3','regolith.4']
PL=['plate.0','plate.1','plate.2','plate.3']
ellipse(g[0],15,31,9,7,lambda dx,dy,x,y:shade3(REG,dx,dy,0.1)); ellipse(g[0],12,27,4,3,lambda dx,dy,x,y:shade3(REG,dx,dy,0.4))
for (ox,oy,r) in [(-6,0,4),(3,1,5),(9,2,3)]: ellipse(g[1],15+ox,35+oy-r,r,r*0.8,lambda dx,dy,x,y:shade3(REG,dx,dy,0.1))
rocks(g[2],15,37,REG)
# 3 hab dome on a skirt
for x in range(4,28): put(g[3],x,37,'plate.0'); put(g[3],x,36,'plate.1')
dome(g[3],15,35,11,10,PL,band='plate.1',glowt='glow.1')
put(g[3],8,33,'amber.1'); put(g[3],22,33,'amber.1')
# 4 comms mast with dish
for y in range(10,38): put(g[4],15,y,'plate.2'); put(g[4],16,y,'plate.0')
for y in range(14,38,5):
    for x in range(13,19): put(g[4],x,y,'plate.1')
ellipse(g[4],15,9,7,3,lambda dx,dy,x,y:shade3(PL,dx,dy))
for x in range(9,22): put(g[4],x,11,'plate.0')
put(g[4],15,3,'hot.1'); put(g[4],15,4,'plate.2'); put(g[4],15,5,'plate.2'); put(g[4],15,6,'plate.2')
box(g[4],10,37,11,4,4,'plate.1','plate.0','plate.2',win='ink.1',winlit='glow.1',rng=rng,roof='plate.3')
# 5 launch pad and gantry
box(g[5],1,37,24,3,6,'plate.1','plate.0','plate.2',roof='plate.3')
for x in range(3,25,4): put(g[5],x,33,'amber.1')
for y in range(8,34): put(g[5],21,y,'steel.1'); put(g[5],24,y,'steel.0')
for y in range(9,34,3):
    for x in range(21,25): put(g[5],x,y,'steel.2')
for x in range(14,21): put(g[5],x,14,'steel.1')
put(g[5],22,7,'hot.1')
gs=[outline(x) for x in g]
grid=[[ (gs[k][y][x] or 'transparent') for k in range(N) for x in range(CW)] for y in range(CH)]
k,rows=encode(grid); json.dump({'keys':k,'rows':rows},open('lunarprops.json','w')); print(len(k))

# orbital craft: 4 frames of 32x48 pointing up, flame flickers
CW2,CH2=32,48
def cv2(): return [[None]*CW2 for _ in range(CH2)]
def p2(c,x,y,t):
    if 0<=x<CW2 and 0<=y<CH2: c[y][x]=t
fr=[]
for f in range(4):
    c=cv2()
    # hull: tapered capsule, nose at y=3, body to y=30
    for y in range(3,31):
        if y<12: hw=1+(y-3)*0.55
        else: hw=5.5
        for x in range(int(16-hw),int(16+hw)+1):
            dx=(x-15.5)/max(hw,1)
            t='shell.3' if dx<-0.45 else 'shell.2' if dx<0.2 else 'shell.1' if dx<0.7 else 'shell.0'
            p2(c,x,y,t)
    # ink panel bands and teal glow windows
    for x in range(10,22):
        for y in (17,25):
            if c[y][x]: c[y][x]='frame.1'
    p2(c,15,9,'glow.2'); p2(c,16,9,'glow.1'); p2(c,15,10,'glow.1'); p2(c,16,10,'glow.0')
    for y in (20,21,22): p2(c,13,y,'glow.1'); p2(c,18,y,'glow.0')
    # side fins
    for k in range(7):
        for x in range(9-k//2,11): p2(c,x,24+k,'frame.2' if x<10 else 'frame.1')
        for x in range(21,23+k//2): p2(c,x,24+k,'frame.1' if x>21 else 'frame.2')
    for x in range(6,9): p2(c,x,30,'hot.0')
    for x in range(23,26): p2(c,x,30,'hot.0')
    # engine bell
    for y in range(31,34):
        for x in range(12,20): p2(c,x,y,'frame.0' if x>16 else 'frame.1')
    # flame
    L=[9,12,8,11][f]
    for y in range(34,34+L):
        k=(y-34)/L; hw=3.2*(1-k*0.8)
        for x in range(int(15.5-hw),int(16.5+hw)+1):
            d=abs(x-15.5)/max(hw,0.6)
            t='hot.2' if (d<0.4 and k<0.5) else 'hot.1' if d<0.75 else 'hot.0'
            if k>0.75: t='hot.0'
            p2(c,x,y,t)
    # outline only around the hull (not the flame)
    o=[r[:] for r in c]
    for y in range(CH2):
        for x in range(CW2):
            if c[y][x] is None:
                for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
                    xx,yy=x+dx,y+dy
                    if 0<=xx<CW2 and 0<=yy<CH2 and c[yy][xx] and not c[yy][xx].startswith('hot'):
                        o[y][x]='outline';break
    fr.append(o)
grid=[[ (fr[k][y][x] or 'transparent') for k in range(4) for x in range(CW2)] for y in range(CH2)]
k,rows=encode(grid); json.dump({'keys':k,'rows':rows},open('craft.json','w')); print(len(k))
