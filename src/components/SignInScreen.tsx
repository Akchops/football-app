import { useState, type ReactNode } from 'react';
import { deleteAccount, forgetAccountOnPhone } from '../lib/account';
import { bandFor, saveGate, updateGate, useAgeGate } from '../lib/ageGate';
import { hasContent } from '../lib/sync';
import { useStore } from '../store/AppStore';
import { useSync } from '../store/SyncProvider';
import { JoinQuestionCard, SignInForm } from './AccountSettings';
import { Logo } from './Logo';
import { BusyLabel, Field, Spinner } from './ui';

/** The privacy notice, shipped with the app so it opens with no signal. */
export const PRIVACY_URL = './privacy.html';

function PrivacyLink({ children = 'privacy notice' }: { children?: ReactNode }) {
  return (
    <a href={PRIVACY_URL} target="_blank" rel="noopener">
      {children}
    </a>
  );
}

/**
 * The first screen whenever this build has accounts, and nothing else opens
 * until someone has signed in. One way in for everyone: someone new gets an
 * account from the first code, and someone coming back - a new phone, the app
 * put back on - gets their player, teams and matches with it, instead of
 * typing them all in again.
 */
export function SignInScreen() {
  const { data } = useStore();
  const gate = useAgeGate();
  const [parent, setParent] = useState(false);
  // A phone that was used before accounts came in keeps what it has.
  const hasLocal = hasContent(data);

  if (!gate) return <AgeQuestion />;
  if (gate.holder === 'child') {
    return parent ? <ParentSignIn onBack={() => setParent(false)} /> : <NeedsParent onParent={() => setParent(true)} />;
  }
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
      <p className="muted small">
        What Matchday keeps, where, and who can see it: the <PrivacyLink />.
      </p>
    </Frame>
  );
}

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'long' }));

/**
 * Asked once on each phone, of whoever is holding it, before any code is sent:
 * a plain month and year, with nothing on the screen to say what any answer
 * leads to. Only the band it falls in is kept (lib/ageGate.ts).
 */
export function AgeQuestion() {
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [checking, setChecking] = useState(false);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => thisYear - i);

  const confirm = () =>
    saveGate({ holder: bandFor(Number(year), Number(month)), parent: false, localOnly: false, recorded: [] });

  return (
    <Frame>
      <h1>When were you born?</h1>
      <p className="onboard-lead">Whoever is holding this phone. Matchday asks this once on each phone.</p>
      {checking ? (
        <>
          <p className="notice">
            Born in {MONTHS[Number(month) - 1]} {year}. Is that right?
          </p>
          <div className="button-row">
            <button className="primary-btn" onClick={confirm}>
              Yes, that&apos;s right
            </button>
            <button className="ghost-btn" onClick={() => setChecking(false)}>
              Change it
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="age-pick">
            <Field label="Month">
              <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="">Month</option>
                {MONTHS.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Year">
              <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">Year</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="button-row">
            <button className="primary-btn" disabled={!month || !year} onClick={() => setChecking(true)}>
              Continue
            </button>
          </div>
        </>
      )}
      <p className="muted small">
        It stays on this phone; an account only ever records whether its holder is an adult. See the <PrivacyLink />.
      </p>
    </Frame>
  );
}

/** Someone under 13 with no parent or guardian signed in: no account of their own. */
function NeedsParent({ onParent }: { onParent: () => void }) {
  return (
    <Frame>
      <h1>Ask a parent or guardian</h1>
      <p className="onboard-lead">
        To save your matches to an account, share them with your family or an academy, or use the coach, a parent or
        guardian signs in with their own email. They can do it now, on this phone.
      </p>
      <div className="button-row">
        <button className="primary-btn" onClick={onParent}>
          A parent or guardian is here
        </button>
      </div>
      <p className="muted small">
        Or use Matchday on this phone only. The calendar, results, stats and Wrapped all work, and nothing you put in
        leaves the phone.
      </p>
      <div className="button-row">
        <button className="ghost-btn" onClick={() => updateGate({ localOnly: true })}>
          Use it on this phone only
        </button>
      </div>
    </Frame>
  );
}

/**
 * The parent check: their own email, and a code sent to it - so the child
 * would need the parent's inbox to get past it - with what they are agreeing
 * to said first. Google sign-in is left out here: the code is the check.
 */
function ParentSignIn({ onBack }: { onBack: () => void }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <Frame>
      <h1>For a parent or guardian</h1>
      <p className="onboard-lead">
        Sign in with your own email - the code goes to you, not your child. The account is yours: it keeps your child&apos;s
        matches and stats so another phone gets them back, and nothing is shared with an academy unless you say yes.
      </p>
      <p className="muted small">
        Before you go on, read the <PrivacyLink /> - what is kept, where, who can see it, and how to delete it.
      </p>
      <label className="toggle-row consent">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          I&apos;m the parent or guardian of the player who uses this phone, I&apos;m 18 or over, and I agree to Matchday
          keeping their records as the privacy notice says.
        </span>
      </label>
      {agreed && (
        <SignInForm
          intro={false}
          allowGoogle={false}
          footnote="Your email is only for signing in. Your child never sees it."
          onSignedIn={() => updateGate({ parent: true, localOnly: false })}
        />
      )}
      <div className="button-row">
        <button className="link-btn" onClick={onBack}>
          Back
        </button>
      </div>
    </Frame>
  );
}

/**
 * A phone already signed in when the age question arrived, held by someone
 * under 13. Either the account is a parent's - who confirms it - or it is the
 * child's own, which Matchday can't keep: it is deleted, and everything on the
 * phone stays.
 */
export function ChildAccountScreen() {
  const sync = useSync();
  const email = sync.account?.email ?? 'this email';
  const [whose, setWhose] = useState<'ask' | 'parent' | 'mine'>('ask');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const removeMine = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteAccount(false);
      await forgetAccountOnPhone();
      updateGate({ localOnly: true, recorded: [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const signOutForNow = async () => {
    await forgetAccountOnPhone();
    updateGate({ localOnly: true });
    await sync.signOut();
  };

  if (whose === 'parent') {
    return (
      <Frame>
        <h1>Hand the phone to them</h1>
        <p className="onboard-lead">
          For the parent or guardian: Matchday is signed in here as <strong>{email}</strong>. The <PrivacyLink /> says
          what is kept and who can see it.
        </p>
        <label className="toggle-row consent">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            {email} is my email. I&apos;m the parent or guardian of the player who uses this phone, I&apos;m 18 or over,
            and I agree to Matchday keeping their records as the privacy notice says.
          </span>
        </label>
        <div className="button-row">
          <button className="primary-btn" disabled={!agreed} onClick={() => updateGate({ parent: true })}>
            Confirm
          </button>
          <button className="link-btn" onClick={() => setWhose('ask')}>
            Back
          </button>
        </div>
      </Frame>
    );
  }

  if (whose === 'mine') {
    return (
      <Frame>
        <h1>Your account needs to go</h1>
        <p className="onboard-lead">
          Matchday can&apos;t keep an account for someone under 13. Your account - {email}, and what is saved with it on
          Matchday&apos;s server - will be deleted.
        </p>
        <p className="muted small">
          Everything on this phone stays and keeps working. A parent or guardian can sign in with their own email
          afterwards to save it to an account again.
        </p>
        {error && <p className="notice warn">{error}</p>}
        <div className="button-row">
          <button className="danger-btn" disabled={busy} onClick={() => void removeMine()}>
            <BusyLabel busy={busy} text="Deleting…">Delete my account</BusyLabel>
          </button>
          <button className="link-btn" disabled={busy} onClick={() => setWhose('ask')}>
            Back
          </button>
        </div>
        {error && (
          <div className="button-row">
            <button className="ghost-btn" onClick={() => void signOutForNow()}>
              Sign out for now
            </button>
          </div>
        )}
      </Frame>
    );
  }

  return (
    <Frame>
      <h1>One more thing</h1>
      <p className="onboard-lead">
        Matchday is signed in on this phone as <strong>{email}</strong>. Whose email is that?
      </p>
      <div className="button-row">
        <button className="primary-btn" onClick={() => setWhose('parent')}>
          My parent&apos;s or guardian&apos;s
        </button>
        <button className="ghost-btn" onClick={() => setWhose('mine')}>
          Mine
        </button>
      </div>
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
          {sync.status === 'offline'
            ? `There's no signal, so Matchday can't check what's saved for ${email} yet.`
            : `Matchday couldn't check what's saved for ${email}: ${sync.error}`}
        </p>
        <p className="muted small">
          Used Matchday before? Try again once you have signal, and your player and matches come back.
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
      <div className="onboard-body">{children}</div>
    </div>
  );
}
