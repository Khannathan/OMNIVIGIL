import random, json
from enc import encode
W=16
def blank(t): return [[t]*W for _ in range(W)]
def put(g,x,y,t): g[y%W][x%W]=t
def speck(g,r,n,t,on=None):
    for _ in range(n):
        x,y=r.randrange(W),r.randrange(W)
        if on is None or g[y][x]==on: g[y][x]=t
def pit(g,cx,cy,rad,dark,lit,floor=None):
    # little crater: floor, shadowed upper-left wall, lit lower-right rim
    for y in range(-rad-1,rad+2):
        for x in range(-rad-1,rad+2):
            d=(x*x+y*y)**0.5
            if d<=rad-0.4:
                put(g,cx+x,cy+y, floor if floor else g[(cy+y)%W][(cx+x)%W])
                if x+y<0 and d>rad-1.6: put(g,cx+x,cy+y,dark)
            elif d<=rad+0.6 and x+y>0: put(g,cx+x,cy+y,lit)
def rocks(g,r,n,R):
    for _ in range(n):
        x,y=r.randrange(W),r.randrange(W)
        put(g,x,y,R[2]); put(g,x+1,y,R[1]); put(g,x,y+1,R[1]); put(g,x+1,y+1,R[0])
T=[]
# 0 deep mare shadow
r=random.Random(51); g=blank('mare.0'); speck(g,r,18,'mare.1'); speck(g,r,4,'regolith.0'); T.append(g)
# 1 mare
r=random.Random(52); g=blank('mare.1'); speck(g,r,26,'mare.2'); speck(g,r,10,'mare.0'); pit(g,10,5,2,'mare.0','mare.3'); T.append(g)
# 2 light mare
r=random.Random(53); g=blank('mare.2'); speck(g,r,24,'mare.3'); speck(g,r,10,'mare.1'); pit(g,4,11,1,'mare.1','mare.3'); T.append(g)
# 3 fine dust / crater floor
r=random.Random(54); g=blank('regolith.2'); speck(g,r,30,'regolith.3'); speck(g,r,12,'regolith.1'); T.append(g)
# 4 regolith with pebbles
r=random.Random(55); g=blank('regolith.3'); speck(g,r,24,'regolith.2'); speck(g,r,8,'regolith.4')
pit(g,4,4,2,'regolith.1','regolith.4'); pit(g,12,11,1,'regolith.2','regolith.4'); T.append(g)
# 5 bright highland
r=random.Random(56); g=blank('regolith.4'); speck(g,r,26,'regolith.3'); speck(g,r,6,'rock.4')
pit(g,9,7,3,'regolith.2','rock.4','regolith.3'); T.append(g)
# 6 mare ripples
r=random.Random(57); g=blank('mare.2')
for i in range(6):
    y=r.randrange(16); x=r.randrange(16)
    for k in range(5): put(g,x+k,y+(k//3),'mare.1')
speck(g,r,14,'mare.3'); T.append(g)
# 7 boulder field
r=random.Random(58); g=blank('regolith.3'); speck(g,r,20,'regolith.2'); rocks(g,r,7,['regolith.0','regolith.1','regolith.4']); T.append(g)
# 8 rubble
r=random.Random(59); g=blank('regolith.2'); speck(g,r,22,'regolith.1'); rocks(g,r,9,['regolith.0','regolith.1','regolith.3']); T.append(g)
# 9 rock outcrop
r=random.Random(60); g=blank('rock.1')
for i in range(8):
    x,y=r.randrange(16),r.randrange(16)
    for k in range(4): put(g,x+k,y,'rock.2'); put(g,x+k,y+1,'rock.0' if k>1 else 'rock.1')
speck(g,r,10,'regolith.3'); T.append(g)
# 10 ridge / crater rim (bright)
r=random.Random(61); g=blank('regolith.4')
for i in range(7):
    x,y=r.randrange(16),r.randrange(16)
    for k in range(3): put(g,x+k,y,'rock.4'); put(g,x+k,y+1,'regolith.2')
speck(g,r,8,'regolith.3'); T.append(g)
# 11 ejecta / ice
r=random.Random(62); g=blank('rock.4'); speck(g,r,20,'snow.2'); speck(g,r,10,'regolith.4'); speck(g,r,4,'snow.3'); T.append(g)
# 12 base plating
g=blank('plate.1')
for y in range(16):
    for x in range(16):
        if x%8==0 or y%8==0: g[y][x]='plate.0'
        elif x%8==1 or y%8==1: g[y][x]='plate.2'
for (x,y) in [(4,4),(12,12),(12,4),(4,12)]: put(g,x,y,'plate.3')
put(g,6,3,'glow.1'); put(g,14,10,'amber.1'); T.append(g)
# 13 hab core: domes with lit windows
g=blank('plate.0')
for (cx,cy) in [(4,4),(12,4),(4,12),(12,12)]:
    for y in range(-3,4):
        for x in range(-3,4):
            d=x*x+y*y
            if d<=10:
                t='plate.2'
                if x+y<-2: t='plate.3'
                elif x+y>2: t='plate.1'
                put(g,cx+x,cy+y,t)
    put(g,cx,cy,'amber.1'); put(g,cx+1,cy,'amber.2')
put(g,8,8,'glow.1'); T.append(g)
# 14 landing strip / road
g=blank('street.1')
for x in range(16): g[0][x]='plate.2'; g[15][x]='plate.0'
for x in range(0,16,4): g[7][x]='amber.1'; g[7][x+1]='amber.1'
T.append(g)
# 15 solar field
g=blank('regolith.2')
for y in range(16):
    for x in range(16):
        if y%5 in (1,2,3) and x%8 not in (0,7):
            g[y][x]='solar.1' if y%5!=1 else 'solar.2'
            if x%8==1 and y%5==1: g[y][x]='solar.3'
        if y%5==4 and x%8 in(3,4): g[y][x]='plate.1'
T.append(g)
rows=[]
for y in range(16): rows.append([T[k][y][x] for k in range(16) for x in range(16)])
key,enc=encode(rows)
json.dump({'keys':key,'rows':enc},open('lunar.json','w'))
print(len(key))
