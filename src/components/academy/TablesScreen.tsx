import { useLayoutEffect, useState } from 'react';
import {
  can, describeAcademyError, type AcademyCompetition, type AcademyCompetitionInput, type Squad, type StaffAcademy,
} from '../../lib/academy';
import { seasonLabel } from '../../lib/date';
import { useAcademy } from '../../store/AcademyProvider';
import { COMPETITION_TYPE_LABEL, type CompetitionType } from '../../types';
import { Field, Section, Sheet, Stepper } from '../ui';
import { CompetitionTables, competitionFacts } from './CompetitionTables';
import { useLoad } from './parts';

/** Friendlies have no table, so they are not offered here. */
const TYPES: CompetitionType[] = ['league', 'tournament', 'cup', 'other'];

/** The academy's own competitions, and their tables. */
export function TablesScreen({ academy }: { academy: StaffAcademy }) {
  const { api } = useAcademy();
  const competitions = useLoad(api ? () => api.competitions(academy.id) : null, academy.id);
  const squads = useLoad(api ? () => api.squads(academy.id) : null, academy.id);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ competition: AcademyCompetition | null } | null>(null);

  const editable = can(academy.role, 'coach');
  const list = competitions.data ?? [];
  const squadName = (id: string | null) => squads.data?.find((s) => s.id === id)?.name;
  const open = list.find((c) => c.id === openId) ?? null;

  const formSheet = (
    <CompetitionForm
      target={form}
      academy={academy}
      squads={squads.data ?? []}
      onClose={() => setForm(null)}
      onSaved={async (id) => {
        setForm(null);
        await competitions.reload();
        setOpenId(id);
      }}
      onDeleted={async () => {
        setForm(null);
        setOpenId(null);
        await competitions.reload();
      }}
    />
  );

  if (open) {
    return (
      <div className="screen">
        <button className="link-btn back-link" onClick={() => setOpenId(null)}>
          ‹ All competitions
        </button>
        <div className="screen-head">
          <div>
            <h1>{open.name}</h1>
            <p className="muted small">{competitionFacts(open, squadName(open.squadId))}</p>
          </div>
          {editable && (
            <button className="ghost-btn" onClick={() => setForm({ competition: open })}>
              Edit
            </button>
          )}
        </div>
        <CompetitionTables competition={open} editable={editable} />
        {formSheet}
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Tables</h1>
        {editable && (
          <button className="primary-btn small" onClick={() => setForm({ competition: null })}>
            + Competition
          </button>
        )}
      </div>

      {competitions.error && <p className="notice warn">{competitions.error}</p>}
      {!competitions.data && !competitions.error && <p className="muted small">Loading…</p>}

      {competitions.data && list.length === 0 && (
        <p className="muted small">
          No competitions yet.{' '}
          {editable
            ? "Add your leagues and tournaments, enter every team's results, and the tables work themselves out - for your staff, and for your players' families."
            : 'Coaching staff add them.'}
        </p>
      )}

      {list.length > 0 && (
        <Section title={`Competitions · ${list.length}`}>
          <ul className="squad-list">
            {list.map((c) => (
              <li key={c.id}>
                <button className="squad-card" onClick={() => setOpenId(c.id)}>
                  <span className="squad-card-main">
                    <strong>{c.name}</strong>
                  </span>
                  <span className="muted small">{competitionFacts(c, squadName(c.squadId))}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {formSheet}
    </div>
  );
}

function CompetitionForm({
  target,
  academy,
  squads,
  onClose,
  onSaved,
  onDeleted,
}: {
  target: { competition: AcademyCompetition | null } | null;
  academy: StaffAcademy;
  squads: Squad[];
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const { api } = useAcademy();
  const editing = target?.competition ?? null;
  const [draft, setDraft] = useState<AcademyCompetitionInput>(blank(academy.name));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useLayoutEffect(() => {
    if (!target) return;
    const c = target.competition;
    setDraft(
      c
        ? { squadId: c.squadId, name: c.name, type: c.type, season: c.season, teamName: c.teamName, pointsWin: c.pointsWin, pointsDraw: c.pointsDraw }
        : blank(academy.name),
    );
    setError('');
    setBusy(false);
  }, [target, academy.name]);

  if (!target) return null;
  const set = (patch: Partial<AcademyCompetitionInput>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    if (!draft.name.trim()) return setError('Give the competition a name.');
    if (!draft.teamName.trim()) return setError("Say what your side is called in it, so it's marked in the table.");
    if (!api) return;
    setBusy(true);
    setError('');
    try {
      const id = await api.saveCompetition(academy.id, draft, editing?.id);
      await onSaved(id);
    } catch (e) {
      setError(describeAcademyError(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!api || !editing) return;
    if (!confirm(`Delete ${editing.name} and all its results?`)) return;
    setBusy(true);
    try {
      await api.deleteCompetition(editing.id);
      await onDeleted();
    } catch (e) {
      setError(describeAcademyError(e));
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      title={editing ? 'Edit competition' : 'New competition'}
      onClose={onClose}
      footer={
        <>
          <button className="ghost-btn wide" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn wide" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Yorkshire U16 League" />
      </Field>
      <Field group label="Type">
        <div className="chip-wrap">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={draft.type === t ? 'filter-chip on' : 'filter-chip'}
              aria-pressed={draft.type === t}
              onClick={() => set({ type: t })}
            >
              {COMPETITION_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </Field>
      <div className="row two">
        <Field label="Season">
          <input className="input" value={draft.season} maxLength={20} onChange={(e) => set({ season: e.target.value })} />
        </Field>
        <Field label="Squad">
          <select className="input" value={draft.squadId ?? ''} onChange={(e) => set({ squadId: e.target.value || null })}>
            <option value="">None</option>
            {squads.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Your side's name in it" hint="As the other teams' results will name you - your row is marked in the table.">
        <input className="input" value={draft.teamName} maxLength={80} onChange={(e) => set({ teamName: e.target.value })} />
      </Field>
      <div className="row two">
        <Stepper label="Points for a win" value={draft.pointsWin} onChange={(v) => set({ pointsWin: v })} max={10} />
        <Stepper label="Points for a draw" value={draft.pointsDraw} onChange={(v) => set({ pointsDraw: v })} max={10} />
      </div>
      {error && <p className="form-error">{error}</p>}
      {editing && (
        <button className="danger-link" disabled={busy} onClick={() => void remove()}>
          Delete this competition
        </button>
      )}
    </Sheet>
  );
}

function blank(academyName: string): AcademyCompetitionInput {
  return { squadId: null, name: '', type: 'league', season: seasonLabel(), teamName: academyName, pointsWin: 3, pointsDraw: 1 };
}
