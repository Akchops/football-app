import { useEffect, useState } from 'react';
import { useStore } from '../store/AppStore';
import { AGE_GROUPS, COMPETITION_COLORS, MATCH_LENGTHS, type MatchStage } from '../types';
import { calendarSeason, todayISO } from '../lib/date';
import { hourAfter } from '../lib/competitions';
import { STAGES, STAGE_LABEL, nextStage, toStage } from '../lib/stage';
import { DurationPicker, Field, Sheet } from './ui';

interface FixtureDraft {
  stage: MatchStage | null;
  opponent: string;
  time: string;
  date: string;
}

/**
 * Creates a tournament - and its matches too, when the fixtures are already
 * known, which saves adding a day's worth one at a time. When they come in one
 * at a time instead, it can start with none: its day, team, ground and match
 * length are kept, and each match added from its page later starts from them.
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
  const [groupName, setGroupName] = useState('');
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
    // None until asked for: the fixtures often aren't out yet.
    setFixtures([]);
    setGroupName('');
    setError('');
  }, [open, teams, competitions.length, settings.defaultMatchLength, profile.ageGroup]);

  if (!open) return null;

  const setFixture = (index: number, patch: Partial<FixtureDraft>) =>
    setFixtures((list) => list.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  const addRow = () => {
    const last = fixtures[fixtures.length - 1];
    setFixtures((list) => [
      ...list,
      last
        ? // Another group game after a group game; after a knockout round, the next one.
          { stage: nextStage(last.stage), opponent: '', time: hourAfter(last.time), date: last.date }
        : // Tournaments mostly open with group games, first thing.
          { stage: 'group', opponent: '', time: '09:30', date },
    ]);
  };

  const count = fixtures.filter((f) => f.opponent.trim() || f.time).length;

  const submit = () => {
    if (!name.trim()) {
      setError('Give the tournament a name, e.g. "Easter 7s".');
      return;
    }
    // No matches is fine: they can be added from the tournament as the fixtures come in.
    const used = fixtures.filter((f) => f.opponent.trim() || f.time);
    addTournament({
      name: name.trim(),
      type: 'tournament',
      season: calendarSeason(),
      ageGroup,
      color,
      notes: '',
      startDate: date,
      teamId: teamId || null,
      location: location.trim(),
      durationMinutes,
      fixtures: used.map((f) => ({
        stage: f.stage,
        // The group's name goes on every group game; a knockout round has none to start with.
        stageDetail: f.stage === 'group' ? groupName.trim() : '',
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
      subtitle="Add its matches now, or later as the fixtures come in."
      onClose={onClose}
      footer={
        <>
          <button className="ghost-btn wide" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn wide" onClick={submit}>
            {count === 0 ? 'Create tournament' : `Create with ${count} match${count === 1 ? '' : 'es'}`}
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

      <Field group label="Colour" hint="How its matches show on the calendar">
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

      <Field group label="Match length" hint="Applied to every match in this tournament">
        <DurationPicker value={durationMinutes} onChange={setDurationMinutes} presets={MATCH_LENGTHS} />
      </Field>

      {/* Only says anything about the matches below, so only there with them. */}
      {fixtures.length > 0 && (
        <label className="toggle-row">
          <input type="checkbox" checked={multiDay} onChange={(e) => setMultiDay(e.target.checked)} />
          <span>Runs over more than one day</span>
        </label>
      )}

      <div className="fixtures">
        <h3>Matches</h3>

        {fixtures.map((fixture, i) => (
          <div key={i} className="fixture-card">
            <div className="fixture-head">
              <span className="fixture-title">Match {i + 1}</span>
              <button
                className="icon-btn"
                onClick={() => setFixtures((list) => list.filter((_, idx) => idx !== i))}
                aria-label={`Remove match ${i + 1}`}
              >
                ✕
              </button>
            </div>
            <div className="fixture-when">
              <select
                className="input"
                value={fixture.stage ?? ''}
                onChange={(e) => setFixture(i, { stage: toStage(e.target.value) })}
                aria-label={`Match ${i + 1} stage`}
              >
                {STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {STAGE_LABEL[stage]}
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

        {fixtures.length === 0 && (
          <p className="muted small">
            Got the fixtures? Add them now. If they're coming in one at a time, just create the tournament and add each
            match from its page as it arrives.
          </p>
        )}

        <button className="ghost-btn" onClick={addRow}>
          {fixtures.length === 0 ? '+ Add a match' : '+ Add another match'}
        </button>
        {fixtures.some((f) => f.stage === 'group') && (
          <Field label="Your group" hint="Optional — your group games show it, e.g. Group B">
            <input className="input" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. B" />
          </Field>
        )}
        {fixtures.length > 0 && (
          <p className="muted small">
            Don't know who you'll play in a round yet? Leave the opponent blank — it shows as TBC, and you can fill it in
            later.
          </p>
        )}
      </div>
    </Sheet>
  );
}
