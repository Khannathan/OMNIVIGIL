import json, sys
from units import ALL
from batch2 import ALL2
ALL={**ALL,**ALL2}
CH='abcdefghijklmnopqrstuvwxyz0123456789!$%&*+=?@#~^-_:;<>/(){}[],'
rows=[r.split(',') for r in sys.argv[2].split('/')]
W=int(sys.argv[3])
out=[]; y=2
for row in rows:
    gs=[]
    for k in row:
        g=ALL[k]().frame(0)
        ys=[yy for yy in range(g.shape[0]) if any(v is not None for v in g[yy])]
        xs=[xx for xx in range(g.shape[1]) if any(v is not None for v in g[:,xx])]
        gs.append((k,g[min(ys):max(ys)+1, min(xs):max(xs)+1]))
    H=max(g.shape[0] for _,g in gs); x=4
    for k,g in gs:
        toks={'outline':'a'}; rr=[]
        for yy in range(g.shape[0]):
            r=''
            for xx in range(g.shape[1]):
                t=g[yy,xx]
                if t is None: r+='.'
                else:
                    if t not in toks: toks[t]=CH[len(toks)]
                    r+=toks[t]
            rr.append('|'.join(r[i:i+8] for i in range(0,len(r),8)))
        keys={v:k2 for k2,v in toks.items()}; keys['.']='keep'
        out.append({'unit':k,'origin':[x,y+H-g.shape[0]],'rows':rr,'keys':keys}); x+=g.shape[1]+8
    assert x<=W,(row,x)
    y+=H+6
json.dump({'writes':out,'h':y},open(sys.argv[1],'w'))
print('height',y)
