import sys, time
from forge import to_png
from units import ALL
from batch2 import ALL2
ALL={**ALL,**ALL2}
from PIL import Image
keys = sys.argv[1:] or list(ALL)
rows=[]
for k in keys:
    t=time.time(); u=ALL[k](); fr=u.frames()
    to_png(fr, f'/tmp/claude-0/u_{k}.png'); print(k, round(time.time()-t,1), flush=True)
    rows.append(Image.open(f'/tmp/claude-0/u_{k}.png'))
W=max(r.width for r in rows); H=sum(r.height+4 for r in rows)
im=Image.new('RGBA',(W,H),(58,82,54,255)); y=0
for r in rows: im.alpha_composite(r,(0,y)); y+=r.height+4
im.resize((W*3,H*3),0).save('/tmp/claude-0/contact.png')
