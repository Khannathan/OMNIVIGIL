import json, random, math
exec(open('props.py').read().split("def biome(b):")[0])
R4=lambda n:[f'{n}.{i}' for i in range(4)]
def stalk(g,cx,base,h,R,sway=0.0,bulbs=None):
    for y in range(base-h,base+1):
        f=(base-y)/h; x=int(round(cx+math.sin(f*3.0)*sway*f))
        put(g,x,y,R[1]); put(g,x+1,y,R[0])
        if bulbs and y%5==0 and f>0.15: put(g,x-1,y,bulbs); put(g,x+2,y-1,bulbs)
    return x
def biome(b):
    g=[canvas() for _ in range(N)]; rng=random.Random(hash(b)%999)
    if b=='thalasse':
        K=R4('kelp')
        for (ox,h,s) in [(0,30,3),(-5,20,-2),(5,24,2)]:
            x=stalk(g[0],15+ox,38,h,K[1:],s,bulbs='kelp.3'); ellipse(g[0],x+.5,38-h,2,2,lambda dx,dy,X,Y:'lume.1' if dy<0 else 'lume.0')
        for a in range(-3,4):
            for t in range(4,17):
                x=int(15.5+math.sin(a*0.38)*t*0.9); y=int(38-math.cos(a*0.38)*t)
                put(g[1],x,y,'foam.2' if t>14 else 'foam.1' if (t+a)%3 else 'lume.1')
        rocks(g[2],15,37,['hydro.2','foam.0','foam.1','foam.2','foam.2'])
        for x in range(4,28): put(g[3],x,38,'plate.1'); put(g[3],x,37,'foam.0')
        dome(g[3],15,36,10,9,['hydro.2','hydro.3','foam.1','foam.2'],band='plate.2',glowt='lume.1')
        box(g[4],8,36,10,26,6,'foam.1','foam.0','plate.3',win='hydro.1',winlit='lume.1',rng=rng,roof='lume.1')
        for x in range(5,26): put(g[4],x,37,'plate.1'); put(g[4],x,38,'plate.0')
        for x in (3,9,22,28):
            for y in range(31,39): put(g[5],x,y,'steel.1')
        box(g[5],1,30,24,3,6,'plate.1','plate.0','plate.2',roof='plate.3')
        box(g[5],8,26,9,8,5,'shell.2','shell.1','foam.2',win='ink.2',winlit='lume.1',rng=rng,roof='plate.3')
        for y in range(6,18): put(g[5],22,y,'steel.2')
        put(g[5],22,5,'molten.2')
    if b=='oculus':
        B=R4('blackleaf'); I=R4('iron') if False else ['rustgrass.0','rustgrass.1','rustgrass.2','rustgrass.3']
        round_tree(g[0],15,38,B,'blackleaf.0')
        cone_tree(g[1],15,38,B,'blackleaf.0')
        rocks(g[2],15,37,['rustgrass.0','rustgrass.1','rustgrass.2','rustgrass.3','bluice.2'])
        dome(g[3],15,37,10,8,['rustgrass.0','rustgrass.1','rustgrass.2','rustgrass.3'],band='steel.1',glowt='amber.1')
        box(g[4],8,37,11,25,6,'steel.1','steel.0','rustgrass.2',win='ink.1',winlit='amber.1',rng=rng,roof='rustgrass.3')
        dome(g[5],15,37,12,6,['bluice.0','bluice.1','bluice.2','bluice.3'],band='bluice.1',glowt='amber.2')
        for y in range(14,32): put(g[5],15,y,'steel.2')
        ellipse(g[5],15,13,4,2,lambda dx,dy,X,Y:'amber.1' if dy<0 else 'amber.0')
    if b=='adamant':
        D=R4('diamond')
        shard(g[0],15,38,30,4,D); shard(g[0],9,38,17,3,D,lean=-3); shard(g[0],21,38,21,3,D,lean=3)
        shard(g[1],15,38,15,4,D); shard(g[1],20,38,8,2,D,lean=2)
        rocks(g[2],15,37,['graphite.0','graphite.1','graphite.2','graphite.3','diamond.1'])
        dome(g[3],15,37,10,9,['diamond.0','diamond.1','diamond.2','diamond.3'],band='graphite.2',glowt='glow.1')
        spire(g[4],15,38,34,6,'graphite.2','graphite.1','diamond.2')
        box(g[5],3,37,16,6,6,'graphite.2','graphite.1','graphite.3',win='graphite.0',winlit='amber.1',rng=rng,roof='steel.2')
        for y in range(8,32): put(g[5],20,y,'steel.1'); put(g[5],23,y,'steel.0')
        for y in range(9,32,4):
            for x in range(20,24): put(g[5],x,y,'steel.2')
        for x in range(10,20): put(g[5],x,10,'steel.1')
        for y in range(11,18): put(g[5],11,y,'steel.0')
        shard(g[5],11,22,4,2,D)
    if b=='khthon':
        IR=R4('iron')
        shard(g[0],15,38,30,4,IR)
        for y in range(14,38,4): put(g[0],15,y,'molten.1')
        for (ox,h) in [(-5,14),(4,20)]:
            box(g[1],12+ox,38,4,h,2,'iron.2','iron.1','iron.3',roof='iron.3')
            ellipse(g[1],14+ox,38-h-3,2.5,2,lambda dx,dy,X,Y:'molten.3' if dy<0 else 'molten.2')
        rocks(g[2],15,37,['iron.0','iron.1','iron.2','iron.3','sulfur.1'])
        for p in [(15,30),(14,31),(16,31),(15,31)]: put(g[2],*p,'molten.2')
        box(g[3],4,37,15,10,6,'iron.3','iron.2','steel.2',win='iron.0',winlit='molten.2',rng=rng,roof='sulfur.1')
        box(g[4],8,37,10,26,6,'iron.2','iron.1','iron.3',win='iron.0',winlit='molten.2',rng=rng,roof='molten.1')
        for y in range(3,11): put(g[4],18,y,'steel.1'); put(g[4],19,y,'steel.0')
        put(g[4],18,2,'molten.3'); put(g[4],19,2,'molten.2')
        for k,w in enumerate([22,15,9]): box(g[5],4+k*3,37-k*5,w,4,4,'iron.3','iron.1','steel.1')
        put(g[5],13,22,'molten.3'); put(g[5],14,22,'molten.2')
    if b=='axiom':
        box(g[0],9,37,8,24,5,'sink.2','sink.1','circuit.2',roof='circuit.3')
        for y in range(16,36,3):
            for x in range(10,16,2): put(g[0],x,y,'glow.1' if rng.random()<0.5 else 'circuit.3')
        for y in range(8,39): put(g[1],15,y,'steel.1'); put(g[1],16,y,'steel.0')
        for y in (10,16,22):
            for x in range(11,21): put(g[1],x,y,'steel.2')
        put(g[1],15,7,'glow.2'); put(g[1],16,7,'glow.1')
        for (x,y,w,h) in [(6,30,8,6),(16,32,9,4),(11,25,7,5)]: box(g[2],x,y+4,w,h,3,'circuit.2','circuit.1','circuit.3',roof='glow.0')
        box(g[3],5,37,14,10,6,'sink.2','sink.1','circuit.3',win='sink.0',winlit='glow.1',rng=rng,roof='glow.0')
        spire(g[4],15,38,34,6,'sink.2','sink.1','glow.1')
        ellipse(g[4],15,12,3,3,lambda dx,dy,X,Y:'glow.2' if dx+dy<0 else 'glow.1')
        box(g[5],10,37,7,30,4,'ink.1','ink.0','ink.2',roof='glow.1')
        for y in range(10,36,5): put(g[5],13,y,'glow.1')
    if b=='nox':
        mushroom(g[0],15,38,['blackice.2','blackice.3'],R4('biolume'),capw=10,h=24,spots='biolume.3')
        mushroom(g[1],15,38,['blackice.2','blackice.3'],['lume.0','lume.0','lume.1','lume.2'],capw=7,h=14,spots='lume.2')
        rocks(g[2],15,37,['blackice.0','blackice.1','blackice.2','blackice.3','bluice.1'])
        dome(g[3],15,37,10,9,['blackice.1','blackice.2','blackice.3','bluice.1'],band='amber.0',glowt='amber.1')
        box(g[4],8,37,11,24,6,'blackice.3','blackice.2','bluice.1',win='blackice.0',winlit='amber.1',rng=rng,roof='biolume.1')
        box(g[5],3,37,16,9,6,'steel.1','steel.0','steel.2',win='ink.1',winlit='molten.2',rng=rng,roof='steel.3')
        for x in (21,25):
            for y in range(16,38): put(g[5],x,y,'steel.1'); put(g[5],x+1,y,'steel.0')
            ellipse(g[5],x+.5,13,2,2,lambda dx,dy,X,Y:'methane.2' if dy<0 else 'methane.1')
    if b=='tempest':
        GA=R4('gasa'); GB=R4('gasb')
        ellipse(g[0],15,14,10,11,lambda dx,dy,X,Y:shade3(GA,dx,dy) if abs(dy)%0.5>0.1 else 'gasa.0')
        for y in range(25,33): put(g[0],10+(y-25)//2,y,'steel.1'); put(g[0],20-(y-25)//2,y,'steel.1')
        box(g[0],12,37,6,4,3,'steel.2','steel.1','steel.3',roof='amber.1')
        for (ox,oy,r) in [(0,-8,7),(-7,-4,5),(7,-4,5),(-3,-12,5),(4,-11,5)]: ellipse(g[1],15+ox,32+oy,r,r*0.8,lambda dx,dy,X,Y:shade3(GB,dx,dy,0.2))
        for (ox,oy,r) in [(0,-4,5),(-5,-2,4),(5,-1,3)]: ellipse(g[2],15+ox,34+oy,r,r*0.75,lambda dx,dy,X,Y:shade3(GB,dx,dy,0.2))
        ellipse(g[3],15,14,11,7,lambda dx,dy,X,Y:shade3(['shell.0','shell.1','shell.2','shell.3'],dx,dy))
        box(g[3],10,30,10,6,4,'plate.2','plate.1','plate.3',win='ink.1',winlit='amber.1',rng=rng,roof='plate.3')
        for y in range(21,24): put(g[3],12,y,'steel.1'); put(g[3],18,y,'steel.1')
        ellipse(g[4],15,7,9,6,lambda dx,dy,X,Y:shade3(GA,dx,dy))
        for y in range(12,16): put(g[4],15,y,'steel.1')
        box(g[4],11,38,7,22,4,'plate.2','plate.1','plate.3',win='ink.1',winlit='amber.1',rng=rng,roof='plate.3')
        ellipse(g[5],15,12,12,7,lambda dx,dy,X,Y:shade3(['steel.0','steel.1','steel.2','steel.3'],dx,dy))
        for y in range(19,36): put(g[5],15,y,'steel.0')
        ellipse(g[5],15,34,6,3,lambda dx,dy,X,Y:'molten.2' if dy<0 else 'molten.1')
        for x in range(4,27,4): put(g[5],x,12,'amber.1')
    if b=='strangelet':
        P=[R4('prisma'),R4('prismb'),R4('prismc')]
        shard(g[0],15,38,30,4,P[0]); shard(g[0],10,38,18,3,P[1],lean=-3); shard(g[0],20,38,20,3,P[2],lean=3)
        box(g[1],9,22,9,9,5,'prismb.2','prismb.1','prismb.3',roof='prismb.3')
        box(g[1],13,36,5,5,3,'prisma.2','prisma.1','prisma.3',roof='prisma.3')
        rocks(g[2],15,37,['prisma.0','prisma.1','prismb.1','prismb.2','prismc.2'])
        dome(g[3],15,37,10,9,['prisma.1','prisma.2','prismb.2','prismb.3'],band='prismc.2',glowt='prismc.3')
        spire(g[4],15,38,34,6,'prismc.2','prismc.1','prismb.3')
        for a in range(0,181,4):
            t=math.radians(a); x=15.5+math.cos(t)*11; y=33-math.sin(t)*20
            for d in range(3): put(g[5],int(x+math.cos(t)*d),int(y-math.sin(t)*d),['prisma.2','prismb.2','prismc.2'][(a//30)%3])
        for y in range(30,39): put(g[5],4,y,'prisma.1'); put(g[5],27,y,'prismc.1')
        put(g[5],15,8,'prismc.3'); put(g[5],16,8,'prismb.3')
    if b=='corpus':
        F=R4('flesh'); PO=R4('polyp')
        for y in range(18,39): put(g[0],15,y,'flesh.2'); put(g[0],16,y,'flesh.1')
        for (ox,oy,r) in [(0,-22,6),(-5,-16,4),(5,-14,4)]: ellipse(g[0],15+ox,38+oy,r,r,lambda dx,dy,X,Y:shade3(PO,dx,dy))
        put(g[0],14,15,'vein.2'); put(g[0],19,23,'vein.2'); put(g[0],10,21,'vein.2')
        for (ox,h,s) in [(0,28,4),(-6,18,-3),(6,22,3)]:
            x=stalk(g[1],15+ox,38,h,['flesh.1','flesh.2','flesh.0'],s,bulbs='vein.1')
            put(g[1],x,38-h-1,'vein.2')
        rocks(g[2],15,37,['shell.0','shell.1','shell.2','shell.3','shell.3'])
        dome(g[3],15,37,10,10,F,band='vein.1',glowt='vein.2')
        spire(g[4],15,38,34,6,'shell.2','shell.1','vein.1')
        dome(g[5],10,37,7,8,PO,glowt='vein.2'); dome(g[5],21,37,6,13,F,band='vein.0',glowt='vein.2')
    return [outline(x) for x in g]
names=['thalasse','oculus','adamant','khthon','axiom','nox','tempest','strangelet','corpus']
grid=[]
for b in names:
    gs=biome(b)
    grid+=[[ (gs[k][y][x] or 'transparent') for k in range(N) for x in range(CW)] for y in range(CH)]
pal={l.split()[1]:l.split()[0] for l in open('pal2.txt') if l.strip()}
pal['transparent']=None
missing={t for r in grid for t in r if t not in pal}; print('missing',missing)
from PIL import Image
im=Image.new('RGBA',(CW*N,CH*len(names)))
for y,r in enumerate(grid):
    for x,t in enumerate(r):
        c=pal.get(t)
        if c: im.putpixel((x,y),tuple(int(c[i:i+2],16) for i in (1,3,5))+(255,))
im.save('dl/exotic_props_local.png'); im.resize((im.width*3,im.height*3),0).save('/tmp/claude-0/-home-user/8e247b27-8425-515b-a2da-88548d720940/scratchpad/ep.png')
chunks=[]
for o in range(0,len(grid),64):
    k,rows=encode(grid[o:o+64]); chunks.append({'origin':[0,o],'keys':k,'rows':rows})
json.dump(chunks,open('exotic_props.json','w')); print(len(chunks),[len(c['keys']) for c in chunks])
