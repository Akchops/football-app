import { useEffect, useState } from 'react';
import { useStore } from '../store/AppStore';
import { COMPETITION_COLORS, MATCH_LENGTHS } from '../types';
import { seasonLabel, todayISO } from '../lib/date';
import { DurationPicker, Field, Sheet } from './ui';

interface FixtureDraft {
  opponent: string;
  time: string;
  date: string;
}

const START_TIMES = ['09:30', '11:00', '12:30'];

/**
 * Tournaments are usually several matches in one day, so this creates the
 * competition and all of its fixtures in one go rather than one at a time.
 */
export function TournamentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addTournament, teams, competitions, settings } = useStore();

  const [name, setName] = useState('');
  const [date, setDate] = useState(todayISO());
  const [teamId, setTeamId] = useState('');
  const [location, setLocation] = useState('');
  const [color, setColor] = useState(COMPETITION_COLORS[3]);
  const [multiDay, setMultiDay] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(settings.defaultMatchLength);
  const [fixtures, setFixtures] = useState<FixtureDraft[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const today = todayISO();
    setName('');
    setDate(today);
    setTeamId(teams.length === 1 ? teams[0].id : '');
    setLocation('');
    setColor(COMPETITION_COLORS[(competitions.length + 3) % COMPETITION_COLORS.length]);
    setMultiDay(false);
    // Tournament games are nearly always shorter than a league fixture.
    setDurationMinutes(Math.min(settings.defaultMatchLength, 40));
    setFixtures(START_TIMES.map((time) => ({ opponent: '', time, date: today })));
    setError('');
  }, [open, teams, competitions.length, settings.defaultMatchLength]);

  if (!open) return null;

  const setFixture = (index: number, patch: Partial<FixtureDraft>) =>
    setFixtures((list) => list.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  const addRow = () => {
    const last = fixtures[fixtures.length - 1];
    const [h, m] = (last?.time ?? '09:00').split(':').map(Number);
    const nextHour = Math.min(23, (h ?? 9) + 1);
    setFixtures((list) => [
      ...list,
      { opponent: '', time: `${String(nextHour).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`, date: last?.date ?? date },
    ]);
  };

  const submit = () => {
    if (!name.trim()) {
      setError('Give the tournament a name, e.g. "Easter 7s".');
      return;
    }
    const used = fixtures.filter((f) => f.opponent.trim() || f.time);
    if (used.length === 0) {
      setError('Add at least one match.');
      return;
    }
    addTournament({
      name: name.trim(),
      type: 'tournament',
      season: seasonLabel(),
      color,
      notes: '',
      teamId: teamId || null,
      location: location.trim(),
      durationMinutes,
      fixtures: used.map((f) => ({
        opponent: f.opponent.trim() || 'TBC',
        time: f.time,
        date: multiDay ? f.date || date : date,
      })),
    });
    onClose();
  };

  return (
    <Sheet
      open
      title="Add a tournament"
      subtitle="Creates the tournament and all of its matches at once."
      onClose={onClose}
      footer={
        <>
          <button className="ghost-btn wide" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn wide" onClick={submit}>
            Add {fixtures.filter((f) => f.opponent.trim() || f.time).length} matches
          </button>
        </>
      }
    >
      {error && <p className="form-error">{error}</p>}

      <Field label="Tournament name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Easter 7s" autoFocus />
      </Field>

      <div className="row two">
        <Field label="Date">
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (!multiDay) setFixtures((list) => list.map((f) => ({ ...f, date: e.target.value })));
            }}
          />
        </Field>
        <Field label="Playing for">
          <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">No team set</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Venue" hint="Optional — applied to every match">
        <input
          className="input"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Central Playing Fields"
        />
      </Field>

      <Field label="Colour" hint="How its matches show on the calendar">
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

      <Field label="Match length" hint="Applied to every match in this tournament">
        <DurationPicker value={durationMinutes} onChange={setDurationMinutes} presets={MATCH_LENGTHS} />
      </Field>

      <label className="toggle-row">
        <input type="checkbox" checked={multiDay} onChange={(e) => setMultiDay(e.target.checked)} />
        <span>Runs over more than one day</span>
      </label>

      <div className="fixtures">
        <div className="section-head">
          <h3>Matches</h3>
          <button className="ghost-btn" onClick={addRow}>
            + Add
          </button>
        </div>

        {fixtures.map((fixture, i) => (
          <div key={i} className={multiDay ? 'fixture-row three' : 'fixture-row'}>
            <input
              className="input"
              type="time"
              value={fixture.time}
              onChange={(e) => setFixture(i, { time: e.target.value })}
              aria-label={`Match ${i + 1} kickoff`}
            />
            {multiDay && (
              <input
                className="input"
                type="date"
                value={fixture.date}
                onChange={(e) => setFixture(i, { date: e.target.value })}
                aria-label={`Match ${i + 1} date`}
              />
            )}
            <input
              className="input"
              value={fixture.opponent}
              onChange={(e) => setFixture(i, { opponent: e.target.value })}
              placeholder={i === 0 ? 'Group A: Vale FC' : 'Opponent or round'}
              aria-label={`Match ${i + 1} opponent`}
            />
            {fixtures.length > 1 && (
              <button
                className="icon-btn"
                onClick={() => setFixtures((list) => list.filter((_, idx) => idx !== i))}
                aria-label={`Remove match ${i + 1}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <p className="muted small">
          Leave an opponent blank for rounds you don't know yet — it'll show as TBC and you can rename it later.
        </p>
      </div>
    </Sheet>
  );
}
