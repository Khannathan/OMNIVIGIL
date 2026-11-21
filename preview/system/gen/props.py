import random, json, math
from enc import encode
CW,CH=32,40; N=6
def canvas(): return [[None]*CW for _ in range(CH)]
def put(g,x,y,t):
    if 0<=x<CW and 0<=y<CH: g[y][x]=t
def ellipse(g,cx,cy,rx,ry,fn):
    for y in range(int(cy-ry)-1,int(cy+ry)+2):
        for x in range(int(cx-rx)-1,int(cx+rx)+2):
            dx=(x-cx)/rx; dy=(y-cy)/ry
            if dx*dx+dy*dy<=1.0: put(g,x,y,fn(dx,dy,x,y))
def outline(g,tok='outline'):
    o=[r[:] for r in g]
    for y in range(CH):
        for x in range(CW):
            if g[y][x] is None:
                for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
                    xx,yy=x+dx,y+dy
                    if 0<=xx<CW and 0<=yy<CH and g[yy][xx] not in (None,'outline'):
                        o[y][x]=tok;break
    return o
def shade3(R,dx,dy,bias=0):  # R list dark..light ; light from upper-left
    v=-(dx+dy)*0.7+bias
    i=int(round((v+1)/2*(len(R)-1))); i=max(0,min(len(R)-1,i)); return R[i]
def cone_tree(g,cx,base,R,trunk,tiers=3,w=7,h=22):
    for y in range(base-3,base+1): put(g,cx,y,trunk); put(g,cx+1,y,trunk)
    top=base-h
    for k in range(tiers):
        ty=top+k*(h//(tiers+1)); by=ty+h//tiers+3
        for y in range(ty,by):
            hw=(y-ty)*(w+k)/(by-ty)
            for x in range(int(cx-hw),int(cx+hw)+2):
                dx=(x-cx)/max(hw,1)
                t=R[2] if dx<-0.2 else R[1] if dx<0.5 else R[0]
                if y==by-1: t=R[0]
                put(g,x,y,t)
        put(g,cx,ty,R[3]); put(g,cx-1,ty+2,R[3])
def round_tree(g,cx,base,R,trunk,r=8):
    for y in range(base-6,base+1): put(g,cx,y,trunk); put(g,cx+1,y,trunk)
    for (ox,oy,rr) in [(0,-12,r),(-4,-9,r*0.7),(4,-8,r*0.7),(0,-16,r*0.6)]:
        ellipse(g,cx+ox,base+oy,rr,rr*0.85,lambda dx,dy,x,y:shade3(R,dx,dy))
def rocks(g,cx,base,R):
    for (ox,oy,rx,ry) in [(-4,-4,6,4),(4,-3,5,3),(0,-8,4,4)]:
        ellipse(g,cx+ox,base+oy,rx,ry,lambda dx,dy,x,y:shade3(R,dx,dy,0.1))
def box(g,x0,yb,w,h,d,front,side,top,win=None,winlit=None,rng=None,roof=None,wstep=3):
    # front face
    for y in range(yb-h,yb+1):
        for x in range(x0,x0+w): put(g,x,y,front)
    # right side, oblique up-right
    for i in range(d):
        for y in range(yb-h-i,yb-i+1): put(g,x0+w+i,y,side)
    # top
    for i in range(d):
        for x in range(x0+i,x0+w+i): put(g,x,yb-h-i-1,top)
    if roof:
        for x in range(x0,x0+w): put(g,x,yb-h-1,roof)
    if win:
        for y in range(yb-h+2,yb-1,wstep):
            for x in range(x0+1,x0+w-1,2):
                lit = winlit and rng.random()<0.45
                put(g,x,y,winlit if lit else win)
        for i in range(1,d,2):
            for y in range(yb-h+2-i,yb-1-i,wstep):
                put(g,x0+w+i,y,win)
def dome(g,cx,base,rx,ry,R,band=None,glowt=None):
    ellipse(g,cx,base,rx,ry,lambda dx,dy,x,y:(shade3(R,dx,dy) if y<=base else None))
    for x in range(cx-rx,cx+rx+1): put(g,x,base,R[0])
    if band:
        for x in range(cx-rx+2,cx+rx-1): put(g,x,base-ry//3,band)
    if glowt:
        put(g,cx-2,base-2,glowt);put(g,cx+2,base-2,glowt);put(g,cx,base-ry//2,glowt)
def shard(g,cx,base,h,w,R,lean=0):
    for y in range(base-h,base+1):
        f=(y-(base-h))/h
        hw=max(0.5,w*min(1,f*2.2))
        c=cx+lean*(1-f)
        for x in range(int(c-hw),int(c+hw)+1):
            t=R[3] if x<c-hw*0.3 else R[2] if x<c+0.2 else R[1]
            if f<0.12: t=R[3]
            put(g,x,y,t)
def mushroom(g,cx,base,stem,R,capw=11,h=22,spots=None):
    for y in range(base-h+4,base+1):
        for x in range(cx-1,cx+2): put(g,x,y,stem[1] if x<cx+1 else stem[0])
    ellipse(g,cx,base-h+4,capw,6,lambda dx,dy,x,y:(shade3(R,dx,dy) if dy<0.35 else R[0]))
    if spots:
        for (ox,oy) in [(-5,-2),(3,-4),(6,0),(-1,-1)]: put(g,cx+ox,base-h+4+oy,spots)
def spire(g,cx,base,h,w,front,side,glowt):
    for y in range(base-h,base+1):
        f=(y-(base-h))/h; hw=max(1,w*f)
        for x in range(int(cx-hw),int(cx+hw)+1): put(g,x,y,front if x<=cx else side)
        if y%4==0 and f>0.2: put(g,cx-1,y,glowt)
    put(g,cx,base-h-1,glowt)

def biome(b):
    g=[canvas() for _ in range(N)]; rng=random.Random(b)
    if b=='terran':
        cone_tree(g[0],15,38,['pine.0','pine.1','pine.2','pine.3'],'rust.0')
        round_tree(g[1],15,38,['moss.0','moss.1','moss.2','moss.3'],'rust.0')
        rocks(g[2],15,37,['rock.0','rock.1','rock.2','rock.3','rock.4'])
        box(g[3],5,37,14,10,6,'bone.0','steel.1','roof.2',win='steel.0',winlit='amber.1',rng=rng,roof='roof.3')
        box(g[4],6,37,13,26,7,'steel.1','steel.0','roof.1',win='joint.1',winlit='amber.1',rng=rng,roof='roof.2')
        for y in range(14,24): put(g[4][0] if False else g[4],7,y,'hot.0')
        box(g[5],2,37,20,9,8,'roof.1','roof.0','street.2',win='joint.1',winlit='amber.2',rng=rng,roof='street.3',wstep=4)
    if b=='fungal':
        mushroom(g[0],15,38,['bone.0','bone.1'],['cap.0','cap.1','cap.2','cap.3'],spots='cap.3')
        mushroom(g[1],15,38,['spore.2','spore.3'],['spore.0','spore.1','spore.2','spore.3'],capw=8,h=16,spots='glow.1')
        for (ox,r) in [(-5,4),(3,5),(8,3)]: ellipse(g[2],15+ox,36-r,r,r,lambda dx,dy,x,y:shade3(['spore.0','spore.1','spore.2','spore.3'],dx,dy))
        dome(g[3],15,37,10,10,['cap.0','cap.1','cap.2','cap.3'],band='spore.1',glowt='glow.1')
        spire(g[4],15,38,32,7,'cap.1','cap.0','glow.1')
        dome(g[5],10,37,8,7,['spore.0','spore.1','spore.2','spore.3'],glowt='glow.2'); dome(g[5],21,37,7,12,['cap.0','cap.1','cap.2','cap.3'],glowt='glow.1')
    if b=='crystal':
        R=['facet.0','facet.1','facet.2','facet.3']
        shard(g[0],15,38,28,4,R); shard(g[0],10,38,16,3,R,lean=-3); shard(g[0],20,38,19,3,R,lean=3)
        shard(g[1],15,38,18,5,['geode.1','geode.2','geode.3','facet.2'])
        shard(g[2],12,37,8,4,['geode.0','geode.1','geode.2','geode.3']); shard(g[2],19,37,6,4,['geode.0','geode.1','geode.2','geode.3'])
        dome(g[3],15,37,10,8,['geode.1','geode.2','geode.3','facet.2'],band='facet.1',glowt='facet.3')
        spire(g[4],15,38,34,6,'ink.3','ink.2','facet.2')
        box(g[5],4,37,16,12,7,'ink.3','ink.2','geode.3',win='ink.1',winlit='facet.2',rng=rng,roof='facet.1')
    if b=='lava':
        shard(g[0],15,38,26,4,['basalt.0','basalt.1','basalt.2','basalt.3']); 
        for y in range(20,38,3): put(g[0],15,y,'magma.2')
        shard(g[1],13,38,14,3,['basalt.0','basalt.1','basalt.2','basalt.3'],lean=-2); shard(g[1],19,38,10,3,['basalt.0','basalt.1','basalt.2','basalt.3'],lean=2)
        rocks(g[2],15,37,['basalt.0','basalt.1','basalt.2','basalt.3','rust.0']); 
        for p in [(15,30),(14,31),(16,31)]: put(g[2],*p,'magma.3')
        box(g[3],5,37,14,8,6,'steel.1','steel.0','basalt.3',win='basalt.0',winlit='magma.2',rng=rng,roof='rust.1')
        box(g[4],7,37,10,24,6,'steel.0','basalt.2','steel.2',win='basalt.0',winlit='magma.2',rng=rng,roof='rust.1')
        for y in range(4,12): put(g[4],18,y,'steel.1'); put(g[4],19,y,'steel.0')
        put(g[4],18,3,'magma.3'); put(g[4],19,3,'magma.2')
        for k,w in enumerate([22,16,10]):
            box(g[5],5+k*3,37-k*5,w,4,4,'basalt.3','basalt.1','rust.1',win=None)
        put(g[5],15,20,'magma.3')
    if b=='ice':
        cone_tree(g[0],15,38,['frost.2','glacier.0','glacier.1','glacier.3'],'ink.2')
        shard(g[1],15,38,24,4,['glacier.0','glacier.1','glacier.2','glacier.3']); shard(g[1],9,38,12,3,['glacier.0','glacier.1','glacier.2','glacier.3'],lean=-2)
        rocks(g[2],15,37,['ink.1','ink.2','ink.3','ink.4','snow.2'])
        dome(g[3],15,37,10,8,['snow.0','snow.1','snow.2','snow.3'],band='glacier.0',glowt='amber.1')
        box(g[4],7,37,12,24,6,'shell.1','shell.0','snow.2',win='ink.2',winlit='glow.1',rng=rng,roof='snow.3')
        box(g[5],3,37,20,9,7,'shell.2','shell.1','snow.3',win='ink.2',winlit='amber.1',rng=rng,roof='snow.2',wstep=4)
    if b=='toxic':
        for y in range(20,39): put(g[0],15,y,'sludge.2'); put(g[0],16,y,'sludge.1')
        for (ox,oy,r) in [(0,-20,6),(-5,-14,4),(5,-12,4)]: ellipse(g[0],15+ox,38+oy,r,r,lambda dx,dy,x,y:shade3(['sludge.2','bile.2','acid.1','acid.2'],dx,dy))
        for (ox,h) in [(-5,12),(0,18),(5,9)]:
            for y in range(38-h,39): put(g[1],15+ox,y,'bile.2'); put(g[1],16+ox,y,'bile.1')
            ellipse(g[1],15.5+ox,38-h,2.5,2,lambda dx,dy,x,y:'acid.2' if dy<0 else 'acid.1')
        rocks(g[2],15,37,['joint.0','steel.0','steel.1','steel.2','steel.3'])
        box(g[3],5,37,14,9,6,'rust.1','rust.0','steel.1',win='joint.0',winlit='acid.2',rng=rng,roof='rust.2')
        box(g[4],7,37,11,22,6,'steel.1','steel.0','rust.1',win='joint.0',winlit='acid.2',rng=rng,roof='rust.2')
        dome(g[5],9,37,6,9,['rust.0','rust.1','rust.2','amber.0'],band='acid.1'); dome(g[5],21,37,6,12,['steel.0','steel.1','steel.2','steel.3'],band='acid.2')
    return [outline(x) for x in g]
names=['terran','fungal','crystal','lava','ice','toxic']
out={}
for b in names:
    gs=biome(b)
    grid=[[ (gs[k][y][x] or 'transparent') for k in range(N) for x in range(CW)] for y in range(CH)]
    k,rows=encode(grid); out[b]={'keys':k,'rows':rows}
json.dump(out,open('props.json','w'))
print({b:len(out[b]['keys']) for b in out})
