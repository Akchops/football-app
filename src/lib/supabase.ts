import type { SupabaseClient } from '@supabase/supabase-js';
import { drillOn } from './drill';

/**
 * The connection to the account backend, if this build has one.
 *
 * Both values are baked in at build time. Unlike the AI key - which is why the
 * Cloudflare worker exists at all - the anon key is meant to be public: it says
 * which project to talk to, it does not grant access to anything. What actually
 * keeps one family's data away from another's is the row-level security in
 * supabase/schema.sql.
 */
const URL = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/**
 * Whether accounts exist in this build at all. With nothing configured the app
 * carries on exactly as it always has, with everything on this one phone, so
 * every caller has to cope with the answer being no.
 */
export function configured(): boolean {
  return URL !== '' && KEY !== '';
}

/**
 * Where the sign-in library keeps the session on the phone: its own default
 * key, worked out the way it works it out. Kept as the default rather than set,
 * so phones already signed in stay signed in.
 */
export function sessionKey(): string {
  try {
    return `sb-${new globalThis.URL(URL).hostname.split('.')[0]}-auth-token`;
  } catch {
    return '';
  }
}

let client: Promise<SupabaseClient> | null = null;

/**
 * Loaded the first time it is needed, never at startup. Most opens of the app
 * touch no network at all - it gets used at the side of a pitch - and this is
 * the largest thing that would otherwise be in the first download.
 */
export function supabase(): Promise<SupabaseClient> {
  if (!configured()) {
    throw new Error('This build has no account set up, so everything stays on this phone.');
  }
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL, KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The provider sends the browser back here with the session in the URL.
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      global: { fetch: drillFetch },
    }),
  );
  return client;
}

/**
 * Every request to the account server goes through here. With the outage
 * drill on (src/lib/drill.ts) it fails exactly the way a request does when the
 * server can't be reached - so signing in, syncing and the academy all behave
 * as they would in a real outage, and the sign-in library treats it as a
 * blip to retry, never as a reason to sign anyone out.
 */
function drillFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (drillOn()) return Promise.reject(new TypeError('Failed to fetch'));
  return fetch(input, init);
}

/**
 * Whether the account server is answering at all: its sign-in service and,
 * behind the database's API, the database itself. Any reply short of a server
 * error counts - "you're not allowed to read that" still means it's up. True
 * in a build with no account server, since there is nothing to be down.
 */
export async function pingAccountServer(timeoutMs = 8_000): Promise<boolean> {
  if (!configured()) return true;
  if (drillOn()) return false;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), timeoutMs);
  const ask = (path: string) =>
    fetch(`${URL}${path}`, { headers: { apikey: KEY }, cache: 'no-store', signal: stop.signal }).then((r) => r.status < 500);
  try {
    const [auth, data] = await Promise.all([ask('/auth/v1/health'), ask('/rest/v1/households?select=id&limit=1')]);
    return auth && data;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let settings: Promise<{ external?: Record<string, boolean> }> | null = null;

/**
 * The project's public sign-in settings - which providers are switched on.
 * Read once; anyone can read them with the public key.
 */
export function authSettings(): Promise<{ external?: Record<string, boolean> }> {
  if (!configured()) return Promise.resolve({});
  settings ??= fetch(`${URL}/auth/v1/settings`, { headers: { apikey: KEY } })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => {
      settings = null;
      return {};
    });
  return settings;
}

/** Where a provider should send the browser back to after signing in. */
export function returnAddress(): string {
  return window.location.origin + import.meta.env.BASE_URL;
}
