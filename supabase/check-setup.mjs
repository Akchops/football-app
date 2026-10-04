// Checks a Supabase project is ready for Matchday, using only what the app
// itself has: the project URL and the public (anon / publishable) key.
// Changes nothing and signs nobody in.
//
//   VITE_SUPABASE_URL=https://xyz.supabase.co VITE_SUPABASE_ANON_KEY=... node supabase/check-setup.mjs
//
// Run from GitHub by .github/workflows/check-accounts.yml.

/** What `schema_version()` in schema.sql returns. Bump both together. */
const SCHEMA_VERSION = 2;

const TABLES = [
  'households', 'household_members', 'household_invites', 'players', 'player_settings',
  'matches', 'training_sessions', 'teams', 'competitions', 'results',
];

const url = (process.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const key = (process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

let failed = 0;
const pass = (text) => console.log(`  ok    ${text}`);
const fail = (text, fix) => {
  failed += 1;
  console.log(`  FAIL  ${text}${fix ? `\n        -> ${fix}` : ''}`);
};
const note = (text) => console.log(`  note  ${text}`);

if (!url || !key) {
  console.log('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must both be set (GitHub: Settings -> Secrets and variables -> Actions -> Variables).');
  process.exit(1);
}
if (/service_role|sb_secret_/.test(key) || /"role"\s*:\s*"service_role"/.test(decodeJwt(key))) {
  console.log('That key is the secret (service_role) key. Use the anon / publishable one - the secret key must never go in the app.');
  process.exit(1);
}

function decodeJwt(token) {
  try {
    return Buffer.from(token.split('.')[1] ?? '', 'base64url').toString();
  } catch {
    return '';
  }
}

async function call(path, init = {}) {
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: { apikey: key, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

console.log(`Checking ${url}\n`);

// 1. The project answers, and the key is its public one.
let settings;
try {
  settings = await call('/auth/v1/settings');
} catch (e) {
  console.log(`  FAIL  could not reach the project: ${e.message}\n        -> check VITE_SUPABASE_URL is the Project URL from Project Settings -> API`);
  process.exit(1);
}
if (settings.status === 401 || settings.status === 403) {
  fail('the project refused the key', 'check VITE_SUPABASE_ANON_KEY is the anon / publishable key of this same project');
} else if (settings.status !== 200) {
  fail(`sign-in settings answered ${settings.status}`, 'is the project paused? Restore it in the Supabase dashboard');
} else {
  pass('project reachable, key accepted');
  const s = settings.body ?? {};
  if (s.external?.email) pass('email sign-in is on');
  else fail('email sign-in is off', 'Authentication -> Sign In / Providers -> Email: turn it on');
  if (s.disable_signup) fail('new sign-ups are disabled, so nobody new can join a family', 'Authentication -> Sign In / Providers: allow new users to sign up');
  else pass('new people can sign up');
  note(s.external?.google ? 'Google sign-in is on - the app shows its button' : 'Google sign-in is off - the app offers the email code only (fine)');
}

// 2. The schema, and the right version of it.
const version = await call('/rest/v1/rpc/schema_version', { method: 'POST', body: '{}' });
if (version.status === 200 && Number(version.body) >= SCHEMA_VERSION) {
  pass(`schema.sql has been run (version ${version.body})`);
} else if (version.status === 200) {
  fail(`schema.sql is out of date (version ${version.body}, the app needs ${SCHEMA_VERSION})`, 'SQL Editor -> paste all of supabase/schema.sql -> Run (it is safe to run again)');
} else {
  fail('schema.sql has not been run', 'SQL Editor -> paste all of supabase/schema.sql -> Run');
}

// 3. Every table exists, and someone who is not signed in cannot touch it.
for (const table of TABLES) {
  const res = await call(`/rest/v1/${table}?select=*&limit=1`);
  const code = typeof res.body === 'object' && res.body ? res.body.code : '';
  if (res.status === 200) {
    fail(`${table}: readable without signing in`, 'run all of supabase/schema.sql again - it locks this down');
  } else if (code === '42501' || res.status === 401 || res.status === 403) {
    pass(`${table}: there, and closed to anyone not signed in`);
  } else if (res.status === 404 || code === 'PGRST205' || code === '42P01') {
    fail(`${table}: missing`, 'run all of supabase/schema.sql');
  } else {
    fail(`${table}: unexpected answer ${res.status} ${JSON.stringify(res.body).slice(0, 160)}`);
  }
}

console.log('');
console.log('Not checkable from here - worth a look in the dashboard:');
console.log('  - Authentication -> Emails -> SMTP Settings: custom SMTP is on (without it, codes only reach your own Supabase team)');
console.log('  - Authentication -> Emails -> Templates: both "Confirm sign up" and "Magic link" contain {{ .Token }}');
console.log('  - Authentication -> URL Configuration -> Site URL is the app address');
console.log('');
console.log(failed ? `${failed} problem${failed === 1 ? '' : 's'} to fix.` : 'All good - the project is ready for Matchday.');
process.exit(failed ? 1 : 0);
