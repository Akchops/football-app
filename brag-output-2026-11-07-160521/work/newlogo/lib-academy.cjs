// Opens the app on the academy-enabled dev server with a demo account and the demo academy (mock-academy.js).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5176/football-app/';
const MOCK = fs.readFileSync('/home/user/football-app/brag-output-2026-11-07-195135/work/mock-academy.js', 'utf8');

const AUTH = `
export function accountsAvailable() { return true; }
export async function currentAccount() { return { id: 'u-sam', email: 'demo@example.com', name: 'Sam' }; }
export async function sendCode() {}
export async function verifyCode() {}
export async function googleAvailable() { return false; }
export async function signInWithGoogle() {}
export async function signOut() {}
export function onAccountChange() { return () => {}; }
export function describeAuthError(m) { return m; }
`;
const REMOTE = `
export function supabaseRemote() {
  return {
    households: async () => [{ id: 'hh-1', name: 'Carter family', playerId: 'pl-0', role: 'owner' }],
    invitesForMe: async () => [],
    acceptInvite: async () => {},
    createHousehold: async () => ({ id: 'hh-1', name: 'Carter family', playerId: 'pl-0', role: 'owner' }),
    pull: async () => ({ rows: { matches: [], training: [], teams: [], competitions: [], results: [] }, profile: null, settings: null }),
    push: async () => {},
    people: async () => [],
    sentInvites: async () => [],
    invite: async () => {},
    cancelInvite: async () => {},
  };
}
`;

exports.open = async ({ dpr = 3, mode = 'academy', seedPlayer = false, setup } = {}) => {
  const b = await chromium.launch({ args: ['--lang=en-GB'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, colorScheme: 'dark', locale: 'en-GB' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
  await p.addInitScript(`window.__MOCK_MODE = ${JSON.stringify(mode)};\n${MOCK}`);
  const js = (body) => ({ status: 200, contentType: 'application/javascript', body });
  await p.route(/\/src\/lib\/auth\.ts(\?.*)?$/, (r) => r.fulfill(js(AUTH)));
  await p.route(/\/src\/lib\/remote\.ts(\?.*)?$/, (r) => r.fulfill(js(REMOTE)));
  await p.route(/\/src\/lib\/academy\.ts(\?.*)?$/, async (r) => {
    const res = await r.fetch();
    let body = await res.text();
    body = body.replace('export function academyApi(', 'function __realAcademyApi(');
    body += '\nexport function academyApi() { return window.__MOCK_ACADEMY_API; }\n';
    await r.fulfill(js(body));
  });
  await p.clock.setFixedTime(new Date('2026-11-07T15:45:00'));  // the day the other screens were captured
  await p.goto(BASE);
  await p.evaluate(async ({ mode, seedPlayer }) => {
    localStorage.clear();
    localStorage.setItem('matchday.theme.v1', 'dark');
    localStorage.setItem('matchday.wrappedSeen', '2026');
    if (mode === 'academy') localStorage.setItem('matchday.mode.v1', 'academy');
    if (mode === 'who') return;
    if (seedPlayer) {
      const m = await import('/football-app/src/store/sample.ts');
      const data = m.buildSampleData(new Date());
      data.teams[0].color = '#34d399';
      data.matches = data.matches.filter((x) => x.opponent !== 'Eastfield Town');
      localStorage.setItem('matchday.data.v1', JSON.stringify(data));
      localStorage.setItem('matchday.mode.v1', 'player');
    }
  }, { mode, seedPlayer });
  await p.reload();
  await p.waitForTimeout(2500);
  return { b, p };
};
