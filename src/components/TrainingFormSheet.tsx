import { useEffect, useState } from 'react';
import { useStore } from '../store/AppStore';
import { TRAINING_LENGTHS, TRAINING_TYPE_LABEL, type TrainingSession, type TrainingType } from '../types';
import { DAY_NAMES_SHORT, formatDateShort, fromISODate, todayISO } from '../lib/date';
import { defaultRepeatUntil, describeRepeat, repeatDates, repeatLimit } from '../lib/repeat';
import { DurationPicker, Field, Sheet } from './ui';
import { useTrainingActions } from './UndoToast';

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
  const { addTraining, updateTraining, teams, settings } = useStore();
  const actions = useTrainingActions();
  const editing = target?.session ?? null;

  const [type, setType] = useState<TrainingType>('team');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('18:00');
  const [teamId, setTeamId] = useState('');
  const [durationMinutes, setDuration] = useState(settings.defaultTrainingLength);
  const [intensity, setIntensity] = useState(3);
  const [focus, setFocus] = useState('');
  const [notes, setNotes] = useState('');
  // Only for a new session: the same again on these weekdays, up to `until`.
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [until, setUntil] = useState('');

  useEffect(() => {
    if (!target) return;
    setRepeat(false);
    setWeekdays([]);
    setUntil('');
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

  const repeating = !editing && repeat;
  const dates = repeating ? repeatDates(date, weekdays, until) : [];
  const limit = date ? repeatLimit(date) : '';
  // The days of the week in the order this phone shows them, as numbers Date.getDay() uses.
  const week = Array.from({ length: 7 }, (_, i) => (i + settings.weekStartsOn) % 7);

  const switchRepeat = (on: boolean) => {
    setRepeat(on);
    if (!on || !date) return;
    // Starts as "this day each week, for four weeks" - the usual case is a tweak away.
    if (weekdays.length === 0) setWeekdays([fromISODate(date).getDay()]);
    if (!until) setUntil(defaultRepeatUntil(date));
  };

  const toggleDay = (day: number) =>
    setWeekdays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));

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
    else if (repeating) actions.addMany(dates.map((day) => ({ ...payload, date: day })));
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
          <button className="primary-btn wide" onClick={submit} disabled={repeating && dates.length === 0}>
            {editing
              ? 'Save'
              : repeating && dates.length > 0
                ? `Add ${dates.length} session${dates.length === 1 ? '' : 's'}`
                : 'Add session'}
          </button>
        </>
      }
    >
      <Field group label="Type">
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
        <Field label={repeating ? 'From' : 'Date'}>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Start time">
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>

      {!editing && (
        <label className="toggle-row">
          <input type="checkbox" checked={repeat} onChange={(e) => switchRepeat(e.target.checked)} />
          <span>Repeat every week</span>
        </label>
      )}

      {repeating && (
        <>
          <Field group label="On">
            <div className="day-chips">
              {week.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={weekdays.includes(day) ? 'filter-chip on' : 'filter-chip'}
                  aria-pressed={weekdays.includes(day)}
                  onClick={() => toggleDay(day)}
                >
                  {DAY_NAMES_SHORT[day]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Until" hint={limit ? `Up to ${formatDateShort(limit)}, six months on` : undefined}>
            <input
              className="input"
              type="date"
              value={until}
              min={date}
              max={limit}
              onChange={(e) => setUntil(e.target.value)}
            />
          </Field>

          {/* Said before saving: how many sessions this makes, and when. Each is its own session afterwards. */}
          {dates.length > 0 ? (
            <p className="notice">{describeRepeat(dates, weekdays, settings.weekStartsOn)}</p>
          ) : (
            <p className="form-error">
              {weekdays.length === 0 ? 'Choose at least one day.' : 'None of those days fall between the two dates.'}
            </p>
          )}
        </>
      )}

      <Field group label="How long">
        <DurationPicker value={durationMinutes} onChange={setDuration} presets={TRAINING_LENGTHS} />
      </Field>

      <Field group label={`Intensity — ${INTENSITY_LABEL[intensity]}`}>
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
        // No "are you sure?": it goes at once, and the toast offers Undo.
        <button
          className="danger-link"
          onClick={() => {
            actions.remove(editing);
            onClose();
          }}
        >
          Delete session
        </button>
      )}
    </Sheet>
  );
}
