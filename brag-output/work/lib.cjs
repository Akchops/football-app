const { chromium } = require('playwright');
exports.open = async (dpr = 1) => {
  const b = await chromium.launch({ args: ['--lang=en-GB'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, colorScheme: 'dark', locale: 'en-GB', hasTouch: false, reducedMotion: "no-preference" });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:5173/football-app/');
  await p.evaluate(async () => {
    const m = await import('/football-app/src/store/sample.ts');
    const data = m.buildSampleData(new Date());
    data.teams[0].color = '#34d399';
    localStorage.clear();
    localStorage.setItem('matchday.data.v1', JSON.stringify(data));
    localStorage.setItem('matchday.theme.v1', 'dark');
    localStorage.setItem('matchday.wrappedSeen', '2026');
  });
  await p.reload();
  await p.waitForTimeout(2000);
  return { b, p };
};
