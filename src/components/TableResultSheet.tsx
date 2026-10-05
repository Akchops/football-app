import { useLayoutEffect, useState } from 'react';
import { useStore, type NewResultInput } from '../store/AppStore';
import type { Competition, MatchStage, Result } from '../types';
import { todayISO } from '../lib/date';
import { STAGES, STAGE_LABEL } from '../lib/stage';
import { teamKey } from '../lib/standings';
import { Field, Sheet, Stepper } from './ui';

/**
 * Where results go. The player app keeps them on the phone; an academy's go to
 * the server, which can fail - so each may be a promise, and a refusal is shown.
 */
export interface ResultSaver {
  add(input: NewResultInput): unknown;
  update(id: string, input: NewResultInput): unknown;
  remove(id: string): unknown;
}

export interface TableResultTarget {
  competition: Pick<Competition, 'id' | 'name' | 'type'> & { startDate?: string };
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
export function TableResultSheet({
  target,
  onClose,
  saver,
  knockouts = false,
}: {
  target: TableResultTarget | null;
  onClose: () => void;
  /** Somewhere other than this phone to keep them. */
  saver?: ResultSaver;
  /** Offer knockout rounds as well as groups - for a competition's full record, not just its table. */
  knockouts?: boolean;
}) {
  const store = useStore();
  const save_ = saver ?? { add: store.addResult, update: store.updateResult, remove: store.deleteResult };
  const editing = target?.result ?? null;

  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [homeGoals, setHomeGoals] = useState(0);
  const [awayGoals, setAwayGoals] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [group, setGroup] = useState('');
  const [stage, setStage] = useState<MatchStage | ''>('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(0);
  const [busy, setBusy] = useState(false);

  // Before paint, so the sheet never shows the last result's teams for a moment.
  useLayoutEffect(() => {
    if (!target) return;
    const r = target.result;
    setHome(r?.home ?? '');
    setAway(r?.away ?? '');
    setHomeGoals(r?.homeGoals ?? 0);
    setAwayGoals(r?.awayGoals ?? 0);
    setDate(r?.date || target.competition.startDate || todayISO());
    setGroup(r ? (r.stage === 'group' || r.stage === null ? r.stageDetail : '') : target.defaultGroup);
    setStage(r ? (r.stage ?? '') : target.competition.type === 'tournament' ? 'group' : '');
    setError('');
    setSaved(0);
    setBusy(false);
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

  // With knockouts offered, the stage is chosen; otherwise a group name makes it a group game.
  const chosenStage: MatchStage | null = knockouts ? stage || null : grouped && group.trim() ? 'group' : null;
  const showGroup = grouped && (!knockouts || stage === 'group');

  const save = async (another: boolean) => {
    const wrong = problem();
    if (wrong) {
      setError(wrong);
      return;
    }
    const input: NewResultInput = {
      competitionId: competition.id,
      home,
      away,
      homeGoals,
      awayGoals,
      date,
      stage: chosenStage,
      stageDetail: chosenStage === 'group' ? group : '',
    };
    setBusy(true);
    setError('');
    try {
      await (editing ? save_.update(editing.id, input) : save_.add(input));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      return;
    }
    setBusy(false);
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
          <button className="ghost-btn wide" disabled={busy} onClick={() => (editing ? onClose() : void save(true))}>
            {editing ? 'Cancel' : 'Save & add another'}
          </button>
          <button className="primary-btn wide" disabled={busy} onClick={() => void save(false)}>
            {busy ? 'Saving…' : 'Save'}
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

      {knockouts && grouped && (
        <Field label="Stage">
          <select className="input" value={stage} onChange={(e) => setStage(e.target.value as MatchStage | '')}>
            <option value="">Not part of a stage</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className={showGroup ? 'row two' : undefined}>
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {showGroup && (
          <Field label="Group" hint="Optional">
            <input className="input" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. B" />
          </Field>
        )}
      </div>

      {editing && (
        <button
          className="danger-link"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await save_.remove(editing.id);
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}
        >
          Delete this result
        </button>
      )}
    </Sheet>
  );
}
