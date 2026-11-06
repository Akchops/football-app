import { useCallback, useEffect, useState } from 'react';
import { describeAuthError, googleAvailable, sendCode, signInWithGoogle, verifyCode } from '../lib/auth';
import { ADULT_AGE, MIN_AGE, ageFromBirthMonth, rememberUnder13, rememberedUnder13, type AgeRecord } from '../lib/ageCheck';
import { MONTH_NAMES, ageOn } from '../lib/date';
import { useStore } from '../store/AppStore';
import type { Invite, Person, SentInvite } from '../lib/syncEngine';
import { useSync, type SyncValue } from '../store/SyncProvider';
import { Field, Section } from './ui';

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
        <p className="muted small">Checking…</p>
      ) : (
        <SignInForm />
      )}
    </Section>
  );
}

function message(e: unknown): string {
  return describeAuthError(e instanceof Error ? e.message : String(e));
}

/** Years a birth year can be picked from, newest first. */
const BIRTH_YEARS = Array.from({ length: 101 }, (_, i) => new Date().getFullYear() - i);

/**
 * Age, then email, then code. Used in Setup, on the first setup screen for
 * joining, and to open the academy area. The age comes first because making
 * an account is when a player's records start leaving the phone - see
 * lib/ageCheck.ts.
 */
export function SignInForm({
  intro = true,
  footnote = 'Nothing leaves this phone until you sign in, and the app works exactly as it does now if you never do.',
  purpose = 'family',
}: {
  intro?: boolean;
  footnote?: string;
  /** Sharing a player's records with the family, or the academy area, which is for staff. */
  purpose?: 'family' | 'academy';
}) {
  const { profile } = useStore();
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  // An adult signing in on a younger player's phone: a parent for sharing, staff for the academy.
  const [adult, setAdult] = useState(false);
  const [consent, setConsent] = useState(false);
  const [under13, setUnder13] = useState(() => rememberedUnder13());
  const age = month && year ? ageFromBirthMonth(Number(month), Number(year)) : null;
  const who = profile.name.trim() || 'the player';
  // Sharing sends this phone's player's records, so their age counts too, when the profile has it.
  const playerAge = purpose === 'family' && profile.dateOfBirth ? ageOn(profile.dateOfBirth, new Date()) : null;
  const playerUnder13 = playerAge !== null && playerAge < MIN_AGE;
  // A teenager can't sign in with a younger child's records; an adult who does is taken as their parent.
  const needsParent = playerUnder13 && !adult && age !== null && age >= MIN_AGE && age < ADULT_AGE;
  const forChild = purpose === 'family' && (adult || (playerUnder13 && age !== null && age >= ADULT_AGE));

  useEffect(() => {
    if (!adult && age !== null && age < MIN_AGE) {
      rememberUnder13();
      setUnder13(true);
    }
  }, [age, adult]);

  const ageOk =
    age !== null &&
    (forChild
      ? age >= ADULT_AGE && consent
      : adult
        ? age >= ADULT_AGE
        : !under13 && !needsParent && age >= MIN_AGE);
  const ageRecord = (): AgeRecord => ({ signed_in_by: forChild ? 'parent' : 'self', checked_at: new Date().toISOString() });

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
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
      await sendCode(email, ageRecord());
      setCode('');
      setStage('code');
    });

  const verify = () => run(() => verifyCode(email, code));

  return (
    <>
      {error && <p className="notice warn">{error}</p>}

      {stage === 'email' ? (
        <>
          {intro && (<p className="muted small">
            Optional. Sign in and everyone in the family sees the same calendar - add a training session on one phone
            and it turns up on the others. A lost or wiped phone stops meaning a lost season.
          </p>)}
          {under13 && !adult ? (
            <div className="detail-block" role="status">
              <p>
                {purpose === 'academy'
                  ? "The academy area is for coaches and staff. Players join their academy from their own Matchday - with a parent or guardian if they're under 13."
                  : "You'll need a parent or guardian for this. Ask them to sign in here with their own email. Matchday keeps working on this phone in the meantime - it just doesn't share."}
              </p>
              <div className="button-row">
                <button
                  className="ghost-btn"
                  onClick={() => {
                    setAdult(true);
                    setMonth('');
                    setYear('');
                  }}
                >
                  {purpose === 'academy' ? 'An adult is signing in' : "I'm their parent or guardian"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {adult && (
                <p className="notice">
                  {forChild
                    ? `Signing in as ${who}'s parent or guardian - put in your own details.`
                    : 'Signing in as an adult - put in your own details.'}
                </p>
              )}
              <Field group label="When were you born?" hint="Month and year. It isn't kept.">
                <div className="row two">
                  <select className="input" aria-label="Month you were born" value={month} onChange={(e) => setMonth(e.target.value)}>
                    <option value="">Month</option>
                    {MONTH_NAMES.map((name, i) => (
                      <option key={name} value={i + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select className="input" aria-label="Year you were born" value={year} onChange={(e) => setYear(e.target.value)}>
                    <option value="">Year</option>
                    {BIRTH_YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>
              {needsParent && (
                <p className="form-error">
                  {who} is under 13, going by the date of birth in this profile, so a parent or guardian needs to sign
                  in here with their own email.
                </p>
              )}
              {adult && age !== null && age < ADULT_AGE && (
                <p className="form-error">
                  {forChild ? 'A parent or guardian signing in needs to be 18 or over.' : 'Whoever signs in here needs to be 18 or over.'}
                </p>
              )}
              {forChild && (
                <label className="toggle-row consent">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>
                    I&apos;m {who}&apos;s parent or guardian, and I agree to their football records - profile, matches, stats
                    and training - being kept with this account so the family&apos;s phones stay in step.
                  </span>
                </label>
              )}
            </>
          )}
          {ageOk && (
            <>
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
                  {busy ? 'Sending…' : 'Email me a code'}
                </button>
              </div>
            </>
          )}
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
              {busy ? 'Signing in…' : 'Sign in'}
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

      {google && stage === 'email' && ageOk && (
        <>
          <div className="button-row">
            <button className="ghost-btn" disabled={busy} onClick={() => void run(() => signInWithGoogle(ageRecord()))}>
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
        `Invited. On their phone, they open Matchday and sign in with ${address} - on a new phone, from "Joining your family?" on the first screen; otherwise from Setup.`,
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
        Match photos and clips stay on each phone. Signing out keeps everything on this phone as it is.
      </p>
    </>
  );
}
