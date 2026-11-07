const { chromium } = require('playwright');
(async () => {
  const FPS = 30, TOTAL = 600;
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://127.0.0.1:8765/comp.html');
  await p.evaluate(() => window.ready);
  const t0 = Date.now();
  for (let f = 0; f < TOTAL; f++) {
    await p.evaluate((t) => window.render(t), f / FPS);
    await p.screenshot({ path: `frames/f${String(f).padStart(4, '0')}.png` });
    if (f % 100 === 0) console.log('frame', f, ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
  await b.close();
  console.log('done');
})();
