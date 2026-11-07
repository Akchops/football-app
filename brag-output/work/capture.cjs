const { open } = require('./lib.cjs');
const fs = require('fs');
const boxes = {};
const box = async (p, key, loc) => { const r = await loc.boundingBox(); boxes[key] = r; return r; };
(async () => {
  const { b, p } = await open(3);
  const shot = async (name) => { await p.waitForTimeout(900); await p.screenshot({ path: `cap/${name}.png` }); };
  // Home with result prompt
  await shot('home-prompt');
  await box(p, 'prompt-enter', p.getByRole('button', { name: 'Enter result' }));
  await p.getByRole('button', { name: 'Enter result' }).click();
  await p.waitForTimeout(800);
  // Result form: forward first
  await p.getByRole('button', { name: 'Forward' }).click();
  await shot('r-forward');
  boxes.scores = {};
  boxes.scores['r-forward'] = await p.locator('.score-preview-value').innerText();
  await box(p, 'seg-keeper', p.getByRole('button', { name: 'Keeper' }));
  await p.getByRole('button', { name: 'Keeper' }).click();
  await shot('r-keeper');
  boxes.scores['r-keeper'] = await p.locator('.score-preview-value').innerText();
  await box(p, 'score-card', p.locator('.score-preview'));
  await box(p, 'inc-us', p.getByRole('button', { name: 'Increase Wanderers FC' }));
  await box(p, 'inc-saves', p.getByRole('button', { name: 'Increase Saves' }));
  await box(p, 'save-result', p.getByRole('button', { name: 'Save result' }));
  await box(p, 'stats-grid', p.locator('.stat-steppers').first());
  await box(p, 'scoreboard', p.locator('.scoreboard'));
  let n = 0;
  for (let i = 0; i < 2; i++) { await p.getByRole('button', { name: 'Increase Wanderers FC' }).click(); n++; await shot(`r-step${n}`); boxes.scores[`r-step${n}`] = await p.locator('.score-preview-value').innerText(); }
  for (let i = 0; i < 6; i++) { await p.getByRole('button', { name: 'Increase Saves' }).click(); n++; await shot(`r-step${n}`); boxes.scores[`r-step${n}`] = await p.locator('.score-preview-value').innerText() + ' ' + await p.locator('.score-preview-text strong').innerText(); }
  await p.getByRole('button', { name: 'Save result' }).click();
  await shot('after-save');
  await p.waitForTimeout(1500);
  await shot('home-clean');
  // Paste flow
  await box(p, 'plus-match', p.getByRole('button', { name: '+ Match' }).first());
  await p.getByRole('button', { name: '+ Match' }).first().click();
  await p.waitForTimeout(700);
  await shot('add-empty');
  await box(p, 'paste-open', p.locator('.paste-open'));
  await p.locator('.paste-open').click();
  await shot('add-paste-open');
  await box(p, 'paste-box', p.locator('.paste-box textarea'));
  const msg = 'Hi all, next game Sat 14th v Oakfield Rangers (A), KO 10:30, meet 9:45 at Riverside Park pitch 3. Green kit please';
  await p.locator('.paste-box textarea').fill(msg);
  await p.waitForTimeout(600);
  await p.locator('.paste-box textarea').blur();
  await shot('add-filled');
  boxes.pasteNote = await p.locator('.paste-note').innerText().catch(() => '');
  await box(p, 'paste-note', p.locator('.paste-note'));
  boxes.form = await p.evaluate(() => [...document.querySelectorAll('.sheet input, .sheet select')].map(e => e.value).join(' | '));
  await box(p, 'add-match-btn', p.getByRole('button', { name: 'Add match' }));
  await p.getByRole('button', { name: 'Cancel' }).click();
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Stats' }).click();
  await shot('stats');
  await p.locator('.wrapped-banner').click();
  boxes.wrapped = [];
  for (let i = 0; i < 9; i++) {
    await p.waitForTimeout(1700);
    await p.screenshot({ path: `cap/w-${i}.png` });
    boxes.wrapped.push((await p.evaluate(() => document.body.innerText)).split('\n').slice(-12).join(' / ').slice(0, 160));
    await p.mouse.click(350, 420);
  }
  fs.writeFileSync('cap/boxes.json', JSON.stringify(boxes, null, 1));
  console.log(JSON.stringify(boxes.scores), boxes.pasteNote, boxes.form);
  await b.close();
})();
