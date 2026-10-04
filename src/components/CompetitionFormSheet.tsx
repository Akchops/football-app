import { useEffect, useState } from 'react';
import { useStore } from '../store/AppStore';
import { AGE_GROUPS, COMPETITION_COLORS, COMPETITION_TYPE_LABEL, type Competition, type CompetitionType } from '../types';
import { seasonLabel } from '../lib/date';
import { ACADEMY } from '../lib/features';
import { Field, Sheet } from './ui';

export interface CompetitionFormTarget {
  mode: 'create' | 'edit';
  competition?: Competition;
}

const TYPES = Object.keys(COMPETITION_TYPE_LABEL) as CompetitionType[];

export function CompetitionFormSheet({
  target,
  onClose,
}: {
  target: CompetitionFormTarget | null;
  onClose: () => void;
}) {
  const { addCompetition, updateCompetition, competitions, profile } = useStore();
  const editing = target?.competition ?? null;

  const [name, setName] = useState('');
  const [type, setType] = useState<CompetitionType>('league');
  const [season, setSeason] = useState(seasonLabel());
  const [ageGroup, setAgeGroup] = useState('');
  const [color, setColor] = useState(COMPETITION_COLORS[0]);
  const [notes, setNotes] = useState('');
  const [pointsWin, setPointsWin] = useState(3);
  const [pointsDraw, setPointsDraw] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    setError('');
    if (editing) {
      setName(editing.name);
      setType(editing.type);
      setSeason(editing.season);
      setAgeGroup(editing.ageGroup);
      setColor(editing.color);
      setNotes(editing.notes);
      setPointsWin(editing.pointsWin);
      setPointsDraw(editing.pointsDraw);
    } else {
      setName('');
      setType('league');
      setSeason(seasonLabel());
      setAgeGroup(profile.ageGroup);
      setColor(COMPETITION_COLORS[competitions.length % COMPETITION_COLORS.length]);
      setNotes('');
      setPointsWin(3);
      setPointsDraw(1);
    }
  }, [target, editing, competitions.length, profile.ageGroup]);

  if (!target) return null;

  const submit = () => {
    if (!name.trim()) {
      setError('Give it a name, e.g. "Sunday League".');
      return;
    }
    const points = ACADEMY ? { pointsWin, pointsDraw } : {};
    const payload = { name: name.trim(), type, season: season.trim(), ageGroup, color, notes: notes.trim(), ...points };
    if (editing) updateCompetition(editing.id, payload);
    else addCompetition(payload);
    onClose();
  };

  return (
    <Sheet
      open
      title={editing ? 'Edit competition' : 'New competition'}
      subtitle="Leagues, cups, tournaments — anything you play matches in."
      onClose={onClose}
      footer={
        <>
          <button className="ghost-btn wide" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn wide" onClick={submit}>
            {editing ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      {error && <p className="form-error">{error}</p>}

      <Field label="Name">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sunday League"
          autoFocus
        />
      </Field>

      <Field label="Type">
        <select className="input" value={type} onChange={(e) => setType(e.target.value as CompetitionType)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {COMPETITION_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Season" hint="Optional — keeps last year's stats separate">
        <input className="input" value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2025/26" />
      </Field>

      <Field label="Age group" hint="The one you play in here — it can differ from competition to competition.">
        <select className="input" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
          <option value="">Not set</option>
          {AGE_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </Field>

      <Field group label="Colour" hint="Shown on the calendar">
        <div className="color-row">
          {COMPETITION_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={c === color ? 'color-dot on' : 'color-dot'}
              style={{ background: c }}
              aria-label={`Colour ${c}`}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </Field>

      {ACADEMY && type !== 'friendly' && (
        <div className="row two">
          <Field label="Points for a win" hint="For its table">
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              value={pointsWin}
              onChange={(e) => setPointsWin(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
            />
          </Field>
          <Field label="Points for a draw">
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              value={pointsDraw}
              onChange={(e) => setPointsDraw(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
            />
          </Field>
        </div>
      )}

      <Field label="Notes" hint="Optional">
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Sheet>
  );
}
