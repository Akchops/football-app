const { chromium } = require('playwright');
(async () => {
  const times = process.argv.slice(2).map(Number);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await p.goto('http://127.0.0.1:8765/comp.html');
  await p.evaluate(() => window.ready);
  for (const t of times) {
    await p.evaluate((t) => window.render(t), t);
    await p.screenshot({ path: `stills/s-${t.toFixed(2)}.png` });
  }
  await b.close();
})();
