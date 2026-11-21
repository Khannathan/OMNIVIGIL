import random, json, math
from enc import encode
W=16
def blank(t): return [[t]*W for _ in range(W)]
def put(g,x,y,t): g[y%W][x%W]=t
def speck(g,r,n,t,on=None):
    for _ in range(n):
        x,y=r.randrange(W),r.randrange(W)
        if on is None or g[y][x]==on: g[y][x]=t
def dash(g,x,y,l,t):
    for i in range(l): put(g,x+i,y,t)
def dashes(g,r,n,t,lens=(2,3,4)):
    for _ in range(n): dash(g,r.randrange(16),r.randrange(16),r.choice(lens),t)
def disc(g,cx,cy,rad,t):
    for y in range(-rad-1,rad+2):
        for x in range(-rad-1,rad+2):
            if x*x+y*y<=rad*rad+rad*0.8: put(g,cx+x,cy+y,t)
def discs(g,r,n,t,rads=(1,1,2)):
    for _ in range(n): disc(g,r.randrange(16),r.randrange(16),r.choice(rads),t)
def crowns(g,R,pts,rad,gap=None):  # R dark,mid,hi
    for (cx,cy) in pts:
        for y in range(-rad-1,rad+2):
            for x in range(-rad-1,rad+2):
                if x*x+y*y<=rad*rad+rad*0.8:
                    t=R[1]
                    if x+y< -rad*0.6: t=R[2]
                    elif x+y> rad*0.9: t=R[0]
                    put(g,cx+x,cy+y,t)
        if gap: put(g,cx+rad,cy+rad,gap)
CROWN=[(3,3),(11,2),(7,8),(14,9),(2,12),(10,14)]
CONE=[(2,2),(7,1),(12,3),(4,7),(10,7),(15,8),(1,11),(7,12),(12,13),(5,15)]
def cones(g,R,pts=CONE):  # R dark, mid, hi, tip
    for (cx,cy) in pts:
        for y in range(-2,3):
            for x in range(-2,3):
                if abs(x)+abs(y)<=2:
                    t=R[0]
                    if x<=0 and y<=0: t=R[1]
                    if x+y>=2: t=R[0]
                    put(g,cx+x,cy+y,t)
        put(g,cx-1,cy-1,R[3]); put(g,cx,cy,R[2])
def blocks(g,r,n,R):  # 2x2 lit blocks
    for _ in range(n):
        x,y=r.randrange(W),r.randrange(W)
        put(g,x,y,R[2]); put(g,x+1,y,R[1]); put(g,x,y+1,R[1]); put(g,x+1,y+1,R[0])
def ridges(g,r,n,hi,lo,l=3):
    for _ in range(n):
        x,y=r.randrange(W),r.randrange(W)
        for k in range(l): put(g,x+k,y,hi); put(g,x+k,y+1,lo)
def cracks(g,r,n,t,steps=7):
    for _ in range(n):
        x,y=r.randrange(W),r.randrange(W)
        for k in range(steps):
            put(g,x,y,t); d=r.randrange(3)
            if d==0: x+=1
            elif d==1: y+=1
            else: x+=1; y+=1
def gridlines(g,step,t,t2=None):
    for y in range(W):
        for x in range(W):
            if x%step==0 or y%step==0: g[y][x]=t
            elif t2 and (x%step==1 or y%step==1): g[y][x]=t2
def stripes(g,on,off,period=4,width=2,vertical=False):
    for y in range(W):
        for x in range(W):
            v=x if vertical else y
            g[y][x]=on if v%period<width else off
def shards(g,r,n,R):  # little crystals: tip hi, body mid, base dark
    for _ in range(n):
        x,y=r.randrange(W),r.randrange(W)
        put(g,x,y,R[3]); put(g,x,y+1,R[2]); put(g,x+1,y+1,R[1]); put(g,x,y+2,R[1]); put(g,x+1,y+2,R[0])
def swirl(g,cx,cy,R):
    for k in range(60):
        a=k*0.35; rr=k*0.12
        put(g,int(cx+math.cos(a)*rr),int(cy+math.sin(a)*rr*0.6),R[k%len(R)])
def circuit(g,r,trace,pad,n=6):
    for _ in range(n):
        x,y=r.randrange(W),r.randrange(W)
        L=r.randrange(3,8)
        if r.random()<0.5:
            for k in range(L): put(g,x+k,y,trace)
            put(g,x+L,y,pad)
            for k in range(1,4): put(g,x+L,y+k,trace)
        else:
            for k in range(L): put(g,x,y+k,trace)
            put(g,x,y+L,pad)
            for k in range(1,4): put(g,x+k,y+L,trace)
def plating(base,line,hi,lights):
    g=blank(base)
    for y in range(W):
        for x in range(W):
            if x%8==0 or y%8==0: g[y][x]=line
            elif x%8==1 or y%8==1: g[y][x]=hi
    for i,(x,y) in enumerate([(4,4),(12,12),(12,4),(4,12)]): put(g,x,y,lights[i%len(lights)])
    return g
def domes(base,R,light,dot):
    g=blank(base)
    for (cx,cy) in [(4,4),(12,4),(4,12),(12,12)]:
        for y in range(-3,4):
            for x in range(-3,4):
                if x*x+y*y<=10:
                    t=R[1]
                    if x+y<-2: t=R[2]
                    elif x+y>2: t=R[0]
                    put(g,cx+x,cy+y,t)
        put(g,cx,cy,light); put(g,cx+1,cy,dot)
    return g
def road(base,edge1,edge2,mark):
    g=blank(base)
    for x in range(16): g[0][x]=edge1; g[15][x]=edge2
    for x in range(0,16,4): g[7][x]=mark; g[7][x+1]=mark
    return g
def farm(on,off,mark=None):
    g=blank(off)
    for y in range(W):
        for x in range(W):
            if y%5 in (1,2,3) and x%8 not in (0,7): g[y][x]=on
            if mark and y%5==1 and x%8==1: g[y][x]=mark
    return g
def water(r,base,a,b,specks=None,ns=4):
    g=blank(base); dashes(g,r,7,a); dashes(g,r,5,b,(2,3))
    if specks: speck(g,r,ns,specks)
    return g

def hycean():
    r=random.Random(101); T=[]
    T.append(water(r,'hydro.0','hydro.1','lume.0','lume.1',3))
    T.append(water(r,'hydro.1','hydro.2','hydro.0','lume.1',4))
    T.append(water(r,'hydro.2','hydro.3','foam.0','lume.2',5))
    g=blank('foam.1'); speck(g,r,30,'foam.0'); speck(g,r,12,'foam.2'); T.append(g)
    g=blank('kelp.1'); discs(g,r,6,'kelp.2'); speck(g,r,12,'kelp.3'); speck(g,r,6,'hydro.2'); T.append(g)
    g=blank('kelp.2'); speck(g,r,22,'kelp.3'); speck(g,r,8,'lume.1'); speck(g,r,8,'kelp.1'); T.append(g)
    g=blank('hydro.2'); discs(g,r,8,'kelp.1',(1,1,2)); speck(g,r,10,'kelp.2','kelp.1'); T.append(g)
    g=blank('kelp.0'); crowns(g,['kelp.1','kelp.2','kelp.3'],CROWN,3,'hydro.1'); speck(g,r,5,'lume.1','kelp.2'); T.append(g)
    g=blank('hydro.1'); cones(g,['lume.0','lume.1','lume.2','foam.2']); T.append(g)
    g=blank('foam.0'); cracks(g,r,4,'hydro.1'); blocks(g,r,5,['hydro.1','foam.0','foam.1']); T.append(g)
    g=blank('foam.1'); ridges(g,r,7,'foam.2','foam.0'); T.append(g)
    g=blank('foam.2'); speck(g,r,22,'foam.1'); speck(g,r,6,'lume.2'); T.append(g)
    T.append(plating('plate.1','hydro.2','plate.2',['glow.1','amber.1']))
    T.append(domes('plate.0',['plate.1','plate.2','plate.3'],'glow.1','amber.1'))
    T.append(road('hydro.2','plate.2','plate.0','lume.1'))
    T.append(farm('kelp.2','hydro.2','kelp.3'))
    return T
def eyeball():
    r=random.Random(102); T=[]
    T.append(water(r,'hydro.0','hydro.1','blackice.1'))
    T.append(water(r,'hydro.1','hydro.2','hydro.0'))
    T.append(water(r,'hydro.2','hydro.3','hydro.1','foam.1',2))
    g=blank('rustgrass.3'); speck(g,r,28,'rustgrass.2'); speck(g,r,8,'foam.1'); T.append(g)
    g=blank('rustgrass.2'); discs(g,r,6,'rustgrass.1'); speck(g,r,12,'rustgrass.3'); speck(g,r,6,'blackleaf.3'); T.append(g)
    g=blank('rustgrass.3'); speck(g,r,20,'rustgrass.2'); speck(g,r,10,'blackleaf.2'); T.append(g)
    g=blank('hydro.2'); discs(g,r,9,'blackleaf.2'); speck(g,r,8,'rustgrass.2','blackleaf.2'); T.append(g)
    g=blank('blackleaf.0'); crowns(g,['blackleaf.1','blackleaf.2','blackleaf.3'],CROWN,3,'blackleaf.0'); speck(g,r,4,'rustgrass.1','blackleaf.2'); T.append(g)
    g=blank('blackleaf.0'); cones(g,['blackleaf.1','blackleaf.2','blackleaf.3','rustgrass.2']); T.append(g)
    g=blank('iron.2'); blocks(g,r,7,['iron.0','iron.1','iron.3']); speck(g,r,6,'rustgrass.2'); T.append(g)
    g=blank('iron.3'); ridges(g,r,7,'bluice.2','iron.1'); T.append(g)
    g=blank('bluice.3'); speck(g,r,22,'bluice.2'); cracks(g,r,3,'bluice.1',8); T.append(g)
    T.append(plating('plate.1','plate.0','plate.2',['amber.1','glow.1']))
    T.append(domes('plate.0',['plate.1','plate.2','plate.3'],'amber.1','amber.2'))
    T.append(road('steel.1','plate.2','plate.0','amber.1'))
    T.append(farm('rustgrass.1','rustgrass.3','blackleaf.3'))
    return T
def diamondw():
    r=random.Random(103); T=[]
    T.append(water(r,'tar.0','tar.1','tar.2'))
    T.append(water(r,'tar.1','tar.2','tar.0','methane.0',3))
    T.append(water(r,'tar.2','graphite.2','tar.1','diamond.1',3))
    g=blank('graphite.2'); speck(g,r,26,'graphite.3'); speck(g,r,8,'graphite.1'); speck(g,r,3,'diamond.2'); T.append(g)
    g=blank('graphite.1'); speck(g,r,24,'graphite.2'); speck(g,r,5,'diamond.1'); T.append(g)
    g=blank('graphite.2'); speck(g,r,16,'graphite.3'); speck(g,r,10,'diamond.0'); speck(g,r,4,'diamond.2'); T.append(g)
    g=blank('tar.2'); discs(g,r,7,'graphite.3'); speck(g,r,5,'methane.1'); T.append(g)
    g=blank('graphite.1'); shards(g,r,9,['diamond.0','diamond.1','diamond.2','diamond.3']); T.append(g)
    g=blank('graphite.0'); shards(g,r,14,['diamond.0','diamond.1','diamond.2','diamond.3']); speck(g,r,6,'diamond.3'); T.append(g)
    g=blank('graphite.2'); blocks(g,r,8,['graphite.0','graphite.1','graphite.3']); T.append(g)
    g=blank('graphite.3'); ridges(g,r,7,'diamond.0','graphite.1'); speck(g,r,3,'diamond.2'); T.append(g)
    g=blank('methane.2'); speck(g,r,22,'methane.1'); speck(g,r,5,'diamond.3'); T.append(g)
    T.append(plating('plate.1','graphite.1','plate.2',['glow.1','diamond.3']))
    T.append(domes('graphite.1',['plate.1','plate.2','plate.3'],'glow.1','diamond.3'))
    T.append(road('graphite.2','plate.2','graphite.0','glow.1'))
    T.append(farm('diamond.1','graphite.1','diamond.3'))
    return T
def chthon():
    r=random.Random(104); T=[]
    g=blank('molten.2'); dashes(g,r,8,'molten.3'); dashes(g,r,6,'molten.1',(2,3)); T.append(g)
    g=blank('molten.1'); dashes(g,r,8,'molten.2'); dashes(g,r,6,'molten.0',(2,3)); T.append(g)
    g=blank('iron.1'); cracks(g,r,5,'molten.1',8); speck(g,r,5,'molten.2'); T.append(g)
    g=blank('iron.2'); speck(g,r,26,'iron.3'); speck(g,r,10,'iron.1'); T.append(g)
    g=blank('iron.2'); discs(g,r,5,'rustgrass.1'); speck(g,r,14,'rustgrass.2'); T.append(g)
    g=blank('sulfur.0'); speck(g,r,24,'sulfur.1'); speck(g,r,6,'iron.2'); T.append(g)
    g=blank('iron.1'); discs(g,r,7,'sulfur.1'); speck(g,r,8,'sulfur.2','sulfur.1'); T.append(g)
    g=blank('iron.0'); cones(g,['iron.1','iron.2','iron.3','molten.1']); T.append(g)
    g=blank('iron.1'); speck(g,r,14,'iron.2'); 
    for (x,y) in [(3,4),(11,3),(7,10),(13,12),(2,13)]: put(g,x,y,'molten.3'); put(g,x+1,y,'molten.2'); put(g,x,y+1,'molten.1'); put(g,x-1,y,'sulfur.1')
    T.append(g)
    g=blank('iron.1'); blocks(g,r,8,['iron.0','iron.2','iron.3']); T.append(g)
    g=blank('iron.3'); ridges(g,r,7,'steel.2','iron.1'); T.append(g)
    g=blank('sulfur.2'); speck(g,r,22,'sulfur.1'); speck(g,r,4,'molten.3'); T.append(g)
    T.append(plating('steel.1','iron.0','steel.2',['molten.2','amber.1']))
    T.append(domes('iron.0',['steel.0','steel.1','steel.2'],'molten.2','molten.3'))
    T.append(road('iron.1','steel.2','iron.0','molten.2'))
    T.append(farm('steel.2','iron.1','plate.3'))
    return T
def axiom():
    r=random.Random(105); T=[]
    g=blank('sink.0'); gridlines(g,8,'sink.1'); speck(g,r,4,'glow.0'); T.append(g)
    g=blank('sink.1'); gridlines(g,8,'sink.2'); circuit(g,r,'glow.0','glow.1',3); T.append(g)
    g=blank('sink.2'); circuit(g,r,'glow.1','glow.2',4); T.append(g)
    g=blank('plate.1'); gridlines(g,4,'plate.2'); speck(g,r,4,'glow.1'); T.append(g)
    g=blank('circuit.1'); circuit(g,r,'circuit.3','glow.1',7); T.append(g)
    g=blank('circuit.2'); circuit(g,r,'circuit.3','amber.1',6); T.append(g)
    g=blank('sink.2'); gridlines(g,4,'circuit.2'); T.append(g)
    g=blank('plate.0')
    for y in range(16):
        for x in range(16):
            if y%4==3: g[y][x]='sink.0'
            elif x%2==0: g[y][x]='plate.1'
            if y%4==1 and x%5==2: g[y][x]='glow.1'
            if y%4==1 and x%7==4: g[y][x]='amber.1'
    T.append(g)
    g=blank('plate.0'); stripes(g,'plate.2','plate.0',3,1,True); speck(g,r,3,'glow.1'); T.append(g)
    g=blank('ink.1')
    for (x0,y0) in [(1,1),(9,2),(3,9),(10,10)]:
        for y in range(y0,y0+5):
            for x in range(x0,x0+5): put(g,x,y,'ink.0')
        for k in range(5): put(g,x0+k,y0-1,'plate.3'); put(g,x0-1,y0+k,'plate.2')
    T.append(g)
    g=blank('plate.3'); gridlines(g,8,'plate.2','shell.3'); T.append(g)
    g=blank('shell.3'); speck(g,r,20,'shell.2'); speck(g,r,4,'glow.2'); T.append(g)
    T.append(plating('ink.1','sink.0','ink.2',['glow.1','glow.2']))
    g=blank('sink.0')
    for y in range(16):
        for x in range(16):
            d=max(abs(x-7.5),abs(y-7.5))
            if int(d)%3==0: g[y][x]='glow.0'
    put(g,7,7,'glow.2'); put(g,8,8,'glow.2'); T.append(g)
    T.append(road('sink.1','glow.0','sink.0','glow.2'))
    T.append(farm('circuit.3','circuit.1','glow.1'))
    return T
def nox():
    r=random.Random(106); T=[]
    T.append(water(r,'blackice.0','blackice.1','sink.0'))
    T.append(water(r,'blackice.1','blackice.2','blackice.0','lume.0',3))
    T.append(water(r,'blackice.2','blackice.3','blackice.1','lume.1',4))
    g=blank('blackice.3'); speck(g,r,20,'bluice.1'); speck(g,r,8,'blackice.2'); T.append(g)
    g=blank('blackice.2'); speck(g,r,14,'blackice.3'); speck(g,r,10,'biolume.1'); speck(g,r,3,'biolume.2'); T.append(g)
    g=blank('blackice.1'); speck(g,r,12,'blackice.2'); speck(g,r,10,'lume.1'); speck(g,r,3,'lume.2'); T.append(g)
    g=blank('blackice.1'); discs(g,r,7,'biolume.0'); speck(g,r,8,'biolume.2','biolume.0'); T.append(g)
    g=blank('blackice.0'); crowns(g,['biolume.0','biolume.1','biolume.2'],CROWN,3,'blackice.0'); speck(g,r,5,'biolume.3','biolume.1'); T.append(g)
    g=blank('blackice.0'); cones(g,['lume.0','lume.1','lume.2','biolume.3']); T.append(g)
    g=blank('blackice.2'); blocks(g,r,8,['blackice.0','blackice.1','blackice.3']); T.append(g)
    g=blank('blackice.3'); ridges(g,r,7,'bluice.1','blackice.1'); T.append(g)
    g=blank('bluice.1'); speck(g,r,22,'bluice.2'); speck(g,r,6,'bluice.0'); T.append(g)
    T.append(plating('plate.1','plate.0','plate.2',['amber.1','amber.2']))
    T.append(domes('blackice.1',['plate.1','plate.2','plate.3'],'amber.1','amber.2'))
    T.append(road('plate.0','plate.1','blackice.0','amber.1'))
    g=blank('blackice.1')
    for (x,y) in [(3,3),(11,4),(6,11),(13,12)]: disc(g,x,y,1,'amber.0'); put(g,x,y,'amber.2')
    T.append(g)
    return T
def tempest():
    r=random.Random(107); T=[]
    def band(base,a,b,c=None):
        g=blank(base); dashes(g,r,10,a,(3,4,5,6)); dashes(g,r,6,b,(2,3,4))
        if c: dashes(g,r,3,c,(2,3))
        return g
    T.append(band('gasa.0','gasa.1','gasa.0','gasa.2'))
    T.append(band('gasa.1','gasa.2','gasa.0'))
    T.append(band('gasa.2','gasa.3','gasa.1'))
    T.append(band('gasb.2','gasb.1','gasb.3'))
    T.append(band('gasb.3','gasb.2','gasb.1'))
    T.append(band('gasb.1','gasb.0','gasb.2','gasa.3'))
    g=band('gasa.2','gasa.3','gasa.1'); swirl(g,8,8,['gasa.3','gasa.1','molten.1','gasa.2']); T.append(g)
    g=band('gasb.2','gasb.3','gasb.1'); swirl(g,8,8,['gasb.3','gasb.1','gasb.0']); T.append(g)
    g=band('gasa.3','gasb.1','gasa.2'); swirl(g,4,4,['gasb.2','gasa.2']); swirl(g,12,11,['gasb.1','gasa.1']); T.append(g)
    T.append(band('gasb.2','gasa.3','gasb.3'))
    T.append(band('ink.2','ink.3','ink.1'))
    T.append(band('ink.3','ink.4','ink.2'))
    g=band('gasb.2','gasb.1','gasb.3')
    for y in (3,4,11,12):
        for x in range(2,14): put(g,x,y,'plate.2' if y in (3,11) else 'plate.0')
    put(g,5,3,'amber.1'); put(g,10,11,'glow.1'); T.append(g)
    g=band('gasb.2','gasb.1','gasb.3')
    for y in range(4,12):
        for x in range(4,12):
            d=(x-7.5)**2+(y-7.5)**2
            if d<14: put(g,x,y,'plate.3' if x+y<14 else 'plate.1')
    put(g,7,7,'amber.1'); put(g,8,7,'amber.2'); T.append(g)
    g=band('gasb.2','gasb.1','gasb.3')
    for x in range(16): put(g,x,7,'plate.2'); put(g,x,8,'plate.0')
    for x in range(0,16,5): put(g,x,7,'amber.1')
    T.append(g)
    g=band('gasb.1','gasb.0','gasb.2')
    for (cx,cy) in [(4,4),(12,11)]:
        for a in range(16): put(g,int(cx+3*math.cos(a/16*6.283)),int(cy+3*math.sin(a/16*6.283)),'steel.2')
        put(g,cx,cy,'glow.1')
    T.append(g)
    return T
def strangelet():
    r=random.Random(108); T=[]
    T.append(water(r,'prisma.0','prisma.1','prismb.0','prisma.3',3))
    T.append(water(r,'prismb.0','prismb.1','prisma.1','prismb.3',3))
    T.append(water(r,'prismb.1','prismb.2','prisma.2','prismc.3',4))
    g=blank('prismc.2'); speck(g,r,22,'prismc.3'); speck(g,r,8,'prisma.2'); T.append(g)
    g=blank('prisma.1')
    for y in range(16):
        for x in range(16):
            if (x+y)%6==0: g[y][x]='prismb.2'
            elif (x-y)%6==0: g[y][x]='prisma.2'
    T.append(g)
    g=blank('prismb.1')
    for y in range(0,16,4):
        for x in range((y//4)%2*2,16,4): put(g,x,y,'prismc.2'); put(g,x+1,y,'prismc.3')
    T.append(g)
    g=blank('prisma.0'); discs(g,r,7,'prismb.1'); speck(g,r,6,'prismb.3','prismb.1'); T.append(g)
    g=blank('prisma.0'); shards(g,r,10,['prisma.1','prisma.2','prisma.3','prismb.3']); T.append(g)
    g=blank('prismb.0'); shards(g,r,12,['prismb.1','prismb.2','prismb.3','prismc.3']); T.append(g)
    g=blank('prismc.1'); blocks(g,r,8,['prismc.0','prismc.1','prismc.3']); cracks(g,r,2,'prisma.2',6); T.append(g)
    g=blank('prismc.2'); ridges(g,r,7,'prismc.3','prisma.1'); T.append(g)
    g=blank('prismb.3'); speck(g,r,18,'prisma.3'); speck(g,r,10,'prismc.3'); T.append(g)
    T.append(plating('plate.1','prisma.0','plate.2',['prismb.2','prisma.2']))
    T.append(domes('prisma.0',['prismb.0','prismb.1','prismb.2'],'prismb.3','prisma.3'))
    T.append(road('prisma.0','prismb.2','prisma.1','prismc.2'))
    T.append(farm('prismb.2','prisma.1','prismc.3'))
    return T
def corpus():
    r=random.Random(109); T=[]
    T.append(water(r,'flesh.0','vein.0','flesh.1','vein.1',3))
    T.append(water(r,'flesh.1','vein.0','flesh.2','vein.1',4))
    T.append(water(r,'vein.0','vein.1','flesh.1','vein.2',5))
    g=blank('flesh.3'); speck(g,r,24,'flesh.2'); speck(g,r,6,'shell.2'); T.append(g)
    g=blank('flesh.2')
    for k in range(5):
        y0=r.randrange(16)
        for x in range(16): put(g,x,y0+int(1.5*math.sin(x*0.7+k)),'flesh.1')
    speck(g,r,8,'flesh.3'); T.append(g)
    g=blank('polyp.2'); speck(g,r,20,'polyp.3'); speck(g,r,8,'polyp.1'); T.append(g)
    g=blank('flesh.1'); discs(g,r,8,'polyp.1'); speck(g,r,6,'vein.1','polyp.1'); T.append(g)
    g=blank('polyp.0'); crowns(g,['polyp.1','polyp.2','polyp.3'],CROWN,3,'flesh.0'); speck(g,r,5,'vein.2','polyp.2'); T.append(g)
    g=blank('flesh.0'); cones(g,['flesh.1','flesh.2','flesh.3','vein.2']); T.append(g)
    g=blank('shell.1'); blocks(g,r,8,['shell.0','shell.1','shell.3']); T.append(g)
    g=blank('shell.2'); ridges(g,r,7,'shell.3','shell.0'); T.append(g)
    g=blank('shell.3'); speck(g,r,18,'shell.2'); speck(g,r,4,'flesh.3'); T.append(g)
    T.append(plating('plate.1','flesh.0','plate.2',['glow.1','vein.2']))
    T.append(domes('flesh.0',['shell.0','shell.1','shell.2'],'glow.1','vein.2'))
    T.append(road('flesh.1','shell.2','flesh.0','glow.1'))
    T.append(farm('polyp.2','flesh.2','polyp.3'))
    return T
TYPES=[hycean,eyeball,diamondw,chthon,axiom,nox,tempest,strangelet,corpus]
rows=[]
for f in TYPES:
    T=f(); assert len(T)==16,(f.__name__,len(T))
    for y in range(16): rows.append([T[k][y][x] for k in range(16) for x in range(16)])
json.dump(rows,open('exotic_rows.json','w'))
# write in chunks of up to 64 rows (4 types per write)
out=[]
for s in range(0,len(rows),64):
    k,enc=encode(rows[s:s+64]); out.append({'origin':[0,s],'keys':k,'rows':enc})
json.dump(out,open('exotic_tiles.json','w'))
print([ (o['origin'],len(o['keys'])) for o in out])
