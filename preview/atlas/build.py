t=open('template.html').read()
t=t.replace('/*RENDER*/',open('render.js').read()).replace('/*SPECS*/',open('specs.js').read()).replace('/*DATA*/',open('data.json').read())
open('index.html','w').write(t)
sheet='''<html><body style="margin:0;background:#000"><canvas id=c></canvas><script>%s</script><script>%s</script><script>
const D=%s; const C=document.getElementById('c'); const cols=22, S=64; C.width=cols*S; C.height=Math.ceil(D.length/cols)*(S+10);
const g=C.getContext('2d'); g.font='9px monospace'; g.fillStyle='#fff'; const errs=[];
D.forEach((r,i)=>{ const cv=document.createElement('canvas'); try{ OVR.renderTo(cv,OV_SPECS[r[0]],S,1.3,OVR.strSeed(r[0])); }catch(e){ errs.push(r[0]+': '+e.message); return; }
 const x=(i%%cols)*S, y=Math.floor(i/cols)*(S+10); g.drawImage(cv,x,y); g.fillText(r[0],x+2,y+S+8); });
document.title=JSON.stringify(errs);
</script></body></html>'''%(open('render.js').read(),open('specs.js').read(),open('data.json').read())
open('sheet.html','w').write(sheet)
