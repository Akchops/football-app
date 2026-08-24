import { useEffect, useState } from 'react';
import { useStore } from '../store/AppStore';
import { TRAINING_LENGTHS, TRAINING_TYPE_LABEL, type TrainingSession, type TrainingType } from '../types';
import { todayISO } from '../lib/date';
import { DurationPicker, Field, Sheet } from './ui';

export interface TrainingFormTarget {
  mode: 'create' | 'edit';
  session?: TrainingSession;
  dateISO?: string;
}

const TYPES = Object.keys(TRAINING_TYPE_LABEL) as TrainingType[];
const INTENSITY_LABEL = ['', 'Easy', 'Steady', 'Solid', 'Hard', 'Flat out'];

export function TrainingFormSheet({
  target,
  onClose,
}: {
  target: TrainingFormTarget | null;
  onClose: () => void;
}) {
  const { addTraining, updateTraining, deleteTraining, teams, settings } = useStore();
  const editing = target?.session ?? null;

  const [type, setType] = useState<TrainingType>('team');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('18:00');
  const [teamId, setTeamId] = useState('');
  const [durationMinutes, setDuration] = useState(settings.defaultTrainingLength);
  const [intensity, setIntensity] = useState(3);
  const [focus, setFocus] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!target) return;
    if (editing) {
      setType(editing.type);
      setDate(editing.date);
      setTime(editing.time);
      setTeamId(editing.teamId ?? '');
      setDuration(editing.durationMinutes);
      setIntensity(editing.intensity);
      setFocus(editing.focus);
      setNotes(editing.notes);
    } else {
      setType('team');
      setDate(target.dateISO ?? todayISO());
      setTime('18:00');
      setTeamId(teams.length === 1 ? teams[0].id : '');
      setDuration(settings.defaultTrainingLength);
      setIntensity(3);
      setFocus('');
      setNotes('');
    }
  }, [target, editing, teams, settings.defaultTrainingLength]);

  if (!target) return null;

  const submit = () => {
    const payload = {
      type,
      date,
      time: time || '00:00',
      teamId: teamId || null,
      durationMinutes,
      intensity,
      focus: focus.trim(),
      notes: notes.trim(),
    };
    if (editing) updateTraining(editing.id, payload);
    else addTraining(payload);
    onClose();
  };

  return (
    <Sheet
      open
      title={editing ? 'Edit session' : 'Log training'}
      subtitle="Sessions show on the calendar alongside your matches."
      onClose={onClose}
      footer={
        <>
          <button className="ghost-btn wide" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn wide" onClick={submit}>
            {editing ? 'Save' : 'Add session'}
          </button>
        </>
      }
    >
      <Field label="Type">
        <div className="chip-wrap">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={t === type ? 'filter-chip on' : 'filter-chip'}
              onClick={() => setType(t)}
            >
              {TRAINING_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </Field>

      <div className="row two">
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Start time">
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>

      <Field label="How long">
        <DurationPicker value={durationMinutes} onChange={setDuration} presets={TRAINING_LENGTHS} />
      </Field>

      <Field label={`Intensity — ${INTENSITY_LABEL[intensity]}`}>
        <div className="chip-wrap">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={n === intensity ? 'filter-chip on' : 'filter-chip'}
              onClick={() => setIntensity(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </Field>

      {teams.length > 0 && (
        <Field label="With which team" hint="Optional — leave blank for your own sessions">
          <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">On my own</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="What you worked on" hint="Optional">
        <input
          className="input"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="e.g. Crosses, distribution, 1v1s"
        />
      </Field>

      <Field label="Notes" hint="Optional">
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {editing && (
        <button
          className="danger-link"
          onClick={() => {
            if (confirm('Delete this training session?')) {
              deleteTraining(editing.id);
              onClose();
            }
          }}
        >
          Delete session
        </button>
      )}
    </Sheet>
  );
}
