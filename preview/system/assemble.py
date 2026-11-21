# template.html = head + GROUND_FS (fs.glsl) + middle + SPR_VS (vs.glsl) + SPR_FS.. + js.txt + tail
import re
t=open('/home/user/wm/sys/template.html').read()
fs=open('/home/user/wm/sys/fs.glsl').read().rstrip('\n'); vs=open('/home/user/wm/sys/vs.glsl').read().rstrip('\n'); js=open('/home/user/wm/sys/js.txt').read().rstrip('\n')
a=t.index('const GROUND_FS = `'); b=t.index('`;',a)+2
t=t[:a]+fs+t[b:]
a=t.index('const SPR_VS = `'); b=t.index('`;',a)+2
t=t[:a]+vs+t[b:]
a=t.index('// ------------------------------------------------------------------ the star system'); b=t.index('</script>\n</body>',a)
t=t[:a]+js+'\n'+t[b:]
open('/home/user/wm/sys/template.html','w').write(t)
