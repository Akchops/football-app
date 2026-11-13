import { useCallback, useEffect, useState } from 'react';
import { deleteAccount, wipePhone } from '../lib/account';
import { childOnly, updateGate, useAgeGate } from '../lib/ageGate';
import { describeAuthError, googleAvailable, sendCode, signInWithGoogle, verifyCode } from '../lib/auth';
import type { Invite, Person, SentInvite } from '../lib/syncEngine';
import { useStore } from '../store/AppStore';
import { useSync, type SyncValue } from '../store/SyncProvider';
import { BusyLabel, Field, LoadingLine, Section } from './ui';

/**
 * Signing in, and the family this phone shares with. Hidden entirely until the
 * build has an account backend - a section that can only say "not set up" is
 * half a feature on show.
 */
export function AccountSection() {
  const sync = useSync();
  const gate = useAgeGate();
  if (!sync.available) return null;

  if (!sync.account && childOnly(gate)) {
    return (
      <Section title="Sharing with your family">
        <p className="muted small">
          Everything is on this phone only - nothing leaves it. A parent or guardian can sign in with their own email to
          save it to an account, share it with the family, and switch on the coach and reminders.
        </p>
        <div className="button-row">
          <button className="ghost-btn" onClick={() => updateGate({ localOnly: false })}>
            A parent or guardian is here
          </button>
        </div>
      </Section>
    );
  }

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

/** Email, then code. The sign-in screen the app opens on, and the same form in Setup and the academy area. */
export function SignInForm({
  intro = true,
  footnote = 'Everything on this phone stays where it is when you sign in.',
  onSignedIn,
  allowGoogle = true,
}: {
  intro?: boolean;
  footnote?: string;
  /** Straight after the code is accepted. */
  onSignedIn?: () => void;
  /** Off where the code itself is the check - Google sign-in leaves the page and comes back without it. */
  allowGoogle?: boolean;
}) {
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
      await sendCode(email);
      setCode('');
      setStage('code');
    });

  const verify = () =>
    run(async () => {
      await verifyCode(email, code);
      onSignedIn?.();
    });

  return (
    <>
      {error && <p className="notice warn">{error}</p>}

      {stage === 'email' ? (
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

      {google && allowGoogle && stage === 'email' && (
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

      <DeleteAccount people={people} />
    </>
  );
}

/**
 * Deleting the account, from the account itself - not an email to ask for it.
 * What goes is said before anything happens, and nothing is deleted until the
 * last button; the server then does it all or none of it.
 */
function DeleteAccount({ people }: { people: Person[] }) {
  const { profile, clearAllData } = useStore();
  const [open, setOpen] = useState(false);
  const [everything, setEverything] = useState(false);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const me = people.find((p) => p.isMe);
  const others = people.filter((p) => !p.isMe);
  const owner = me?.role === 'owner';
  const name = profile.name.trim() || 'the player';
  // Who else is in the family comes from the server; until it has, say what the server will decide.
  const known = me !== undefined;
  const recordsGo = known && (others.length === 0 || (owner && everything));

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteAccount(owner && everything);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      return;
    }
    clearAllData();
    await wipePhone();
    window.location.reload();
  };

  if (!open) {
    return (
      <div className="button-row">
        <button className="danger-link" onClick={() => setOpen(true)}>
          Delete my account
        </button>
      </div>
    );
  }

  return (
    <div className="detail-block delete-account">
      <p>
        <strong>Delete your account?</strong>
      </p>
      <p className="small">
        This deletes your email address and username from Matchday&apos;s server
        {!known
          ? `, and ${name}'s profile and photo, matches, training, teams, competitions, tables and settings with them - unless others in your family share them, who keep them. Any academy ${name} is linked to stops seeing them straight away.`
          : recordsGo
            ? `, and ${name}'s profile and photo, matches, training, teams, competitions, tables and settings with them. Any academy ${name} is linked to stops seeing them straight away and keeps only the name on its list, marked as left.`
            : `. ${others.map((p) => p.email).join(', ')} ${others.length === 1 ? 'keeps' : 'keep'} ${name}'s records.`}{' '}
        It also clears this phone: the records, photos and clips, and any AI key. It can&apos;t be undone - to keep a
        copy, use Export backup under Your data first.
      </p>
      {owner && others.length > 0 && (
        <div className="choice-list">
          <label className="toggle-row">
            <input type="radio" name="delete-scope" checked={!everything} onChange={() => setEverything(false)} />
            <span>Just my account - the family keeps {name}&apos;s records</span>
          </label>
          <label className="toggle-row">
            <input type="radio" name="delete-scope" checked={everything} onChange={() => setEverything(true)} />
            <span>Everything - delete {name}&apos;s records for the whole family too</span>
          </label>
        </div>
      )}
      <label className="toggle-row consent">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        <span>I understand this can&apos;t be undone.</span>
      </label>
      {error && <p className="notice warn">{error}</p>}
      <div className="button-row">
        <button className="danger-btn" disabled={busy || !sure} onClick={() => void remove()}>
          <BusyLabel busy={busy} text="Deleting…">Delete my account</BusyLabel>
        </button>
        <button className="ghost-btn" disabled={busy} onClick={() => setOpen(false)}>
          Keep it
        </button>
      </div>
    </div>
  );
}
