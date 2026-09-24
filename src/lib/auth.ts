import { configured, returnAddress, supabase } from './supabase';

/** Somebody signed in. Not the player - the person holding the phone. */
export interface Account {
  id: string;
  email: string;
  /** Whatever the provider gave us, falling back to the email. */
  name: string;
}

/** Whether signing in is possible in this build. */
export function accountsAvailable(): boolean {
  return configured();
}

interface RawUser {
  id: string;
  email?: string | null;
  user_metadata?: { full_name?: string; name?: string } | null;
}

function toAccount(user: RawUser | null | undefined): Account | null {
  if (!user) return null;
  const email = user.email ?? '';
  const meta = user.user_metadata ?? {};
  return { id: user.id, email, name: meta.full_name || meta.name || email };
}

/**
 * Who is signed in, or null. Resolves from the session already in storage, so it
 * works with no signal - which matters, because the app is mostly opened
 * somewhere with none.
 */
export async function currentAccount(): Promise<Account | null> {
  if (!configured()) return null;
  try {
    const { data } = await (await supabase()).auth.getSession();
    return toAccount(data.session?.user);
  } catch {
    // Offline, or the backend is unreachable. Not being able to check is not the
    // same as being signed out, but there is nothing better to report.
    return null;
  }
}

/**
 * Hands off to Google and comes back to the app. Apple would be one more line
 * here, but it needs a paid Apple developer account, so it is not wired up yet.
 */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await (await supabase()).auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: returnAddress() },
  });
  if (error) throw new Error(describeAuthError(error.message));
}

/**
 * Signs out of the account only. Everything already on this phone stays exactly
 * where it is - signing out is not a way to lose a season of matches.
 */
export async function signOut(): Promise<void> {
  const { error } = await (await supabase()).auth.signOut();
  if (error) throw new Error(describeAuthError(error.message));
}

/**
 * Calls back whenever somebody signs in or out, including when the browser comes
 * back from the provider. Returns the unsubscribe.
 */
export function onAccountChange(listener: (account: Account | null) => void): () => void {
  if (!configured()) return () => {};

  let unsubscribe: (() => void) | null = null;
  let dropped = false;

  void supabase()
    .then((client) => {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(toAccount(session?.user));
      });
      // Unsubscribed before the client finished loading.
      if (dropped) data.subscription.unsubscribe();
      else unsubscribe = () => data.subscription.unsubscribe();
    })
    .catch(() => {
      // Nothing to listen to; the caller already handles being signed out.
    });

  return () => {
    dropped = true;
    unsubscribe?.();
  };
}

/** Provider errors are written for developers. These are for whoever is holding the phone. */
export function describeAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('failed to fetch') || text.includes('network')) {
    return 'Could not reach the account server. Everything is still saved on this phone.';
  }
  if (text.includes('provider is not enabled')) {
    return 'Google sign-in has not been switched on for this project yet.';
  }
  if (text.includes('redirect')) {
    return 'This address has not been allowed for sign-in yet. Add it in the project settings.';
  }
  return message || 'Sign-in did not work. Try again.';
}
