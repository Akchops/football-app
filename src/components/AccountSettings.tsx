import { useCallback, useEffect, useState } from 'react';
import { describeAuthError, googleAvailable, sendCode, signInWithGoogle, verifyCode } from '../lib/auth';
import { ACCOUNT_MIN_AGE, oldEnoughForAccount, todayISO } from '../lib/date';
import type { Invite, Person, SentInvite } from '../lib/syncEngine';
import { useSync, type SyncValue } from '../store/SyncProvider';
import { BusyLabel, Field, LoadingLine, Section } from './ui';

/**
 * Signing in, and the family this phone shares with. Hidden entirely until the
 * build has an account backend - a section that can only say "not set up" is
 * half a feature on show.
 */
export function AccountSection() {
  const sync = useSync();
  if (!sync.available) return null;

  return (
    <Section title="Sharing with your family">
      {sync.account ? (
        <SignedIn sync={sync} />
      ) : sync.status === 'checking' ? (
        <LoadingLine>Checking your account…</LoadingLine>
      ) : (
        <SignInForm />
      )}
    </Section>
  );
}

function message(e: unknown): string {
  return describeAuthError(e instanceof Error ? e.message : String(e));
}

/**
 * Asked before anyone gives an email, so nobody under 13 makes an account of
 * their own. Remembered for this visit only - so a sign-out and back in doesn't
 * ask twice - and only that the answer was 13 or over: never the date itself.
 */
const AGE_CHECKED_KEY = 'matchday.signInAge.v1';

function ageCheckedThisVisit(): boolean {
  try {
    return sessionStorage.getItem(AGE_CHECKED_KEY) === 'ok';
  } catch {
    return false;
  }
}

function rememberAgeChecked() {
  try {
    sessionStorage.setItem(AGE_CHECKED_KEY, 'ok');
  } catch {
    // Private mode and the like: it's asked again next time, which is fine.
  }
}

/**
 * Date of birth, then email, then code. The sign-in screen the app opens on,
 * and the same form in Setup and the academy area.
 */
export function SignInForm({
  intro = true,
  footnote = 'Everything on this phone stays where it is when you sign in.',
}: {
  intro?: boolean;
  footnote?: string;
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'age' | 'under13' | 'email' | 'code'>(() =>
    ageCheckedThisVisit() ? 'email' : 'age',
  );
  const [dob, setDob] = useState('');
  const [grownUp, setGrownUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    let live = true;
    void googleAvailable().then((on) => live && setGoogle(on));
    return () => {
      live = false;
    };
  }, []);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const send = () =>
    run(async () => {
      await sendCode(email);
      setCode('');
      setStage('code');
    });

  const verify = () => run(() => verifyCode(email, code));

  const checkAge = () => {
    const ok = oldEnoughForAccount(dob);
    if (ok === null) return setError("That date of birth doesn't look right - check the year.");
    setError('');
    setDob('');
    if (!ok) return setStage('under13');
    rememberAgeChecked();
    setStage('email');
  };

  return (
    <>
      {error && <p className="notice warn">{error}</p>}

      {stage === 'age' ? (
        <>
          <Field
            label={grownUp ? "Parent or guardian's date of birth" : 'Your date of birth'}
            hint={
              grownUp
                ? "Yours, not the player's - theirs comes after signing in. It isn't saved."
                : "Whoever is signing in. Setting this up for your child? Put yours - theirs comes next. It isn't saved."
            }
          >
            <input
              className="input"
              type="date"
              max={todayISO()}
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && dob && checkAge()}
            />
          </Field>
          <div className="button-row">
            <button className="primary-btn" disabled={!dob} onClick={checkAge}>
              Continue
            </button>
          </div>
        </>
      ) : stage === 'under13' ? (
        <>
          <p className="notice">
            Players under {ACCOUNT_MIN_AGE} use Matchday with a parent or guardian. Ask yours to sign in here with their
            own email - they set you up as the player, and you use it together.
          </p>
          <div className="button-row">
            <button
              className="ghost-btn"
              onClick={() => {
                setGrownUp(true);
                setStage('age');
              }}
            >
              A parent or guardian is here
            </button>
          </div>
        </>
      ) : stage === 'email' ? (
        <>
          {intro && (<p className="muted small">
            Sign in and everyone in the family sees the same calendar - add a training session on one phone and it
            turns up on the others. A lost or wiped phone stops meaning a lost season.
          </p>)}
          <Field label="Your email">
            <input
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email.includes('@') && !busy && void send()}
            />
          </Field>
          <div className="button-row">
            <button className="primary-btn" disabled={busy || !email.includes('@')} onClick={() => void send()}>
              <BusyLabel busy={busy} text="Sending…">Email me a code</BusyLabel>
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="notice">A code is on its way to {email.trim()}. It can take a minute - check spam too.</p>
          <Field label="Code from the email">
            <input
              className="input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && code.length >= 6 && !busy && void verify()}
            />
          </Field>
          <div className="button-row">
            <button className="primary-btn" disabled={busy || code.length < 6} onClick={() => void verify()}>
              <BusyLabel busy={busy} text="Signing in…">Sign in</BusyLabel>
            </button>
          </div>
          <div className="button-row">
            <button className="link-btn" disabled={busy} onClick={() => void send()}>
              Send a new code
            </button>
            <button className="link-btn" disabled={busy} onClick={() => setStage('email')}>
              Use a different email
            </button>
          </div>
        </>
      )}

      {google && stage === 'email' && (
        <>
          <div className="button-row">
            <button className="ghost-btn" disabled={busy} onClick={() => void run(signInWithGoogle)}>
              Continue with Google
            </button>
          </div>
          <p className="muted small">
            On an iPhone, if the app is on your home screen, use the email code instead - Google sign-in finishes in
            Safari there rather than in the app.
          </p>
        </>
      )}

      <p className="muted small">{footnote}</p>
    </>
  );
}

function statusLine(sync: SyncValue): string {
  switch (sync.status) {
    case 'syncing':
      return 'Syncing…';
    case 'synced':
      return sync.lastSynced
        ? `Synced at ${new Date(sync.lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : 'Synced';
    case 'offline':
      return 'No signal - everything is saved on this phone and will sync when you are back.';
    case 'error':
      return `Could not sync: ${sync.error}`;
    default:
      return '';
  }
}

/** Asked once, when a phone with its own matches joins a family that has some too. */
export function JoinQuestionCard({ sync }: { sync: SyncValue }) {
  const question = sync.joinQuestion;
  if (!question) return null;
  return (
    <div className="detail-block">
      <p>
        <strong>This phone already has {question.localMatches} match{question.localMatches === 1 ? '' : 'es'}.</strong>{' '}
        {question.householdName} has its own. What should happen to this phone&apos;s?
      </p>
      <div className="button-row">
        <button className="primary-btn" onClick={() => sync.answerJoin('merge')}>
          Add them to the family&apos;s
        </button>
        <button className="ghost-btn" onClick={() => sync.answerJoin('replace')}>
          Use the family&apos;s only
        </button>
      </div>
      <p className="muted small">Using the family&apos;s only keeps a copy of this phone&apos;s, just in case.</p>
    </div>
  );
}

function SignedIn({ sync }: { sync: SyncValue }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [invites, setInvites] = useState<SentInvite[]>([]);
  const [mine, setMine] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const { family, household } = sync;
  const refresh = useCallback(async () => {
    try {
      const found = await family();
      setPeople(found.people);
      setInvites(found.invites);
      setMine(found.mine);
    } catch {
      // The list is a nicety; sync status already says if the server is unreachable.
    }
  }, [family]);

  useEffect(() => {
    if (household) void refresh();
  }, [household, refresh]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await work();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const invite = () =>
    run(async () => {
      const address = email.trim().toLowerCase();
      await sync.invite(address);
      setEmail('');
      setNote(
        `Invited. On their phone, they open Matchday and sign in with ${address}, and the family's matches come up.`,
      );
      await refresh();
    });

  const line = statusLine(sync);

  return (
    <>
      <JoinQuestionCard sync={sync} />

      {mine.map((invite) => (
        <div key={invite.id} className="detail-block">
          <p>
            <strong>{invite.invitedBy || 'Someone'}</strong> invited you to join <strong>{invite.householdName}</strong>.
          </p>
          <div className="button-row">
            <button
              className="primary-btn"
              disabled={busy}
              onClick={() => void run(async () => {
                await sync.joinInvite(invite.id);
                setMine([]);
              })}
            >
              Join
            </button>
          </div>
        </div>
      ))}

      {error && <p className="notice warn">{error}</p>}
      {note && <p className="notice">{note}</p>}
      {line && <p className={sync.status === 'error' ? 'notice warn' : 'muted small'}>{line}</p>}

      <p className="small">
        Signed in as <strong>{sync.account?.email}</strong>
        {household ? ` · ${household.name}` : ''}
      </p>

      {(people.length > 0 || invites.length > 0) && (
        <ul className="family-list">
          {people.map((person) => (
            <li key={person.email}>
              <span>
                {person.email}
                {person.isMe ? ' (you)' : ''}
              </span>
              <span className="muted small">{person.role === 'owner' ? 'Started it' : 'Family'}</span>
            </li>
          ))}
          {invites.map((sent) => (
            <li key={sent.id}>
              <span>{sent.email}</span>
              <span className="muted small">
                Invited ·{' '}
                <button
                  className="link-btn"
                  disabled={busy}
                  onClick={() => void run(async () => {
                    await sync.cancelInvite(sent.id);
                    await refresh();
                  })}
                >
                  cancel
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {household && (
        <>
          <Field label="Invite someone" hint="Mum, dad, a coach - anyone who should see the matches">
            <input
              className="input"
              type="email"
              autoComplete="off"
              inputMode="email"
              placeholder="their email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email.includes('@') && !busy && void invite()}
            />
          </Field>
          <div className="button-row">
            <button className="primary-btn" disabled={busy || !email.includes('@')} onClick={() => void invite()}>
              Invite
            </button>
          </div>
        </>
      )}

      <div className="button-row">
        <button className="ghost-btn" disabled={sync.status === 'syncing'} onClick={() => sync.syncNow()}>
          Sync now
        </button>
        <button className="ghost-btn" disabled={busy} onClick={() => void run(sync.signOut)}>
          Sign out
        </button>
      </div>
      <p className="muted small">
        Match photos and clips stay on each phone. Signing out goes back to the sign-in screen; everything on this phone
        stays as it is.
      </p>
    </>
  );
}
