import { useLayoutEffect, useState } from 'react';
import { useStore } from '../store/AppStore';
import type { Competition, Result } from '../types';
import { todayISO } from '../lib/date';
import { teamKey } from '../lib/standings';
import { Field, Sheet, Stepper } from './ui';

export interface TableResultTarget {
  competition: Competition;
  /** Set when editing one already entered. */
  result?: Result;
  /** The group a new one starts in - the player's own, in a tournament. */
  defaultGroup: string;
  /** Teams already named in this competition, offered as they're typed. */
  knownTeams: string[];
  /** The player's own team names: their games are matches, not results. */
  ourNames: string[];
}

/**
 * Another team's game, for the table: "Vale 2–1 Castle Park". Built for
 * typing up a whole round quickly - "Save and add another" keeps the date and
 * group and clears the rest.
 */
export function TableResultSheet({ target, onClose }: { target: TableResultTarget | null; onClose: () => void }) {
  const { addResult, updateResult, deleteResult } = useStore();
  const editing = target?.result ?? null;

  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [homeGoals, setHomeGoals] = useState(0);
  const [awayGoals, setAwayGoals] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [group, setGroup] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(0);

  // Before paint, so the sheet never shows the last result's teams for a moment.
  useLayoutEffect(() => {
    if (!target) return;
    const r = target.result;
    setHome(r?.home ?? '');
    setAway(r?.away ?? '');
    setHomeGoals(r?.homeGoals ?? 0);
    setAwayGoals(r?.awayGoals ?? 0);
    setDate(r?.date || target.competition.startDate || todayISO());
    setGroup(r ? r.stageDetail : target.defaultGroup);
    setError('');
    setSaved(0);
  }, [target]);

  if (!target) return null;
  const { competition } = target;
  // Leagues are one table; groups only mean something in a tournament or a cup.
  const grouped = competition.type === 'tournament' || competition.type === 'cup';
  const listId = `teams-${competition.id}`;

  const problem = (): string => {
    if (!home.trim() || !away.trim()) return 'Add both teams.';
    if (teamKey(home) === teamKey(away)) return "A team can't play itself.";
    const ours = new Set(target.ourNames.map(teamKey));
    if (ours.has(teamKey(home)) || ours.has(teamKey(away))) {
      return "That's your team — add it as one of your matches instead, so it counts in your stats too.";
    }
    return '';
  };

  const save = (another: boolean) => {
    const wrong = problem();
    if (wrong) {
      setError(wrong);
      return;
    }
    const input = {
      competitionId: competition.id,
      home,
      away,
      homeGoals,
      awayGoals,
      date,
      stage: grouped && group.trim() ? ('group' as const) : null,
      stageDetail: group,
    };
    if (editing) updateResult(editing.id, input);
    else addResult(input);
    if (another && !editing) {
      // Same day, same group - the next game of the round.
      setHome('');
      setAway('');
      setHomeGoals(0);
      setAwayGoals(0);
      setError('');
      setSaved((n) => n + 1);
      return;
    }
    onClose();
  };

  return (
    <Sheet
      open
      title={editing ? 'Edit result' : 'Add a result'}
      subtitle={`${competition.name} · another team's game, for the table`}
      onClose={onClose}
      footer={
        <>
          <button className="ghost-btn wide" onClick={() => (editing ? onClose() : save(true))}>
            {editing ? 'Cancel' : 'Save & add another'}
          </button>
          <button className="primary-btn wide" onClick={() => save(false)}>
            Save
          </button>
        </>
      }
    >
      {error && <p className="form-error">{error}</p>}
      {saved > 0 && !error && (
        <p className="notice">
          {saved} saved. Next game:
        </p>
      )}

      <datalist id={listId}>
        {target.knownTeams.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <Field label="Home team">
        <input className="input" list={listId} value={home} onChange={(e) => setHome(e.target.value)} placeholder="e.g. Vale FC" />
      </Field>

      <div className="field" role="group" aria-label="Score">
        <span className="field-label">Score</span>
        <div className="scoreboard">
          <div className="score-side">
            <span className="score-team">{home.trim() || 'Home'}</span>
            <Stepper label={`${home.trim() || 'Home'} goals`} value={homeGoals} onChange={setHomeGoals} max={50} accent />
          </div>
          <div className="score-dash">–</div>
          <div className="score-side">
            <span className="score-team">{away.trim() || 'Away'}</span>
            <Stepper label={`${away.trim() || 'Away'} goals`} value={awayGoals} onChange={setAwayGoals} max={50} accent />
          </div>
        </div>
      </div>

      <Field label="Away team">
        <input className="input" list={listId} value={away} onChange={(e) => setAway(e.target.value)} placeholder="e.g. Castle Park" />
      </Field>

      <div className={grouped ? 'row two' : undefined}>
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {grouped && (
          <Field label="Group" hint="Optional">
            <input className="input" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. B" />
          </Field>
        )}
      </div>

      {editing && (
        <button
          className="danger-link"
          onClick={() => {
            deleteResult(editing.id);
            onClose();
          }}
        >
          Delete this result
        </button>
      )}
    </Sheet>
  );
}
