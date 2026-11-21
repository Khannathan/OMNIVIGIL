import json, sys
from units import ALL
CH='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!$%&*+=?@#'
order=[('tank',4,60),('trooper',64,60),('mech',112,60),('titan',164,60),('beast',232,60),('ship',284,60),('sub',342,60),
       ('drone',40,120),('jet',100,120),('bomber',170,120),('cyber',240,120)]
toks={}
out=[]
for k,x,base in order:
    g=ALL[k]().frame(0)
    ys=[y for y in range(g.shape[0]) if any(v is not None for v in g[y])]
    xs=[x_ for x_ in range(g.shape[1]) if any(v is not None for v in g[:,x_])]
    y0,y1,x0,x1=min(ys),max(ys),min(xs),max(xs)
    rows=[]
    for y in range(y0,y1+1):
        r=''
        for xx in range(x0,x1+1):
            t=g[y,xx]
            if t is None: r+='.'
            else:
                if t not in toks: toks[t]=CH[len(toks)]
                r+=toks[t]
        rows.append('|'.join(r[i:i+8] for i in range(0,len(r),8)))
    # bottom of the frame sits on the baseline
    oy=base-(g.shape[0]-y0)
    out.append({'unit':k,'origin':[x+x0,oy],'rows':rows})
keys={v:k for k,v in toks.items()}; keys['.']='keep'
json.dump({'keys':keys,'writes':out},open('/tmp/claude-0/lineup.json','w'))
print(json.dumps(keys)); print(sum(len(''.join(o['rows'])) for o in out))
