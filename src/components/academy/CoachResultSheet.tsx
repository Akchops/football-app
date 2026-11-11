import { useMemo, useState } from 'react';
import {
  describeAcademyError, type MatchCheck, type Squad, type SquadMatch, type SquadMatchInput, type StaffAcademy,
} from '../../lib/academy';
import {
  checkKey, checkState, claimsFor, finishCorrection, sameScore, startCorrection, type Claim,
} from '../../lib/checks';
import { todayISO } from '../../lib/date';
import { formatLoad, matchLoad } from '../../lib/load';
import { formMetricsFor } from '../../lib/metrics';
import { matchScore } from '../../lib/score';
import { outcomeOf, scoreline } from '../../lib/stats';
import { canonical } from '../../lib/sync';
import { useAcademy } from '../../store/AcademyProvider';
import { METRIC_BY_ID, type MatchResult, type MetricId, type Venue } from '../../types';
import { BusyLabel, Field, Segmented, Sheet, Stepper } from '../ui';
import { Initials } from './parts';
import { CheckChip } from './PlayerGames';
import type { SquadData } from './useSquadData';

/** What the sheet opens on: a result already entered, or a new one - perhaps started from a game players logged. */
export interface ResultTarget {
  result: SquadMatch | null;
  prefill?: Partial<SquadMatchInput>;
  /** Makes opening a new one twice start fresh each time. */
  n: number;
}

function inputOf(r: SquadMatch): SquadMatchInput {
  return {
    squadId: r.squadId, date: r.date, opponent: r.opponent, venue: r.venue, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst,
    notes: r.notes,
  };
}

/**
 * The coach's result for a squad, and beneath it every player in the squad
 * with the figures they put in for that game themselves - each with a big
 * Approve and Deny. Denying flags the player and puts the coach's figures
 * into their match.
 */
export function CoachResultSheet(props: {
  academy: StaffAcademy;
  target: ResultTarget | null;
  /** The squads this person may enter results for. */
  squads: Squad[];
  data: SquadData;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  if (!props.target) return null;
  return <ResultBody key={props.target.result?.id ?? `new-${props.target.n}`} {...props} target={props.target} />;
}

function ResultBody({
  academy,
  target,
  squads,
  data,
  onClose,
  onSaved,
}: {
  academy: StaffAcademy;
  target: ResultTarget;
  squads: Squad[];
  data: SquadData;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { api } = useAcademy();
  const first: SquadMatchInput = target.result
    ? inputOf(target.result)
    : {
        squadId: squads.length === 1 ? squads[0].id : null,
        date: todayISO(),
        opponent: '',
        venue: 'home',
        goalsFor: 0,
        goalsAgainst: 0,
        notes: '',
        ...target.prefill,
      };
  const [draft, setDraft] = useState<SquadMatchInput>(first);
  const [savedId, setSavedId] = useState<string | null>(target.result?.id ?? null);
  const [saved, setSaved] = useState<SquadMatchInput | null>(target.result ? first : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const set = (patch: Partial<SquadMatchInput>) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = !saved || canonical(draft) !== canonical(saved);
  const squad = squads.find((s) => s.id === draft.squadId) ?? data.squads.find((s) => s.id === draft.squadId) ?? null;
  const claims = useMemo(
    () => claimsFor({ date: draft.date, opponent: draft.opponent, squadId: draft.squadId }, data.players),
    [draft.date, draft.opponent, draft.squadId, data.players],
  );
  const logged = claims.filter((c) => c.match);
  const waiting = logged.filter((c) => {
    const check = c.player.playerId ? data.checkMap.get(checkKey(c.player.playerId, c.match!.id)) : undefined;
    return !check || checkState(check, c.match) === 'changed';
  });
  const us = squad?.name || academy.name;
  const them = draft.opponent.trim() || 'Them';

  /** The result, saved if it isn't yet - a verdict is given against it. */
  const ensureSaved = async (): Promise<string | null> => {
    if (!api) return null;
    if (!draft.squadId) {
      setError('Pick the squad that played first.');
      return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
      setError('Put in the date it was played.');
      return null;
    }
    if (savedId && !dirty) return savedId;
    setBusy(true);
    setError('');
    try {
      const id = await api.saveSquadMatch(academy.id, draft, savedId ?? undefined);
      setSavedId(id);
      setSaved(draft);
      setNote('Result saved.');
      await onSaved();
      return id;
    } catch (e) {
      setError(describeAcademyError(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!api || !savedId) return;
    if (!confirm('Delete this result? Approvals and denials already given stay on the players’ matches.')) return;
    setBusy(true);
    try {
      await api.deleteSquadMatch(savedId);
      await onSaved();
      onClose();
    } catch (e) {
      setError(describeAcademyError(e));
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      title={target.result ? 'Squad result' : 'Add result'}
      subtitle={squad ? squad.name : 'Score first, then check what each player says'}
      onClose={onClose}
      footer={
        <>
          <button className="ghost-btn wide" disabled={busy} onClick={onClose}>
            {saved && !dirty ? 'Done' : 'Cancel'}
          </button>
          <button className="primary-btn wide" disabled={busy || (!dirty && Boolean(savedId))} onClick={() => void ensureSaved()}>
            <BusyLabel busy={busy} text="Saving…">{savedId && !dirty ? 'Saved' : 'Save result'}</BusyLabel>
          </button>
        </>
      }
    >
      <div className="row two">
        <Field label="Squad">
          <select className="input" value={draft.squadId ?? ''} onChange={(e) => set({ squadId: e.target.value || null })}>
            <option value="">Pick a squad</option>
            {squads.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
      </div>
      <Field label="Opponent">
        <input
          className="input"
          value={draft.opponent}
          maxLength={80}
          placeholder="e.g. Vale Juniors"
          onChange={(e) => set({ opponent: e.target.value })}
        />
      </Field>
      <Segmented<Venue>
        options={[
          { value: 'home', label: 'Home' },
          { value: 'away', label: 'Away' },
          { value: 'neutral', label: 'Neutral' },
        ]}
        value={draft.venue}
        onChange={(venue) => set({ venue })}
      />

      <div className="scoreboard">
        <div className="score-side">
          <span className="score-team">{us}</span>
          <Stepper label={us} value={draft.goalsFor} onChange={(v) => set({ goalsFor: v })} max={50} accent />
        </div>
        <div className="score-dash">–</div>
        <div className="score-side">
          <span className="score-team">{them}</span>
          <Stepper label={them} value={draft.goalsAgainst} onChange={(v) => set({ goalsAgainst: v })} max={50} accent />
        </div>
      </div>

      {error && <p className="notice warn">{error}</p>}
      {note && !error && !dirty && <p className="notice">{note}</p>}

      <section className="section claims">
        <div className="section-head">
          <h2>Players&apos; own figures</h2>
          {logged.length > 0 && <span className="muted small">{waiting.length ? `${waiting.length} to check` : 'All checked'}</span>}
        </div>
        {!draft.squadId ? (
          <p className="muted small">Pick the squad, and each of its players shows here with what they put in for this game.</p>
        ) : claims.length === 0 ? (
          <p className="muted small">Nobody in {squad?.name ?? 'this squad'} yet - add players to it from Players.</p>
        ) : (
          <>
            <p className="muted small">
              What each player logged in their own Matchday for {draft.opponent.trim() ? `v ${draft.opponent.trim()}` : 'this game'} on
              this day. Approve it if it&apos;s right. Deny it if it isn&apos;t: they&apos;re flagged, and your figures replace
              theirs.
            </p>
            {claims.map((claim) => (
              <ClaimCard
                key={claim.player.id}
                academy={academy}
                claim={claim}
                score={draft}
                check={claim.match && claim.player.playerId ? data.checkMap.get(checkKey(claim.player.playerId, claim.match.id)) : undefined}
                ensureSaved={ensureSaved}
                onReviewed={data.reloadChecks}
              />
            ))}
          </>
        )}
        {data.checksError && <p className="notice warn">{data.checksError}</p>}
      </section>

      {savedId && (
        <div className="sheet-actions">
          <button className="danger-link" disabled={busy} onClick={() => void remove()}>
            Delete this result
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** One player's own figures for the game, with Approve and Deny - or the verdict, once given. */
function ClaimCard({
  academy,
  claim,
  score,
  check,
  ensureSaved,
  onReviewed,
}: {
  academy: StaffAcademy;
  claim: Claim;
  score: Pick<SquadMatchInput, 'goalsFor' | 'goalsAgainst'>;
  check: MatchCheck | undefined;
  ensureSaved: () => Promise<string | null>;
  onReviewed: (records?: boolean) => Promise<void>;
}) {
  const { api } = useAcademy();
  const { player, match } = claim;
  const [fix, setFix] = useState<MatchResult | null>(null);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reopened, setReopened] = useState(false);
  const state = check && match ? checkState(check, match) : null;
  const decided = (state === 'approved' || state === 'denied') && check?.academyId === academy.id && !reopened;

  const run = async (work: (resultId: string) => Promise<unknown>, records: boolean) => {
    if (!api) return;
    const resultId = await ensureSaved();
    if (!resultId) return;
    setBusy(true);
    setError('');
    try {
      await work(resultId);
      setFix(null);
      setReopened(false);
      await onReviewed(records);
    } catch (e) {
      setError(describeAcademyError(e));
    } finally {
      setBusy(false);
    }
  };

  const approve = () =>
    void run((id) => api!.reviewMatch(academy.id, player.playerId!, match!.id, { approve: true, squadMatchId: id }), false);
  const deny = () =>
    void run(
      (id) =>
        api!.reviewMatch(academy.id, player.playerId!, match!.id, {
          approve: false,
          corrected: finishCorrection(fix!),
          note: why,
          squadMatchId: id,
        }),
      true,
    );
  const undo = async () => {
    if (!api || !check) return;
    setBusy(true);
    setError('');
    try {
      await api.forgetCheck(check.id);
      await onReviewed(false);
    } catch (e) {
      setError(describeAcademyError(e));
    } finally {
      setBusy(false);
    }
  };

  const head = (
    <div className="claim-head">
      <Initials name={player.name} size={34} />
      <span className="claim-name">
        <strong>{player.name}</strong>
        <span className="muted small">{[player.position, player.flagged ? '🚩 flagged' : ''].filter(Boolean).join(' · ')}</span>
      </span>
      {match ? <CheckChip state={state} /> : null}
    </div>
  );

  if (!match || !player.playerId) {
    return (
      <div className="claim-card quiet">
        {head}
        <p className="muted small">
          {player.playerId ? "Hasn't logged this game in their Matchday yet." : 'No Matchday linked, or not in a squad you coach - nothing to check.'}
        </p>
      </div>
    );
  }

  const r = match.result;
  const scoreOff = !sameScore(r, score);
  const load = matchLoad(r);

  return (
    <div className={`claim-card${state ? ` state-${state}` : ''}`}>
      {head}
      <div className="claim-score">
        <span className={`game-score outcome-${outcomeOf(r).toLowerCase()}`}>{scoreline(r)}</span>
        {scoreOff && (
          <span className="claim-warn">
            Says {r.goalsFor}–{r.goalsAgainst} · you have {score.goalsFor}–{score.goalsAgainst}
          </span>
        )}
      </div>
      {r.didPlay ? (
        <div className="claim-stats">
          {formMetricsFor(r.positionGroup, r.metrics)
            .filter((m) => m.primary || (r.metrics[m.id] ?? 0) !== 0)
            .map((m) => (
              <span key={m.id} className="claim-stat">
                <strong>{r.metrics[m.id] ?? 0}</strong>
                <span>{m.short}</span>
              </span>
            ))}
          <span className="claim-stat">
            <strong>{r.minutes}</strong>
            <span>Minutes</span>
          </span>
          {r.motm && (
            <span className="claim-stat">
              <strong>🏅</strong>
              <span>MOTM</span>
            </span>
          )}
          {(r.yellowCards > 0 || r.redCards > 0) && (
            <span className="claim-stat">
              <strong>
                {r.yellowCards}Y {r.redCards}R
              </strong>
              <span>Cards</span>
            </span>
          )}
          {load !== null && (
            <span className="claim-stat">
              <strong>{r.rpe}</strong>
              <span>RPE · {formatLoad(load)}</span>
            </span>
          )}
          <span className="claim-stat">
            <strong>{matchScore(r, match.durationMinutes).score}</strong>
            <span>Rating</span>
          </span>
        </div>
      ) : (
        <p className="muted small">Says they didn&apos;t play.</p>
      )}

      {check && check.academyId !== academy.id && (
        <p className="muted small">
          {check.verdict === 'approved' ? 'Checked' : 'Denied'} at {check.academyName} by @{check.reviewedBy || 'a coach'}.
        </p>
      )}
      {state === 'changed' && <p className="claim-warn">Changed since it was checked - check it again.</p>}
      {error && <p className="notice warn">{error}</p>}

      {decided ? (
        <div className="claim-decided">
          <span className="small">
            {state === 'approved' ? '✓ Approved' : '🚩 Denied'} by @{check!.reviewedBy || 'a coach'}
            {state === 'denied' && check!.corrected ? ' · figures corrected' : ''}
            {state === 'denied' && check!.flagActive ? ' · flagged' : ''}
          </span>
          <span className="claim-decided-actions">
            <button className="link-btn" disabled={busy} onClick={() => setReopened(true)}>
              Change
            </button>
            <button className="link-btn" disabled={busy} onClick={() => void undo()}>
              Undo
            </button>
          </span>
        </div>
      ) : fix ? (
        <CorrectionForm
          player={player.name}
          fix={fix}
          setFix={setFix}
          why={why}
          setWhy={setWhy}
          duration={match.durationMinutes}
          busy={busy}
          onDeny={deny}
          onCancel={() => setFix(null)}
        />
      ) : (
        <div className="verdict-row">
          <button className="verdict-btn approve" disabled={busy} onClick={approve}>
            Approve
          </button>
          <button className="verdict-btn deny" disabled={busy} onClick={() => setFix(startCorrection(r, score))}>
            Deny
          </button>
        </div>
      )}
    </div>
  );
}

/** Denying: the player's figures with the coach's score, for the coach to put right. */
function CorrectionForm({
  player,
  fix,
  setFix,
  why,
  setWhy,
  duration,
  busy,
  onDeny,
  onCancel,
}: {
  player: string;
  fix: MatchResult;
  setFix: (r: MatchResult) => void;
  why: string;
  setWhy: (s: string) => void;
  duration: number;
  busy: boolean;
  onDeny: () => void;
  onCancel: () => void;
}) {
  const patch = (over: Partial<MatchResult>) => setFix({ ...fix, ...over });
  const setMetric = (id: MetricId, value: number) => setFix({ ...fix, metrics: { ...fix.metrics, [id]: value } });
  return (
    <div className="correction">
      <p className="small">
        <strong>Put in what really happened.</strong> The score is yours ({fix.goalsFor}–{fix.goalsAgainst}). These replace{' '}
        {player}&apos;s figures in their Matchday, and they&apos;re flagged until you take it off.
      </p>
      <label className="toggle-row">
        <input type="checkbox" checked={fix.didPlay} onChange={(e) => patch({ didPlay: e.target.checked })} />
        <span>{player} played</span>
      </label>
      {fix.didPlay && (
        <>
          <div className="stat-steppers">
            {formMetricsFor(fix.positionGroup, fix.metrics).map((m) => (
              <Stepper
                key={m.id}
                label={METRIC_BY_ID[m.id].label}
                value={fix.metrics[m.id] ?? 0}
                onChange={(v) => setMetric(m.id, v)}
                max={m.max}
              />
            ))}
            <Stepper
              label={`Minutes (of ${duration})`}
              value={fix.minutes}
              onChange={(v) => patch({ minutes: v })}
              max={Math.round(duration * 1.5)}
              step={5}
            />
            <Stepper label="Yellows" value={fix.yellowCards} onChange={(v) => patch({ yellowCards: v })} max={2} />
            <Stepper label="Reds" value={fix.redCards} onChange={(v) => patch({ redCards: v })} max={1} />
          </div>
          <label className="toggle-row">
            <input type="checkbox" checked={fix.motm} onChange={(e) => patch({ motm: e.target.checked })} />
            <span>Man of the match</span>
          </label>
        </>
      )}
      <Field label="What was wrong?" hint="Optional. The player and their family see it.">
        <input className="input" value={why} maxLength={300} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. One goal, not three" />
      </Field>
      <div className="verdict-row">
        <button className="verdict-btn deny" disabled={busy} onClick={onDeny}>
          <BusyLabel busy={busy} text="Saving…">Deny and correct</BusyLabel>
        </button>
        <button className="ghost-btn" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
