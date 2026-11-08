// Re-captures the four screens that show the in-app logo, from the new-logo branch.
const path = require('path');
const out = (n) => path.join(__dirname, `${n}.png`);
(async () => {
  {
    const { open } = require('./lib.cjs');
    const { b, p } = await open(3);
    await p.waitForTimeout(900);
    await p.screenshot({ path: out('home-prompt') });
    await p.getByRole('button', { name: 'Enter result' }).click();
    await p.waitForTimeout(800);
    for (let i = 0; i < 2; i++) await p.getByRole('button', { name: 'Increase Wanderers FC' }).click();
    for (let i = 0; i < 6; i++) await p.getByRole('button', { name: 'Increase Saves' }).click();
    await p.getByRole('button', { name: 'Save result' }).click();
    await p.waitForTimeout(2400);
    await p.screenshot({ path: out('home-clean') });
    await p.locator('button[aria-label*="6 November"]').first().click();
    await p.waitForTimeout(900);
    await p.screenshot({ path: out('day6') });
    await b.close();
  }
  {
    const { open } = require('./lib-academy.cjs');
    const { b, p } = await open({ mode: 'who' });
    await p.waitForTimeout(600);
    await p.screenshot({ path: out('who') });
    await b.close();
  }
  console.log('done');
})();
