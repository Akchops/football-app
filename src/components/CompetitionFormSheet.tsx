import { useEffect, useState } from 'react';
import { useStore } from '../store/AppStore';
import { COMPETITION_COLORS, COMPETITION_TYPE_LABEL, type Competition, type CompetitionType } from '../types';
import { seasonLabel } from '../lib/date';
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
  const { addCompetition, updateCompetition, competitions } = useStore();
  const editing = target?.competition ?? null;

  const [name, setName] = useState('');
  const [type, setType] = useState<CompetitionType>('league');
  const [season, setSeason] = useState(seasonLabel());
  const [color, setColor] = useState(COMPETITION_COLORS[0]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    setError('');
    if (editing) {
      setName(editing.name);
      setType(editing.type);
      setSeason(editing.season);
      setColor(editing.color);
      setNotes(editing.notes);
    } else {
      setName('');
      setType('league');
      setSeason(seasonLabel());
      setColor(COMPETITION_COLORS[competitions.length % COMPETITION_COLORS.length]);
      setNotes('');
    }
  }, [target, editing, competitions.length]);

  if (!target) return null;

  const submit = () => {
    if (!name.trim()) {
      setError('Give it a name, e.g. "Sunday League".');
      return;
    }
    const payload = { name: name.trim(), type, season: season.trim(), color, notes: notes.trim() };
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

      <Field label="Colour" hint="Shown on the calendar">
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

      <Field label="Notes" hint="Optional">
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Sheet>
  );
}
