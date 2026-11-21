import base64
s=open('/home/user/wm/sys/template.html').read()
b=lambda f:'data:image/png;base64,'+base64.b64encode(open(f,'rb').read()).decode()
s=s.replace('%%ATLAS%%',b('/home/user/wm/sys/../dl/atlas4.png')).replace('%%SPRITES%%',b('/home/user/wm/dl/sprites2.png'))
open('/home/user/wm/sys/index.html','w').write(s)
print(len(s))
