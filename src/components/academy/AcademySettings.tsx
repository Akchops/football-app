import { useLayoutEffect, useState } from 'react';
import { ROLE_LABEL, can, describeAcademyError, type AcademyDetails, type StaffAcademy } from '../../lib/academy';
import { useAcademy } from '../../store/AcademyProvider';
import { useSync } from '../../store/SyncProvider';
import { Section } from '../ui';
import { AcademyDetailsFields, detailsOf, detailsProblem } from './AcademyDetails';
import { UsernameForm } from './UsernameForm';

function same(a: AcademyDetails, b: AcademyDetails): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The academy's details, the person's own account, and leaving or deleting. */
export function AcademySettings({ academy, hasPlayer }: { academy: StaffAcademy; hasPlayer: boolean }) {
  const { api, refresh, username, setMode } = useAcademy();
  const sync = useSync();
  const saved = detailsOf(academy);
  const [draft, setDraft] = useState<AcademyDetails>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dangerError, setDangerError] = useState('');
  const [note, setNote] = useState('');
  const [changingName, setChangingName] = useState(false);

  // Another academy, or the details changed on the server: start from those.
  const savedKey = JSON.stringify(saved);
  useLayoutEffect(() => {
    setDraft(JSON.parse(savedKey) as AcademyDetails);
    setError('');
  }, [academy.id, savedKey]);

  const editable = can(academy.role, 'edit-details');
  const changed = !same(draft, saved);

  const run = async (work: () => Promise<void>, fail: (message: string) => void, done?: string) => {
    if (!api) return;
    setBusy(true);
    fail('');
    setNote('');
    try {
      await work();
      if (done) setNote(done);
    } catch (e) {
      fail(describeAcademyError(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const problem = detailsProblem(draft);
    if (problem) return setError(problem);
    void run(
      async () => {
        await api!.updateAcademy(academy.id, draft);
        await refresh();
      },
      setError,
      'Saved.',
    );
  };

  const leave = () => {
    const me = sync.account?.id;
    if (!me || !confirm(`Leave ${academy.name}? You'll need a new invite to come back.`)) return;
    void run(async () => {
      await api!.removeStaff(academy.id, me);
      await refresh();
    }, setDangerError);
  };

  const remove = () => {
    const typed = prompt(
      `This deletes ${academy.name} for everyone: its staff, squads, tables and team picks. Players keep their own matches.\n\nType the academy's name to delete it.`,
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== academy.name.trim().toLowerCase()) {
      setDangerError("That wasn't the name, so nothing was deleted.");
      return;
    }
    void run(async () => {
      await api!.deleteAcademy(academy.id);
      await refresh();
    }, setDangerError);
  };

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Settings</h1>
      </div>

      <Section title="Academy details">
        {editable ? (
          <>
            <AcademyDetailsFields value={draft} onChange={setDraft} />
            {error && <p className="form-error">{error}</p>}
            {note && !changed && <p className="notice">{note}</p>}
            <div className="button-row">
              <button className="primary-btn" disabled={busy || !changed} onClick={save}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
              {changed && (
                <button className="ghost-btn" disabled={busy} onClick={() => setDraft(saved)}>
                  Undo
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <dl className="facts">
              <dt>Name</dt>
              <dd>{academy.name}</dd>
              <dt>Where</dt>
              <dd>{[academy.town, academy.country].filter(Boolean).join(', ') || '-'}</dd>
              <dt>Contact</dt>
              <dd>{academy.contactEmail || '-'}</dd>
              <dt>Age groups</dt>
              <dd>{academy.ageGroups.join(', ') || '-'}</dd>
            </dl>
            <p className="muted small">The owner, a manager or an admin can change these.</p>
          </>
        )}
      </Section>

      <Section title="You">
        {changingName ? (
          <UsernameForm onSaved={() => setChangingName(false)} onCancel={() => setChangingName(false)} />
        ) : (
          <div className="username-row">
            <span>
              <strong>@{username}</strong> · {ROLE_LABEL[academy.role]}
            </span>
            <button className="link-btn" onClick={() => setChangingName(true)}>
              Change username
            </button>
          </div>
        )}
        <p className="muted small">Signed in as {sync.account?.email}. Staff and players see your username, never your email.</p>
        <div className="button-row">
          {hasPlayer ? (
            <button className="ghost-btn" onClick={() => setMode('player')}>
              Back to my matches
            </button>
          ) : (
            <button className="ghost-btn" onClick={() => setMode('player')}>
              Track a player on this phone too
            </button>
          )}
          <button className="ghost-btn" disabled={busy} onClick={() => void sync.signOut()}>
            Sign out
          </button>
        </div>
      </Section>

      <Section title={academy.role === 'owner' ? 'Deleting the academy' : 'Leaving'}>
        {academy.role === 'owner' ? (
          <>
            <p className="muted small">
              To leave, make someone else the owner first: Staff → Manage → Make them the owner.
            </p>
            {dangerError && <p className="form-error">{dangerError}</p>}
            <button className="danger-link" disabled={busy} onClick={remove}>
              Delete {academy.name}
            </button>
          </>
        ) : (
          <>
            {dangerError && <p className="form-error">{dangerError}</p>}
            <button className="danger-link" disabled={busy} onClick={leave}>
              Leave {academy.name}
            </button>
          </>
        )}
      </Section>
    </div>
  );
}
