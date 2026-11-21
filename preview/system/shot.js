const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 700 } });
  p.on('pageerror', e => console.log('err:', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 400)); });
  const shots = JSON.parse(process.argv[2]);
  for (const [n, q] of shots) { await p.goto('file:///home/user/wm/sys/index.html?ui=0&' + q); await p.waitForTimeout(+process.argv[3] || 7000); await p.screenshot({ path: `/home/user/wm/sys/shots/${n}.png` }); console.log(n); }
  await b.close();
})();
