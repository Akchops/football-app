const { open } = require('./lib-academy.cjs');
const fs = require('fs');
const boxes = {};
const box = async (p, k, loc) => { boxes[k] = await loc.first().boundingBox().catch(() => null); };
(async () => {
  // 1. Who's this for? (a new phone)
  let { b, p } = await open({ mode: 'who' });
  await p.waitForTimeout(600);
  await p.screenshot({ path: 'cap/who.png' });
  await box(p, 'whoPlayer', p.locator('.who-card').nth(0));
  await box(p, 'whoAcademy', p.locator('.who-card').nth(1));
  await b.close();

  // 2. The family's phone: the academy asks to add Alex; the family ticks consent
  ({ b, p } = await open({ mode: 'family', seedPlayer: true }));
  await p.getByRole('button', { name: 'Setup' }).click();
  await p.waitForTimeout(1200);
  const card = p.locator('.invite-card').first();
  await card.scrollIntoViewIfNeeded();
  await p.evaluate(() => { const c = document.querySelector('.invite-card'); c && c.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(700);
  await p.screenshot({ path: 'cap/family-invite.png' });
  await box(p, 'inviteCard', card);
  await box(p, 'consent', p.locator('.invite-card .consent'));
  await box(p, 'accept', p.locator('.invite-card .primary-btn'));
  await p.locator('.invite-card .consent input').check();
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'cap/family-consent.png' });
  console.log('invite', (await card.innerText()).replace(/\n+/g, ' | '));
  await b.close();

  // 3. The academy
  ({ b, p } = await open({ mode: 'academy' }));
  await p.screenshot({ path: 'cap/ac-home.png' });
  await box(p, 'homeCard', p.locator('.academy-hero, .ac-hero, [class*=hero]'));
  await p.getByRole('button', { name: 'Players', exact: true }).last().click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'cap/ac-players.png' });
  await box(p, 'joinReq', p.locator('text=Luca Rossi').first().locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"request")][1]'));
  await p.evaluate(() => { const h = [...document.querySelectorAll('h2, .section-title, *')].find((e) => /^EVERYONE/i.test(e.textContent.trim()) && e.children.length === 0); h && h.scrollIntoView({ block: 'start' }); });
  await p.waitForTimeout(700);
  await p.screenshot({ path: 'cap/ac-everyone.png' });
  await p.getByRole('button', { name: 'Tables', exact: true }).last().click();
  await p.waitForTimeout(1200);
  await p.locator('text=Northern Junior League').first().click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'cap/ac-table.png' });
  console.log('table', (await p.evaluate(() => document.body.innerText)).slice(0, 700).replace(/\n+/g, ' | '));
  await p.keyboard.press('Escape');
  await p.locator('button[aria-label="Close"]').first().click().catch(() => {});
  await p.waitForTimeout(900);
  await p.getByRole('button', { name: 'Stats', exact: true }).last().click();
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const h = [...document.querySelectorAll('*')].find((e) => /^LEADERBOARD$/i.test(e.textContent.trim()) && e.children.length === 0); h && h.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); document.querySelector('main') && document.querySelector('main').scrollBy(0, -60); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'cap/ac-leaders.png' });
  await p.evaluate(() => { const h = [...document.querySelectorAll('*')].find((e) => /^TEAM PICKS/i.test(e.textContent.trim()) && e.children.length === 0); h && h.scrollIntoView({ block: 'start' }); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'cap/ac-picks.png' });
  const pick = p.locator('text=Saturday v Oakfield').first();
  if (await pick.count()) { await pick.click(); await p.waitForTimeout(1500); await p.screenshot({ path: 'cap/ac-pick-open.png' }); }
  fs.writeFileSync('cap/boxes.json', JSON.stringify(boxes, null, 1));
  console.log(JSON.stringify(boxes));
  await b.close();
})();
