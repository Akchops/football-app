import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store/AppStore';
import { todayISO } from '../lib/date';
import { describeError, lastModelUsed, readFixtures, scheduleProblem } from '../lib/ai';
import { buildRows, importable, matchCompetition, toMatchInput, type ReviewRow } from '../lib/fixtures';
import { Field, Sheet } from './ui';
import type { Venue } from '../types';

type Stage = 'idle' | 'reading' | 'review';

const VENUE_LABEL: Record<Venue, string> = { home: 'H', away: 'A', neutral: 'N' };
const VENUE_ORDER: Venue[] = ['home', 'away', 'neutral'];

export function ImportFixturesSheet({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const { addMatch, matches, teams, competitions, settings } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [timing, setTiming] = useState('');
  const [teamId, setTeamId] = useState('');
  const [competitionId, setCompetitionId] = useState('');

  const liveCompetitions = useMemo(() => competitions.filter((c) => !c.archived), [competitions]);
  const ready = importable(rows);
  // Only demandable when there is something to choose. With no teams set up at
  // all there is nothing to pick, and blocking the import would be a dead end.
  const needsTeam = teams.length > 0 && teamId === '';

  function reset() {
    setStage('idle');
    setProgress('');
    setTiming('');
    setError('');
    setSummary('');
    setRows([]);
    setExpanded(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const problem = scheduleProblem(file);
    if (problem) {
      setError(problem);
      return;
    }

    setStage('reading');
    setError('');
    const failedAfter = performance.now();
    try {
      const today = todayISO();
      // Split the wait into shrinking the picture versus sending and reading it,
      // because the two are slow for completely different reasons.
      const started = performance.now();
      let prepared = 0;
      const read = await readFixtures(file, today, teams.map((t) => t.name), (message) => {
        if (message.startsWith('Reading')) prepared = performance.now() - started;
        setProgress(message);
      });
      const total = performance.now() - started;
      const model = lastModelUsed();
      setTiming(
        `Read in ${(total / 1000).toFixed(1)}s · picture ready in ${(prepared / 1000).toFixed(1)}s` +
          (model ? ` · ${model}` : ''),
      );
      const built = buildRows(read.fixtures, matches, today);
      setSummary(read.summary);
      setRows(built);
      setStage('review');

      // Default the whole batch from what was actually on the sheet, so a term of
      // fixtures lands under the right team and colour without picking each one.
      if (teams.length === 1) setTeamId(teams[0].id);
      const printed = built.find((row) => row.competition.trim() !== '')?.competition ?? '';
      setCompetitionId(matchCompetition(printed, liveCompetitions) ?? '');
    } catch (e) {
      // A failure that says how long it ran for is the difference between
      // "the model is slow" and "it never got off the phone".
      const ran = (performance.now() - failedAfter) / 1000;
      setError(`${await describeError(e)} — after ${ran.toFixed(0)}s`);
      setStage('idle');
    }
  }

  function patch(key: string, change: Partial<ReviewRow>) {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...change };
        // Re-check as it is edited: fixing a misread date should clear the warning.
        return { ...next, ...reassess(next) };
      }),
    );
  }

  function reassess(row: ReviewRow) {
    const rebuilt = buildRows([row], matches, todayISO())[0];
    return { problem: rebuilt.problem, duplicateOf: rebuilt.duplicateOf };
  }

  function confirm() {
    for (const row of ready) {
      addMatch(
        toMatchInput(row, {
          teamId: teamId || null,
          competitionId: competitionId || null,
          defaultTime: settings.defaultKickoff,
          defaultLength: settings.defaultMatchLength,
        }),
      );
    }
    const count = ready.length;
    reset();
    onImported(count);
  }

  return (
    <Sheet
      open={open}
      title="Import fixtures"
      subtitle={stage === 'review' ? 'Check these before they go in' : 'From a photo, screenshot or PDF'}
      onClose={close}
      dismissible={stage !== 'reading'}
      footer={
        stage === 'review' ? (
          <div className="button-row">
            <button className="ghost-btn" onClick={reset}>
              Start again
            </button>
            <button className="primary-btn" onClick={confirm} disabled={ready.length === 0 || needsTeam}>
              {needsTeam
                ? 'Choose a team first'
                : ready.length === 0
                  ? 'Nothing selected'
                  : `Add ${ready.length} match${ready.length === 1 ? '' : 'es'}`}
            </button>
          </div>
        ) : undefined
      }
    >
      {error && <p className="notice warn">{error}</p>}

      {stage === 'idle' && (
        <>
          <p className="muted small">
            If the club sends the schedule on WhatsApp, save the picture or PDF and pick it here. Every fixture is read
            off it and shown to you before anything is added.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <div className="button-row">
            <button className="primary-btn" onClick={() => fileRef.current?.click()}>
              Choose photo or PDF
            </button>
          </div>
          <p className="muted small">
            A clear, straight-on shot reads best. A screenshot beats a photo of a screen, and one page at a time beats a
            whole season in one go.
          </p>
        </>
      )}

      {stage === 'reading' && (
        <div className="reading-state">
          <div className="spinner" />
          <p>{progress || 'Reading the schedule…'}</p>
          <p className="muted small">This is the one part that needs signal.</p>
        </div>
      )}

      {stage === 'review' && (
        <>
          {summary && <p className="notice">{summary}</p>}
          {timing && <p className="muted small">{timing}</p>}

          {rows.length === 0 ? (
            <p className="muted small">
              No fixtures could be read off that. If it is definitely a schedule, try a clearer or closer photo.
            </p>
          ) : (
            <>
              <div className="row two">
                {teams.length > 0 && (
                  <Field label="Team" hint="Applied to every fixture added">
                    {/* No "not set" option: a schedule lists opponents, so the
                        player's own team can only come from here. Left optional,
                        the whole import silently lands with no team. */}
                    <select
                      className={`input big-select${teamId === '' ? ' unset' : ''}`}
                      value={teamId}
                      onChange={(e) => setTeamId(e.target.value)}
                    >
                      <option value="" disabled>
                        Choose a team…
                      </option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {liveCompetitions.length > 0 && (
                  <Field label="Competition">
                    <select
                      className="input big-select"
                      value={competitionId}
                      onChange={(e) => setCompetitionId(e.target.value)}
                    >
                      <option value="">None</option>
                      {liveCompetitions.map((competition) => (
                        <option key={competition.id} value={competition.id}>
                          {competition.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              <ul className="import-list">
                {rows.map((row) => {
                  const blocked = row.problem !== '';
                  const duplicate = row.duplicateOf !== null;
                  return (
                    <li key={row.key} className={`import-row${blocked ? ' blocked' : ''}`}>
                      <label className="import-row-head">
                        <input
                          type="checkbox"
                          checked={row.include}
                          disabled={blocked}
                          onChange={(e) => patch(row.key, { include: e.target.checked })}
                        />
                        <span className="import-when">
                          {row.date}
                          {row.time ? ` · ${row.time}` : ''}
                        </span>
                        <span className="import-who">{row.opponent || '—'}</span>
                        <span className="import-venue">{VENUE_LABEL[row.venue]}</span>
                      </label>

                      {(blocked || duplicate || row.confidence === 'low') && (
                        <p className={`import-flag${blocked ? ' bad' : ''}`}>
                          {blocked
                            ? row.problem
                            : duplicate
                              ? 'Already in your calendar'
                              : 'Hard to read — worth checking'}
                        </p>
                      )}

                      <button
                        className="link-btn"
                        onClick={() => setExpanded(expanded === row.key ? null : row.key)}
                      >
                        {expanded === row.key ? 'Done' : 'Edit'}
                      </button>

                      {expanded === row.key && (
                        <div className="import-edit">
                          <div className="row two">
                            <Field label="Date">
                              <input
                                type="date"
                                value={row.date}
                                onChange={(e) => patch(row.key, { date: e.target.value })}
                              />
                            </Field>
                            <Field label="Kickoff">
                              <input
                                type="time"
                                value={row.time}
                                onChange={(e) => patch(row.key, { time: e.target.value })}
                              />
                            </Field>
                          </div>
                          <Field label="Opponent">
                            <input
                              value={row.opponent}
                              onChange={(e) => patch(row.key, { opponent: e.target.value })}
                            />
                          </Field>
                          <Field label="Venue">
                            <div className="chips">
                              {VENUE_ORDER.map((venue) => (
                                <button
                                  key={venue}
                                  className={`chip${row.venue === venue ? ' on' : ''}`}
                                  onClick={() => patch(row.key, { venue })}
                                >
                                  {venue === 'home' ? 'Home' : venue === 'away' ? 'Away' : 'Neutral'}
                                </button>
                              ))}
                            </div>
                          </Field>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
