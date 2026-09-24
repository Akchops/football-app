import type { SupabaseClient } from '@supabase/supabase-js';

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
    }),
  );
  return client;
}

/** Where a provider should send the browser back to after signing in. */
export function returnAddress(): string {
  return window.location.origin + import.meta.env.BASE_URL;
}
