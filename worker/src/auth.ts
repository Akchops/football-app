/**
 * Who is asking the Coach.
 *
 * The Origin header proves nothing - any script can send the app's - so on its
 * own it let anyone with the worker's address spend the shared Gemini quota,
 * forty requests at a time per address they could get. Now a request has to
 * carry a Matchday sign-in, which Supabase checks, and each account gets the
 * daily allowance rather than each address.
 */

export interface AuthEnv {
  GEMINI_API_KEY: string;
  /** The app's Supabase project. Unset only for a build with no accounts at all. */
  SUPABASE_URL?: string;
  /** Its public anon key, which Supabase's auth API wants alongside a token. */
  SUPABASE_ANON_KEY?: string;
}

export type Caller =
  /** A signed-in Matchday account. */
  | { kind: 'account'; id: string }
  /** The "Check AI proxy" workflow (worker/scripts/check-ai.mjs). */
  | { kind: 'check' }
  /** A deployment with no accounts, counted by address as before. */
  | { kind: 'anyone' };

export type Refusal = { status: number; error: string };

/** Header the check workflow sends: a hash of the Gemini key, which it holds as a secret too. */
export const CHECK_HEADER = 'x-matchday-check';

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * What the check workflow sends. Holding the Gemini key already means being able
 * to call Gemini directly, so this lets nobody do anything they couldn't before.
 */
export async function checkToken(geminiKey: string): Promise<string> {
  return hex(await sha256(`matchday-check:${geminiKey}`));
}

/** Compares by hashing both sides first, so the time taken says nothing about how much matched. */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function whoIsAsking(request: Request, env: AuthEnv): Promise<Caller | Refusal> {
  const check = request.headers.get(CHECK_HEADER);
  if (check && env.GEMINI_API_KEY && (await sameSecret(check, await checkToken(env.GEMINI_API_KEY)))) {
    return { kind: 'check' };
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return { kind: 'anyone' };

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) {
    return { status: 401, error: 'Sign in to Matchday to use the free coach, or add your own free Gemini key in Setup.' };
  }

  let response: Response;
  try {
    response = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
    });
  } catch {
    return { status: 503, error: "The coach couldn't check your sign-in just now. Try again in a minute." };
  }
  if (response.status === 401 || response.status === 403) {
    return { status: 401, error: 'Your sign-in has run out. Close and reopen Matchday, or sign out and in again.' };
  }
  if (!response.ok) {
    return { status: 503, error: "The coach couldn't check your sign-in just now. Try again in a minute." };
  }
  const user = (await response.json().catch(() => null)) as { id?: unknown } | null;
  if (!user || typeof user.id !== 'string' || !user.id) {
    return { status: 401, error: 'Your sign-in has run out. Close and reopen Matchday, or sign out and in again.' };
  }
  return { kind: 'account', id: user.id };
}
