// A local stand-in for a Supabase project, for testing sync without one.
//
// PostgREST - the same API layer Supabase runs - serves the database with the
// real schema and row-level security. This sits in front of it at the paths
// supabase-js expects, and fakes the one part of Supabase Auth the app uses:
// signing in by emailed code. There is no email here; the code is always
// 123456. Sessions are real JWTs, signed with the same secret PostgREST
// checks, so every request runs as that user exactly as it would in Supabase.
//
// Never point this at anything real. See supabase/README.md for how to run it.
//
//   JWT_SECRET      the secret PostgREST was started with (32+ characters)
//   POSTGREST_URL   where PostgREST is listening, e.g. http://localhost:3001
//   PORT            where to listen (default 54321)
//   PGHOST/PGPORT/PGDATABASE/PGUSER  the database, for creating auth.users rows

import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';

const SECRET = process.env.JWT_SECRET ?? '';
const POSTGREST = (process.env.POSTGREST_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const PORT = Number(process.env.PORT ?? 54321);
const CODE = '123456';

if (SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters, and match PostgREST\'s.');
  process.exit(1);
}

const b64u = (value) => Buffer.from(value).toString('base64url');

function sign(payload) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}

function verify(token) {
  const [head, body, sig] = String(token ?? '').split('.');
  if (!sig || createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url') !== sig) return null;
  return JSON.parse(Buffer.from(body, 'base64url').toString());
}

const now = () => Math.floor(Date.now() / 1000);
const ANON_KEY = sign({ role: 'anon', iss: 'supabase-local', iat: now(), exp: now() + 10 * 365 * 24 * 3600 });

/** First value of the first row. -q keeps psql's "INSERT 0 1" off the output. */
function psql(sql) {
  return execFileSync('psql', ['-q', '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { encoding: 'utf8' }).trim().split('\n')[0];
}

/** The user for an email, made on first sign-in as Supabase does. */
function userFor(email) {
  const clean = String(email).trim().toLowerCase();
  if (!/^[a-z0-9._+-]+@[a-z0-9.-]+$/.test(clean)) throw new Error('bad email');
  const found = psql(`select id from auth.users where email = '${clean}'`);
  const id = found || psql(`insert into auth.users (id, email) values ('${randomUUID()}', '${clean}') returning id`);
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: clean,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function sessionFor(user) {
  const expiresIn = 30 * 24 * 3600;
  const accessToken = sign({
    aud: 'authenticated', role: 'authenticated', sub: user.id, email: user.email,
    app_metadata: user.app_metadata, user_metadata: {}, iat: now(), exp: now() + expiresIn,
  });
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: now() + expiresIn,
    refresh_token: `refresh-${user.email}`,
    user,
  };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, prefer, range, range-unit, accept, accept-profile, content-profile, x-client-info, x-supabase-api-version',
  'access-control-expose-headers': 'content-range, content-location, preference-applied, location',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...CORS, 'content-type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    if (req.method === 'OPTIONS') return send(res, 204);

    // The database, through PostgREST, exactly as Supabase routes it.
    if (url.pathname.startsWith('/rest/v1')) {
      const target = POSTGREST + url.pathname.slice('/rest/v1'.length) + url.search;
      const headers = {};
      for (const name of ['authorization', 'content-type', 'prefer', 'accept', 'range', 'range-unit', 'accept-profile', 'content-profile']) {
        if (req.headers[name]) headers[name] = req.headers[name];
      }
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
      const upstream = await fetch(target, { method: req.method, headers, body });
      const out = {};
      for (const name of ['content-type', 'content-range', 'preference-applied', 'location']) {
        const value = upstream.headers.get(name);
        if (value) out[name] = value;
      }
      res.writeHead(upstream.status, { ...CORS, ...out });
      return res.end(Buffer.from(await upstream.arrayBuffer()));
    }

    // Auth: the few endpoints supabase-js calls for sign-in by code.
    if (url.pathname === '/auth/v1/settings') {
      return send(res, 200, { external: { email: true, google: false }, disable_signup: false, mailer_autoconfirm: false });
    }
    if (url.pathname === '/auth/v1/otp' && req.method === 'POST') {
      const { email } = JSON.parse((await readBody(req)).toString() || '{}');
      console.log(`code for ${email}: ${CODE}`);
      return send(res, 200, {});
    }
    if (url.pathname === '/auth/v1/verify' && req.method === 'POST') {
      const { email, token } = JSON.parse((await readBody(req)).toString() || '{}');
      if (token !== CODE) {
        return send(res, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      }
      return send(res, 200, sessionFor(userFor(email)));
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const { refresh_token } = JSON.parse((await readBody(req)).toString() || '{}');
      const email = String(refresh_token ?? '').replace(/^refresh-/, '');
      return send(res, 200, sessionFor(userFor(email)));
    }
    if (url.pathname === '/auth/v1/user') {
      const claims = verify(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
      if (!claims?.email) return send(res, 401, { code: 401, msg: 'invalid JWT' });
      return send(res, 200, userFor(claims.email));
    }
    if (url.pathname === '/auth/v1/logout') return send(res, 204);

    return send(res, 404, { msg: `not faked here: ${req.method} ${url.pathname}` });
  } catch (error) {
    return send(res, 500, { msg: String(error?.message ?? error) });
  }
}).listen(PORT, () => {
  console.log(`local Supabase stand-in on http://localhost:${PORT}`);
  console.log(`ANON_KEY=${ANON_KEY}`);
});
