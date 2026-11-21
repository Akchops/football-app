import { useEffect, useState } from 'react';
import { ACADEMY } from '../lib/features';
import type { Person } from '../lib/syncEngine';
import { useStore } from '../store/AppStore';
import { listAllMedia } from '../store/media';
import { useSync } from '../store/SyncProvider';
import { BusyLabel, LoadingLine, Sheet } from './ui';

/**
 * How long the database's own disaster-recovery backups are kept before they
 * are written over. Nothing in the app can reach them, and nobody's account is
 * ever restored from one - but they exist, so the app says so. Keep this in
 * step with the Supabase plan (Database -> Backups) and docs/privacy.md.
 */
const BACKUP_DAYS = 7;

/** What this person's delete reaches - which decides what the steps say. */
type Scope =
  /** No account: everything is on this phone and only here. */
  | 'device'
  /** Started the family, or the only one in it: the player and every record, everywhere. */
  | 'family'
  /** Invited into someone else's family: their own account and this phone, the family's records stay. */
  | 'account';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Setup -> Your data -> Delete everything. Three steps, each its own
 * deliberate tap: what goes and from where; a last chance to keep a copy;
 * typing DELETE. Nothing is touched before the third.
 */
export function DeleteEverythingSheet({ onClose, onExport }: { onClose: () => void; onExport: () => void }) {
  const store = useStore();
  const sync = useSync();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [media, setMedia] = useState(0);
  const [typed, setTyped] = useState('');
  const [exported, setExported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signedIn = sync.available && sync.account !== null;
  const { family } = sync;

  useEffect(() => {
    listAllMedia()
      .then((items) => setMedia(items.length))
      .catch(() => setMedia(0));
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    family()
      .then((found) => live && setPeople(found.people))
      // No signal: the server decides at the end anyway, and says so then.
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [signedIn, family]);

  const me = people?.find((p) => p.isMe);
  const others = people?.filter((p) => !p.isMe) ?? [];
  const owner = people?.find((p) => p.role === 'owner' && !p.isMe);
  const scope: Scope = !signedIn ? 'device' : me && me.role !== 'owner' && others.length > 0 ? 'account' : 'family';

  const name = store.profile.name.trim() || 'the player';
  const email = sync.account?.email ?? '';

  const confirmed = typed.trim().toUpperCase() === 'DELETE';

  async function deleteNow() {
    setBusy(true);
    setError('');
    try {
      // Goes on to start the app over; nothing after this runs on success.
      await sync.deleteEverything();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const records = (
    <ul className="wipe-list">
      <li>{plural(store.matches.length, 'match', 'matches')}, with their results, stats and notes</li>
      <li>{plural(store.training.length, 'training session')}</li>
      <li>
        {plural(store.teams.length, 'team')} and {plural(store.competitions.length, 'competition')}
        {store.results.length > 0 ? `, and ${plural(store.results.length, 'other result')} for the tables` : ''}
      </li>
      <li>The profile: name, date of birth, position and photo</li>
      <li>{plural(media, 'photo or clip', 'photos and clips')} on this phone</li>
      <li>Settings, reminders and any AI keys saved here</li>
    </ul>
  );

  let body;
  let footer;

  if (step === 1) {
    body = (
      <>
        {signedIn && people === null ? (
          <LoadingLine>Checking who else this reaches…</LoadingLine>
        ) : scope === 'account' ? (
          <>
            <p>
              You were invited into {owner ? owner.email : 'someone else'}&apos;s family, so {name}&apos;s matches and
              records are the family&apos;s, not yours to delete. They stay with the family, and only{' '}
              {owner ? owner.email : 'whoever started it'} can delete them.
            </p>
            <p>What goes:</p>
            <ul className="wipe-list">
              <li>
                Your Matchday account, <strong>{email}</strong> - it is closed, not just signed out
              </li>
              <li>Everything on this phone, including {plural(media, 'photo or clip', 'photos and clips')}</li>
              <li>The copy on any other phone signed in as you, the next time it opens Matchday</li>
            </ul>
          </>
        ) : (
          <>
            <p>Everything about {name}:</p>
            {records}
            <p>From everywhere it is kept:</p>
            <ul className="wipe-list">
              <li>This phone</li>
              {scope === 'family' && (
                <>
                  <li>
                    Your Matchday account, <strong>{email}</strong> - closed, not just signed out
                  </li>
                  {others.length > 0 ? (
                    <li>
                      The family&apos;s other phones: <strong>{others.map((p) => p.email).join(', ')}</strong>{' '}
                      {others.length === 1 ? 'loses' : 'lose'} it too, and {others.length === 1 ? 'its copy is' : 'their copies are'}{' '}
                      cleared the next time {others.length === 1 ? 'it opens' : 'they open'} Matchday
                    </li>
                  ) : (
                    <li>Any other phone signed in as you, cleared the next time it opens Matchday</li>
                  )}
                  {ACADEMY && <li>Any academy&apos;s list {name} is on</li>}
                </>
              )}
            </ul>
          </>
        )}
        {signedIn && (
          <p className="muted small">
            Nothing is kept back. The database&apos;s own emergency backups - which nobody can open from the app - are
            written over within {BACKUP_DAYS} days.
          </p>
        )}
      </>
    );
    footer = (
      <>
        <button className="ghost-btn wide" onClick={onClose}>
          Cancel
        </button>
        <button className="primary-btn wide" disabled={signedIn && people === null} onClick={() => setStep(2)}>
          Continue
        </button>
      </>
    );
  } else if (step === 2) {
    body = (
      <>
        <p>
          <strong>Once it is deleted, nobody can bring it back</strong> - not you, not your family, not Matchday.
        </p>
        {scope !== 'account' && (
          <>
            <p>
              If you might want it one day, download a backup file first and keep it somewhere safe. It holds the
              matches, training and profile; photos and clips are not in it.
            </p>
            <div className="button-row">
              <button
                className="ghost-btn"
                onClick={() => {
                  onExport();
                  setExported(true);
                }}
              >
                Download a backup
              </button>
            </div>
            {exported && <p className="notice">Backup downloaded.</p>}
          </>
        )}
      </>
    );
    footer = (
      <>
        <button className="ghost-btn wide" onClick={() => setStep(1)}>
          Back
        </button>
        <button className="primary-btn wide" onClick={() => setStep(3)}>
          {exported || scope === 'account' ? 'Continue' : 'Continue without one'}
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p>
          Last step. Type <strong>DELETE</strong> and tap the button, and{' '}
          {scope === 'account' ? 'your account and this phone’s copy are' : 'everything listed is'} deleted for good,
          straight away.
        </p>
        <input
          className="input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="DELETE"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Type DELETE here"
          disabled={busy}
          onKeyDown={(e) => e.key === 'Enter' && confirmed && !busy && void deleteNow()}
        />
        {error && <p className="notice warn">{error}</p>}
      </>
    );
    footer = (
      <>
        <button className="ghost-btn wide" disabled={busy} onClick={() => setStep(2)}>
          Back
        </button>
        <button className="primary-btn danger wide" disabled={!confirmed || busy} onClick={() => void deleteNow()}>
          <BusyLabel busy={busy} text="Deleting…">
            {scope === 'account' ? 'Delete my account' : 'Delete everything'}
          </BusyLabel>
        </button>
      </>
    );
  }

  const titles = { 1: 'What will be deleted', 2: 'Keep a copy first?', 3: 'Type DELETE to confirm' } as const;

  return (
    <Sheet
      open
      title={titles[step]}
      subtitle={`Step ${step} of 3 · Delete everything`}
      onClose={busy ? () => {} : onClose}
      dismissible={!busy}
      footer={footer}
    >
      {body}
    </Sheet>
  );
}
