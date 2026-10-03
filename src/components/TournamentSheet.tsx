import { useEffect, useState } from 'react';
import { useStore } from '../store/AppStore';
import { COMPETITION_COLORS, MATCH_LENGTHS, type MatchStage } from '../types';
import { seasonLabel, todayISO } from '../lib/date';
import { KNOCKOUT_ROUNDS, STAGES, STAGE_LABEL, STAGE_SHORT } from '../lib/stage';
import { DurationPicker, Field, Sheet, Stepper } from './ui';

interface FixtureDraft {
  stage: MatchStage | null;
  opponent: string;
  time: string;
  date: string;
}

const FIRST_KICKOFF = '09:30';
const GAP_MINUTES = 90;
/** What most youth tournaments are: a few group games, then semis and a final. */
const DEFAULT_GROUP_GAMES = 3;
const DEFAULT_ROUNDS: MatchStage[] = ['semi', 'final'];

const ROUND_CHIP: Partial<Record<MatchStage, string>> = { third: '3rd place' };

function addMinutes(time: string, minutes: number): string {
  const [h, m] = (time || FIRST_KICKOFF).split(':').map(Number);
  const total = Math.min(23 * 60 + 59, (h ?? 9) * 60 + (m ?? 0) + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Bracket position, so a round added later still lands in the right place. */
const order = (stage: MatchStage | null) => (stage === null ? -1 : STAGES.indexOf(stage));

function initialRows(date: string): FixtureDraft[] {
  const stages: MatchStage[] = [
    ...Array.from({ length: DEFAULT_GROUP_GAMES }, () => 'group' as const),
    ...DEFAULT_ROUNDS,
  ];
  return stages.map((stage, i) => ({ stage, opponent: '', time: addMinutes(FIRST_KICKOFF, i * GAP_MINUTES), date }));
}

/**
 * Tournaments are usually several matches in one day, so this creates the
 * competition and all of its fixtures in one go rather than one at a time.
 *
 * It starts by asking how the tournament works - how many group games, which
 * knockout rounds could follow - and lays the fixtures out from that. The
 * rows are the record: the counts and chips are read off them, so changing
 * either keeps the other in step and never throws away anything typed.
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
  const [groupName, setGroupName] = useState('');
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
    setGroupName('');
    setFixtures(initialRows(today));
    setError('');
  }, [open, teams, competitions.length, settings.defaultMatchLength]);

  if (!open) return null;

  const groupGames = fixtures.filter((f) => f.stage === 'group').length;
  const hasRound = (round: MatchStage) => fixtures.some((f) => f.stage === round);

  const setFixture = (index: number, patch: Partial<FixtureDraft>) =>
    setFixtures((list) => list.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  /** A new row at its place in the bracket, kicking off after the row before it. */
  const insertRow = (list: FixtureDraft[], stage: MatchStage | null): FixtureDraft[] => {
    let at = list.length;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (order(list[i].stage) <= order(stage)) break;
      at = i;
    }
    const before = list[at - 1];
    const row = {
      stage,
      opponent: '',
      time: before ? addMinutes(before.time, GAP_MINUTES) : FIRST_KICKOFF,
      date: before?.date ?? date,
    };
    return [...list.slice(0, at), row, ...list.slice(at)];
  };

  const setGroupGames = (count: number) =>
    setFixtures((list) => {
      let next = list;
      while (next.filter((f) => f.stage === 'group').length < count) next = insertRow(next, 'group');
      while (next.filter((f) => f.stage === 'group').length > count) {
        const last = next.map((f) => f.stage).lastIndexOf('group');
        next = next.filter((_, i) => i !== last);
      }
      return next;
    });

  const toggleRound = (round: MatchStage) =>
    setFixtures((list) => (list.some((f) => f.stage === round) ? list.filter((f) => f.stage !== round) : insertRow(list, round)));

  /** Another game like the last one - most often one more group game. */
  const addRow = () =>
    setFixtures((list) => {
      const last = list[list.length - 1];
      const time = last ? addMinutes(last.time, GAP_MINUTES) : FIRST_KICKOFF;
      return [...list, { stage: last?.stage ?? null, opponent: '', time, date: last?.date ?? date }];
    });

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
        stage: f.stage,
        stageDetail: f.stage === 'group' ? groupName.trim() : '',
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

      <label className="toggle-row">
        <input type="checkbox" checked={multiDay} onChange={(e) => setMultiDay(e.target.checked)} />
        <span>Runs over more than one day</span>
      </label>

      <div className="tournament-format">
        <h3>How it works</h3>
        <Stepper label="Group games" value={groupGames} onChange={setGroupGames} min={0} max={8} />
        {groupGames > 0 && (
          <Field label="Your group" hint="Optional">
            <input className="input" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. B" />
          </Field>
        )}
        <Field
          group
          label="Knockout rounds you could reach"
          hint="They start as TBC — fill in the opponent once it is known, and change a semi to a Plate semi then if need be."
        >
          <div className="chip-wrap">
            {KNOCKOUT_ROUNDS.map((round) => (
              <button
                key={round}
                type="button"
                className={hasRound(round) ? 'filter-chip on' : 'filter-chip'}
                aria-pressed={hasRound(round)}
                onClick={() => toggleRound(round)}
              >
                {ROUND_CHIP[round] ?? STAGE_LABEL[round]}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="fixtures">
        <div className="section-head">
          <h3>Matches</h3>
          <button className="ghost-btn" onClick={addRow}>
            + Add
          </button>
        </div>

        {fixtures.map((fixture, i) => (
          <div key={i} className={multiDay ? 'fixture-row three' : 'fixture-row'}>
            <select
              className="input f-stage"
              value={fixture.stage ?? ''}
              onChange={(e) => setFixture(i, { stage: (e.target.value || null) as MatchStage | null })}
              aria-label={`Match ${i + 1} stage`}
            >
              <option value="">Match</option>
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_SHORT[stage]}
                </option>
              ))}
            </select>
            <input
              className="input f-time"
              type="time"
              value={fixture.time}
              onChange={(e) => setFixture(i, { time: e.target.value })}
              aria-label={`Match ${i + 1} kickoff`}
            />
            {multiDay && (
              <input
                className="input f-date"
                type="date"
                value={fixture.date}
                onChange={(e) => setFixture(i, { date: e.target.value })}
                aria-label={`Match ${i + 1} date`}
              />
            )}
            <input
              className="input f-opp"
              value={fixture.opponent}
              onChange={(e) => setFixture(i, { opponent: e.target.value })}
              placeholder={fixture.stage && fixture.stage !== 'group' ? 'TBC' : i === 0 ? 'e.g. Vale FC' : 'Opponent'}
              aria-label={`Match ${i + 1} opponent`}
            />
            {fixtures.length > 1 && (
              <button
                className="icon-btn f-remove"
                onClick={() => setFixtures((list) => list.filter((_, idx) => idx !== i))}
                aria-label={`Remove match ${i + 1}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <p className="muted small">
          Leave an opponent blank for games you don&apos;t know yet — it&apos;ll show as TBC and you can fill it in
          later.
        </p>
      </div>
    </Sheet>
  );
}
