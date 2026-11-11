import type { ReactNode } from 'react';
import { hasContent } from '../lib/sync';
import { useStore } from '../store/AppStore';
import { useStatus } from '../store/StatusProvider';
import { useSync } from '../store/SyncProvider';
import { JoinQuestionCard, SignInForm } from './AccountSettings';
import { Logo } from './Logo';
import { StatusBanner } from './StatusBanner';
import { Spinner } from './ui';

/**
 * The first screen whenever this build has accounts, and nothing else opens
 * until someone has signed in. One way in for everyone: someone new gets an
 * account from the first code, and someone coming back - a new phone, the app
 * put back on - gets their player, teams and matches with it, instead of
 * typing them all in again.
 */
export function SignInScreen() {
  const { data } = useStore();
  // A phone that was used before accounts came in keeps what it has.
  const hasLocal = hasContent(data);
  return (
    <Frame>
      <h1>Sign in to Matchday</h1>
      <p className="onboard-lead">
        {hasLocal
          ? 'Everything on this phone stays where it is. Signing in saves it to your account, so another phone gets it all back by signing in.'
          : 'New here? Enter your email and the code we send makes your account. Used Matchday before? Use the same email and your player, teams and matches come straight back.'}
      </p>
      <SignInForm
        intro={false}
        footnote="No password - a code by email, once on each phone. Your email is only for signing in."
      />
    </Frame>
  );
}

/**
 * Straight after signing in: finding out whether the account already has a
 * player, so someone coming back never sets one up again. Over in a moment
 * with signal; with none, it says so and lets them carry on.
 */
export function CheckingAccount({ onCarryOn }: { onCarryOn: () => void }) {
  const sync = useSync();
  const serverDown = useStatus().health === 'outage';
  const { profile } = useStore();
  const email = sync.account?.email ?? '';
  const different = (
    <button className="link-btn" onClick={() => void sync.signOut()}>
      Use a different email
    </button>
  );

  if (sync.joinQuestion) {
    return (
      <Frame>
        <h1>One thing first</h1>
        <JoinQuestionCard sync={sync} />
      </Frame>
    );
  }

  if (sync.status === 'offline' || sync.status === 'error') {
    return (
      <Frame>
        <h1>Couldn&apos;t reach your account</h1>
        <p className="onboard-lead">
          {serverDown
            ? `Matchday's server isn't answering, so it can't check what's saved for ${email} yet.`
            : sync.status === 'offline'
            ? `There's no signal, so Matchday can't check what's saved for ${email} yet.`
            : `Matchday couldn't check what's saved for ${email}: ${sync.error}`}
        </p>
        <p className="muted small">
          Used Matchday before? Try again once {serverDown ? "it's back" : 'you have signal'}, and your player and
          matches come back.
        </p>
        <div className="button-row">
          <button className="primary-btn" onClick={() => sync.syncNow()}>
            Try again
          </button>
          <button className="ghost-btn" onClick={onCarryOn}>
            {profile.onboardedAt ? "Carry on with this phone's matches" : 'Set up a new player'}
          </button>
        </div>
        {different}
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="reading-state" role="status">
        <Spinner />
        <p className="muted small">Looking for your matches…</p>
        <p className="muted small">Signed in as {email}</p>
      </div>
    </Frame>
  );
}

/** While the phone works out whether anyone has signed in on it - a moment at most. */
export function OpeningSplash() {
  return (
    <Frame>
      <div className="reading-state" role="status">
        <Spinner />
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="onboarding">
      <div className="onboard-top">
        <div className="onboard-brand">
          <Logo />
          Matchday
        </div>
      </div>
      <div className="onboard-body">
        {/* Signing in is the one thing here that needs the server, so say so when it's down. */}
        <StatusBanner />
        {children}
      </div>
    </div>
  );
}
