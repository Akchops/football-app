import { useEffect, useMemo, useState } from 'react';
import { fixtureContext } from '../lib/stage';
import { useStore } from '../store/AppStore';
import {
  ALL_POSITIONS, POSITIONS_BY_GROUP, emptyResult, groupForPosition,
  type MatchResult, type Match, type MetricId, type PositionGroup,
} from '../types';
import { formatDateShort, formatTime } from '../lib/date';
import { concededFollowsScore, formMetricsFor, pruneMetrics } from '../lib/metrics';
import { matchScore, scoreBand, scoreVerdict } from '../lib/score';
import { RPE_VALUES, formatLoad, matchLoad, rpeLabel } from '../lib/load';
import { Disclosure, Field, Segmented, Sheet, Stepper } from './ui';
import { NoEntryIcon } from './icons';
import { MatchCheckNote } from './MatchCheckNote';

const SHORT_GROUP: Record<PositionGroup, string> = {
  goalkeeper: 'Keeper',
  defender: 'Defender',
  midfielder: 'Midfield',
  forward: 'Forward',
};

/**
 * Entering a result for one match. The stats it asks for follow the position
 * played - saves and goals conceded for a keeper, shots and chances for a forward.
 */
export function ResultSheet({
  match,
  onClose,
  onSaved,
  skipLabel,
  onSkip,
  headline,
}: {
  match: Match | null;
  onClose: () => void;
  onSaved?: () => void;
  skipLabel?: string;
  onSkip?: () => void;
  headline?: string;
}) {
  const { saveResult, updateMatch, profile, competitionOf, teamOf, cancelMatch } = useStore();
  const team = match ? teamOf(match) : null;
  const defaultPosition = team?.position || profile.position;

  const duration = match?.durationMinutes ?? 90;
  const [result, setResult] = useState<MatchResult>(() => emptyResult(defaultPosition, undefined, duration));
  const [notes, setNotes] = useState('');
  const [showPens, setShowPens] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  // A keeper's goals conceded follows the opponent's score until it is set by hand.
  const [concededLinked, setConcededLinked] = useState(true);

  useEffect(() => {
    if (!match) return;
    const existing = match.result;
    setResult(existing ?? emptyResult(team?.position || profile.position, undefined, match.durationMinutes));
    setNotes(match.notes ?? '');
    setShowPens(existing?.penaltiesFor !== null && existing?.penaltiesFor !== undefined);
    setShowDetail(Boolean(existing));
    // A walkover lives in Extra settings, so open them when there is one to show.
    setShowExtra(Boolean(existing?.walkover));
    setConcededLinked(existing ? concededFollowsScore(existing) : true);
  }, [match, profile.position, team]);

  const group = result.positionGroup;
  const metricDefs = useMemo(() => formMetricsFor(group, result.metrics), [group, result.metrics]);
  const primary = metricDefs.filter((m) => m.primary);
  const secondary = metricDefs.filter((m) => !m.primary);
  const preview = useMemo(() => matchScore(result, duration), [result, duration]);
  const walkover = result.walkover ?? null;
  const extraSummary = walkover
    ? [walkover === 'us' ? 'Walkover win' : 'Walkover loss']
    : [
        result.motm ? 'Man of the match' : null,
        result.didPlay ? null : 'Did not play',
        showPens ? 'Decided on penalties' : null,
      ].filter((s): s is string => s !== null);

  if (!match) return null;

  const competition = competitionOf(match);
  const patch = (over: Partial<MatchResult>) => setResult((r) => ({ ...r, ...over }));
  const setMetric = (id: MetricId, value: number) => {
    if (id === 'conceded') setConcededLinked(false);
    setResult((r) => ({ ...r, metrics: { ...r.metrics, [id]: value } }));
  };
  const setGoalsAgainst = (value: number) =>
    setResult((r) => ({
      ...r,
      goalsAgainst: value,
      metrics: concededLinked && r.positionGroup === 'goalkeeper' ? { ...r.metrics, conceded: value } : r.metrics,
    }));
  const isDraw = result.goalsFor === result.goalsAgainst;
  const us = team?.name?.trim() || 'Us';
  const them = match.opponent.trim() || 'Them';

  const changeGroup = (nextGroup: PositionGroup) => {
    const nextPosition = POSITIONS_BY_GROUP[nextGroup].includes(result.position)
      ? result.position
      : POSITIONS_BY_GROUP[nextGroup][0];
    setResult((r) => ({
      ...r,
      positionGroup: nextGroup,
      position: nextPosition,
      metrics: nextGroup === 'goalkeeper' && concededLinked ? { ...r.metrics, conceded: r.goalsAgainst } : r.metrics,
    }));
  };

  const save = () => {
    // Nobody played and nobody scored: a walkover is the win or loss and nothing else.
    const cleaned: MatchResult = walkover
      ? {
          ...result,
          goalsFor: 0,
          goalsAgainst: 0,
          penaltiesFor: null,
          penaltiesAgainst: null,
          didPlay: false,
          minutes: 0,
          motm: false,
          yellowCards: 0,
          redCards: 0,
          metrics: {},
          walkover,
          rpe: null,
        }
      : {
          ...result,
          penaltiesFor: showPens && isDraw ? result.penaltiesFor ?? 0 : null,
          penaltiesAgainst: showPens && isDraw ? result.penaltiesAgainst ?? 0 : null,
          minutes: result.didPlay ? result.minutes : 0,
          motm: result.didPlay ? result.motm : false,
          yellowCards: result.didPlay ? result.yellowCards : 0,
          redCards: result.didPlay ? result.redCards : 0,
          metrics: result.didPlay ? pruneMetrics(result.metrics) : {},
          walkover: null,
          rpe: result.didPlay ? result.rpe ?? null : null,
        };
    saveResult(match.id, cleaned);
    if (notes !== match.notes) updateMatch(match.id, { notes });
    onSaved?.();
    onClose();
  };

  return (
    <Sheet
      open
      title={headline ?? 'Match result'}
      subtitle={[
        `${match.venue === 'away' ? '@' : 'vs'} ${them}`,
        formatDateShort(match.date),
        formatTime(match.time),
        fixtureContext(competition, match),
      ]
        .filter(Boolean)
        .join(' · ')}
      onClose={onClose}
      footer={
        <>
          <button className="ghost-btn wide" onClick={onSkip ?? onClose}>
            {skipLabel ?? 'Cancel'}
          </button>
          <button className="primary-btn wide" onClick={save}>
            Save result
          </button>
        </>
      }
    >
      {match.result && <MatchCheckNote match={match} editing />}

      {walkover ? (
        <div className={`walkover-note outcome-${walkover === 'us' ? 'w' : 'l'}`}>
          <strong>{walkover === 'us' ? `Walkover to ${us}` : `Walkover to ${them}`}</strong>
          <span>
            Counts as a {walkover === 'us' ? 'win' : 'defeat'}. No goals for either side, and no stats - nobody played.
          </span>
        </div>
      ) : (
        <div className="scoreboard">
          <div className="score-side">
            <span className="score-team">{us}</span>
            <Stepper label={us} value={result.goalsFor} onChange={(v) => patch({ goalsFor: v })} max={50} accent />
          </div>
          <div className="score-dash">–</div>
          <div className="score-side">
            <span className="score-team">{them}</span>
            <Stepper label={them} value={result.goalsAgainst} onChange={setGoalsAgainst} max={50} accent />
          </div>
        </div>
      )}

      {result.didPlay && !walkover && (
        <>
          <Field group label="Position played" hint="Changes which stats are tracked below">
            <Segmented
              options={(Object.keys(POSITIONS_BY_GROUP) as PositionGroup[]).map((g) => ({ value: g, label: SHORT_GROUP[g] }))}
              value={group}
              onChange={changeGroup}
            />
          </Field>

          <div className="stat-steppers">
            {primary.map((m) => (
              <Stepper
                key={m.id}
                label={m.label}
                value={result.metrics[m.id] ?? 0}
                onChange={(v) => setMetric(m.id, v)}
                max={m.max}
              />
            ))}
          </div>

          <div className={`score-preview band-${scoreBand(preview.score)}`}>
            <span className="score-preview-value">{preview.score}</span>
            <span className="score-preview-text">
              <strong>{scoreVerdict(preview.score)}</strong>
              <span>Match rating out of 100, updates as you type</span>
            </span>
          </div>
        </>
      )}

      <Field label="Match notes" hint="Optional">
        <textarea
          className="input"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything worth remembering?"
        />
      </Field>

      {/* The extras sit at the bottom, together: minutes and cards, then the rarer
          match-level settings. */}
      {result.didPlay && !walkover && (
        <Disclosure
          label="More detail"
          detail={
            result.rpe
              ? `Effort ${result.rpe}/20 · load ${formatLoad(matchLoad(result) ?? 0)}`
              : 'Minutes played, effort (RPE), yellow and red cards'
          }
          open={showDetail}
          onToggle={() => setShowDetail((s) => !s)}
        >
          <div className="detail-block">
            <div className="stat-steppers">
              <Stepper
                label={`Minutes (of ${duration})`}
                value={result.minutes}
                onChange={(v) => patch({ minutes: v })}
                max={Math.round(duration * 1.5)}
                step={5}
              />
              <Stepper label="Yellows" value={result.yellowCards} onChange={(v) => patch({ yellowCards: v })} max={2} />
              <Stepper label="Reds" value={result.redCards} onChange={(v) => patch({ redCards: v })} max={1} />
            </div>

            <Field
              label="How hard was it? (RPE)"
              hint="Rate of perceived exertion, 6 (resting) to 20 (all-out). Times your minutes, it gives the match load."
            >
              <select
                className="input"
                value={result.rpe ?? ''}
                onChange={(e) => patch({ rpe: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Not set</option>
                {RPE_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {rpeLabel(v)}
                  </option>
                ))}
              </select>
            </Field>
            {result.rpe ? (
              <p className="load-readout" aria-live="polite">
                <span>Match load</span>
                <strong>{formatLoad(matchLoad(result) ?? 0)}</strong>
                <span className="muted small">
                  RPE {result.rpe} × {result.minutes} min
                </span>
              </p>
            ) : null}

            {secondary.length > 0 && (
              <div className="stat-steppers">
                {secondary.map((m) => (
                  <Stepper
                    key={m.id}
                    label={m.label}
                    value={result.metrics[m.id] ?? 0}
                    onChange={(v) => setMetric(m.id, v)}
                    max={m.max}
                  />
                ))}
              </div>
            )}

            <Field label="Position">
              <select
                className="input"
                value={result.position}
                onChange={(e) => patch({ position: e.target.value, positionGroup: groupForPosition(e.target.value) })}
              >
                {ALL_POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Disclosure>
      )}

      <Disclosure
        label="Extra settings"
        detail={extraSummary.length > 0 ? extraSummary.join(' · ') : 'Walkover, man of the match, penalties'}
        open={showExtra}
        onToggle={() => setShowExtra((s) => !s)}
      >
        <div className="detail-block">
          <Field group label="Walkover" hint="When a side doesn't turn up. It counts as a win or a loss, with no goals.">
            <div className="choice-card" role="radiogroup" aria-label="Walkover">
              {([
                [null, 'No walkover: the match was played'],
                ['us', `${us} got a walkover`],
                ['them', `${them} got a walkover`],
              ] as const).map(([value, label]) => (
                <button
                  key={value ?? 'none'}
                  type="button"
                  role="radio"
                  aria-checked={walkover === value}
                  className="choice-row"
                  onClick={() => patch({ walkover: value })}
                >
                  <span>{label}</span>
                  {walkover === value && <span className="choice-check">✓</span>}
                </button>
              ))}
            </div>
          </Field>

          {!walkover && (
            <>
              <label className="toggle-row">
                <input type="checkbox" checked={result.motm} onChange={(e) => patch({ motm: e.target.checked })} />
                <span>I was man of the match 🏅</span>
              </label>

              <label className="toggle-row">
                <input type="checkbox" checked={result.didPlay} onChange={(e) => patch({ didPlay: e.target.checked })} />
                <span>I played in this match</span>
              </label>
            </>
          )}

          {isDraw && !walkover && (
            <label className="toggle-row">
              <input type="checkbox" checked={showPens} onChange={(e) => setShowPens(e.target.checked)} />
              <span>Decided on penalties</span>
            </label>
          )}

          {isDraw && showPens && !walkover && (
            <div className="row two">
              <Field label={`${us} pens`}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={result.penaltiesFor ?? 0}
                  onChange={(e) => patch({ penaltiesFor: Number(e.target.value) })}
                />
              </Field>
              <Field label={`${them} pens`}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={result.penaltiesAgainst ?? 0}
                  onChange={(e) => patch({ penaltiesAgainst: Number(e.target.value) })}
                />
              </Field>
            </div>
          )}
        </div>
      </Disclosure>

      {/* On the main page, not tucked away: a match that never happened is common
          enough to need one obvious tap. */}
      <button
        className="destructive-row"
        onClick={() => {
          cancelMatch(match.id);
          onClose();
        }}
      >
        <NoEntryIcon />
        This match didn't happen (called off)
      </button>
    </Sheet>
  );
}
