import base64
s=open('preview/worldmap/template.html').read()
b=lambda f:'data:image/png;base64,'+base64.b64encode(open(f,'rb').read()).decode()
s=s.replace('%%ATLAS%%',b('preview/worldmap/art/atlas3.png')).replace('%%SPRITES%%',b('preview/worldmap/art/sprites.png'))
open('preview/worldmap/index.html','w').write(s)
print(len(s))
