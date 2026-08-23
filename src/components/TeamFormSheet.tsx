import { useEffect, useState } from 'react';
import { useStore } from '../store/AppStore';
import { AGE_GROUPS, ALL_POSITIONS, TEAM_COLORS, type Team } from '../types';
import { Field, Sheet } from './ui';

export interface TeamFormTarget {
  mode: 'create' | 'edit';
  team?: Team;
}

export function TeamFormSheet({ target, onClose }: { target: TeamFormTarget | null; onClose: () => void }) {
  const { addTeam, updateTeam, teams, profile } = useStore();
  const editing = target?.team ?? null;

  const [name, setName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [position, setPosition] = useState('');
  const [color, setColor] = useState(TEAM_COLORS[0]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    setError('');
    if (editing) {
      setName(editing.name);
      setAgeGroup(editing.ageGroup);
      setPosition(editing.position || profile.position);
      setColor(editing.color);
      setNotes(editing.notes);
    } else {
      setName('');
      setAgeGroup(profile.ageGroup);
      setPosition(profile.position);
      setColor(TEAM_COLORS[teams.length % TEAM_COLORS.length]);
      setNotes('');
    }
  }, [target, editing, teams.length, profile]);

  if (!target) return null;

  const submit = () => {
    if (!name.trim()) {
      setError('Give the team a name.');
      return;
    }
    const payload = { name: name.trim(), ageGroup, position, color, notes: notes.trim() };
    if (editing) updateTeam(editing.id, payload);
    else addTeam(payload);
    onClose();
  };

  return (
    <Sheet
      open
      title={editing ? 'Edit team' : 'Add a team'}
      subtitle="Play for more than one side? Add each one — every team gets its own colour."
      onClose={onClose}
      footer={
        <>
          <button className="ghost-btn wide" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn wide" onClick={submit}>
            {editing ? 'Save' : 'Add team'}
          </button>
        </>
      }
    >
      {error && <p className="form-error">{error}</p>}

      <Field label="Team name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wanderers FC" autoFocus />
      </Field>

      <div className="row two">
        <Field label="Age group">
          <select className="input" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
            <option value="">Not set</option>
            {AGE_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Position here" hint="Can differ per team">
          <select className="input" value={position} onChange={(e) => setPosition(e.target.value)}>
            {ALL_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Colour" hint="Used for this team's matches on the calendar">
        <div className="color-row">
          {TEAM_COLORS.map((c) => (
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
