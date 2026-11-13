import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountFromStoredSession, describeAuthError } from './auth';

/** The messages Supabase Auth actually sends back, and what the app says instead. */
describe('describeAuthError', () => {
  it('explains an address the project cannot email yet', () => {
    expect(describeAuthError('Email address not authorized')).toMatch(/can't email that address yet/);
  });

  it('does not mistake sign-ups being off for a wrong code', () => {
    const said = describeAuthError('Signups not allowed for otp');
    expect(said).toMatch(/switched off/);
    expect(said).not.toMatch(/code did not work/);
  });

  it('says a wrong or old code did not work', () => {
    expect(describeAuthError('Token has expired or is invalid')).toMatch(/code did not work/);
  });

  it('asks to wait when codes are asked for too often', () => {
    expect(describeAuthError('email rate limit exceeded')).toMatch(/Wait a minute/);
    expect(describeAuthError('For security purposes, you can only request this after 45 seconds.')).toMatch(/Wait a minute/);
  });

  it('blames the connection, not the person, when offline', () => {
    expect(describeAuthError('Failed to fetch')).toMatch(/still saved on this phone/);
  });

  it('spots something that is not an email address', () => {
    expect(describeAuthError('Unable to validate email address: invalid format')).toMatch(/not look like an email/);
  });

  it('passes anything else through as it came', () => {
    expect(describeAuthError('Something new went wrong')).toBe('Something new went wrong');
  });
});

/** What supabase-js keeps in storage for a signed-in phone, trimmed to what matters. */
function stored(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    access_token: 'access',
    refresh_token: 'refresh',
    // Run out an hour ago: with no signal, the library can't renew it and reports nobody signed in.
    expires_at: Math.floor(Date.now() / 1000) - 3600,
    user: { id: 'user-1', email: 'sam@example.com', user_metadata: { full_name: 'Sam Smith' } },
    ...overrides,
  });
}

describe('accountFromStoredSession', () => {
  it('keeps the person signed in when the access token has only run out', () => {
    expect(accountFromStoredSession(stored())).toEqual({ id: 'user-1', email: 'sam@example.com' });
  });

  it('is nobody when nothing is stored', () => {
    expect(accountFromStoredSession(null)).toBeNull();
    expect(accountFromStoredSession('')).toBeNull();
  });

  it('is nobody for anything that is not a whole session', () => {
    expect(accountFromStoredSession('not json')).toBeNull();
    expect(accountFromStoredSession('null')).toBeNull();
    expect(accountFromStoredSession(stored({ refresh_token: undefined }))).toBeNull();
    expect(accountFromStoredSession(stored({ access_token: 42 }))).toBeNull();
    expect(accountFromStoredSession(stored({ user: null }))).toBeNull();
    expect(accountFromStoredSession(stored({ user: { id: '' } }))).toBeNull();
  });

  it('keeps nothing a provider sends beyond the id and email - no name, no picture', () => {
    const account = accountFromStoredSession(
      stored({ user: { id: 'u2', email: 'a@b.co', user_metadata: { full_name: 'A B', avatar_url: 'https://x/y.png' } } }),
    );
    expect(account).toEqual({ id: 'u2', email: 'a@b.co' });
  });
});

describe('rememberedAccount', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function load(url: string) {
    vi.stubEnv('VITE_SUPABASE_URL', url);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');
    vi.resetModules();
    return import('./auth');
  }

  it('reads the session from the key supabase-js keeps it under', async () => {
    const items = new Map([['sb-abcdefgh-auth-token', stored()]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => items.get(key) ?? null });
    const auth = await load('https://abcdefgh.supabase.co/');
    expect(auth.rememberedAccount()?.id).toBe('user-1');
  });

  it('is nobody once the session has gone from storage', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    const auth = await load('https://abcdefgh.supabase.co');
    expect(auth.rememberedAccount()).toBeNull();
  });

  it('is nobody when storage cannot be read', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    const auth = await load('https://abcdefgh.supabase.co');
    expect(auth.rememberedAccount()).toBeNull();
  });
});

describe('sessionKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is the key supabase-js itself stores the session under', async () => {
    const url = 'https://abcdefgh.supabase.co';
    vi.stubEnv('VITE_SUPABASE_URL', url);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');
    vi.resetModules();
    const { sessionKey } = await import('./supabase');
    const { createClient } = await import('@supabase/supabase-js');
    // An upgrade that moves the session would sign every phone out at the pitch.
    const client = createClient(url, 'public-anon-key', { auth: { persistSession: false, autoRefreshToken: false } });
    expect((client.auth as unknown as { storageKey: string }).storageKey).toBe(sessionKey());
  });
});
