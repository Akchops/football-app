import { useEffect, useState } from 'react';
import {
  accountsAvailable, currentAccount, describeAuthError, onAccountChange, signInWithGoogle, signOut,
  type Account,
} from '../lib/auth';
import { Section } from './ui';

/**
 * Who is signed in, kept in step with the account backend. Null means signed
 * out, and so does "we could not check" - the app behaves the same either way,
 * which is what keeps it working with no signal.
 */
export function useAccount(): { account: Account | null; checked: boolean } {
  const [account, setAccount] = useState<Account | null>(null);
  const [checked, setChecked] = useState(!accountsAvailable());

  useEffect(() => {
    if (!accountsAvailable()) return;
    let live = true;

    void currentAccount().then((found) => {
      if (!live) return;
      setAccount(found);
      setChecked(true);
    });

    // Also fires when the browser comes back from Google with a new session.
    const stop = onAccountChange((found) => {
      if (!live) return;
      setAccount(found);
      setChecked(true);
    });

    return () => {
      live = false;
      stop();
    };
  }, []);

  return { account, checked };
}

export function AccountSection() {
  const { account, checked } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Until a backend is configured there is nothing to sign in to, and a section
  // that can only say so is half a feature on show. It stays out of sight.
  if (!accountsAvailable()) return null;

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(describeAuthError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Sharing with your family">
      {error && <p className="notice warn">{error}</p>}

      {!checked ? (
        <p className="muted small">Checking…</p>
      ) : account ? (
        <>
          <p className="notice">
            Signed in as <strong>{account.name}</strong>
            {account.name !== account.email && ` (${account.email})`}
          </p>
          <p className="muted small">
            Matches and training are kept on this phone and backed up to your account, so the same season shows up
            wherever you sign in. Photos and clips stay on this phone for now — they are not part of it.
          </p>
          <div className="button-row">
            <button className="ghost-btn" disabled={busy} onClick={() => void run(signOut)}>
              {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
          <p className="muted small">
            Signing out leaves everything already on this phone exactly where it is.
          </p>
        </>
      ) : (
        <>
          <p className="muted small">
            Optional. Signing in does two things: it means a lost or wiped phone no longer means a lost season, and it
            lets the people who take you to matches see the same calendar. Add a training session on one phone and it
            turns up on the others.
          </p>
          <div className="button-row">
            <button className="primary-btn" disabled={busy} onClick={() => void run(signInWithGoogle)}>
              {busy ? 'Opening Google…' : 'Sign in with Google'}
            </button>
          </div>
          <p className="muted small">
            Google only for now — Sign in with Apple needs a paid Apple developer account. Nothing is uploaded until
            you sign in, and the app works exactly as it does today if you never do.
          </p>
        </>
      )}
    </Section>
  );
}
