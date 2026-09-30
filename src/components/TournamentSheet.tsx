import { useEffect, useState } from 'react';
import { useStore } from '../store/AppStore';
import { AGE_GROUPS, COMPETITION_COLORS, MATCH_LENGTHS, STAGES, nextStage } from '../types';
import { seasonLabel, todayISO } from '../lib/date';
import { DurationPicker, Field, Sheet } from './ui';

interface FixtureDraft {
  stage: string;
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
  const { addTournament, teams, competitions, settings, profile } = useStore();

  const [name, setName] = useState('');
  const [date, setDate] = useState(todayISO());
  const [teamId, setTeamId] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [touchedAgeGroup, setTouchedAgeGroup] = useState(false);
  const [location, setLocation] = useState('');
  const [color, setColor] = useState(COMPETITION_COLORS[3]);
  const [multiDay, setMultiDay] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(settings.defaultMatchLength);
  const [fixtures, setFixtures] = useState<FixtureDraft[]>([]);
  const [error, setError] = useState('');

  // A tournament can be played in a different age group to usual - up a year, say -
  // so it starts from the team's and can be changed for this one alone.
  const ageGroupFor = (id: string) => teams.find((t) => t.id === id)?.ageGroup || profile.ageGroup;

  useEffect(() => {
    if (!open) return;
    const today = todayISO();
    const initialTeam = teams.length === 1 ? teams[0].id : '';
    setName('');
    setDate(today);
    setTeamId(initialTeam);
    setAgeGroup(ageGroupFor(initialTeam));
    setTouchedAgeGroup(false);
    setLocation('');
    setColor(COMPETITION_COLORS[(competitions.length + 3) % COMPETITION_COLORS.length]);
    setMultiDay(false);
    // Tournament games are nearly always shorter than a league fixture.
    setDurationMinutes(Math.min(settings.defaultMatchLength, 40));
    // Most tournaments open with a few group games.
    setFixtures(START_TIMES.map((time) => ({ stage: 'Group stage', opponent: '', time, date: today })));
    setError('');
  }, [open, teams, competitions.length, settings.defaultMatchLength, profile.ageGroup]);

  if (!open) return null;

  const setFixture = (index: number, patch: Partial<FixtureDraft>) =>
    setFixtures((list) => list.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  const addRow = () => {
    const last = fixtures[fixtures.length - 1];
    const [h, m] = (last?.time ?? '09:00').split(':').map(Number);
    const nextHour = Math.min(23, (h ?? 9) + 1);
    setFixtures((list) => [
      ...list,
      {
        // Another group game after a group game; after a knockout round, the next one.
        stage: nextStage(last?.stage ?? 'Group stage'),
        opponent: '',
        time: `${String(nextHour).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`,
        date: last?.date ?? date,
      },
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
      ageGroup,
      color,
      notes: '',
      teamId: teamId || null,
      location: location.trim(),
      durationMinutes,
      fixtures: used.map((f) => ({
        stage: f.stage,
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
          <select
            className="input"
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              if (!touchedAgeGroup) setAgeGroup(ageGroupFor(e.target.value));
            }}
          >
            <option value="">No team set</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Age group" hint="Playing up or down at this one? Change it here — just for this tournament.">
        <select
          className="input"
          value={ageGroup}
          onChange={(e) => {
            setAgeGroup(e.target.value);
            setTouchedAgeGroup(true);
          }}
        >
          <option value="">Not set</option>
          {AGE_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </Field>

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
        <h3>Matches</h3>

        {fixtures.map((fixture, i) => (
          <div key={i} className="fixture-card">
            <div className="fixture-head">
              <span className="fixture-title">Match {i + 1}</span>
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
            <div className="fixture-when">
              <select
                className="input"
                value={fixture.stage}
                onChange={(e) => setFixture(i, { stage: e.target.value })}
                aria-label={`Match ${i + 1} stage`}
              >
                {STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
                <option value="">No stage</option>
              </select>
              <input
                className="input"
                type="time"
                value={fixture.time}
                onChange={(e) => setFixture(i, { time: e.target.value })}
                aria-label={`Match ${i + 1} kickoff`}
              />
            </div>
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
              placeholder="Opponent — blank if you don't know yet"
              aria-label={`Match ${i + 1} opponent`}
            />
          </div>
        ))}

        <button className="ghost-btn" onClick={addRow}>
          + Add another match
        </button>
        <p className="muted small">
          Don't know who you'll play in a round yet? Leave the opponent blank — it shows as TBC, and you can fill it in
          later.
        </p>
      </div>
    </Sheet>
  );
}
