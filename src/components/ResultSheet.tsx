import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/AppStore';
import {
  ALL_POSITIONS, POSITIONS_BY_GROUP, POSITION_GROUP_LABEL, emptyResult, groupForPosition,
  type MatchResult, type Match, type MetricId, type PositionGroup,
} from '../types';
import { formatDateShort, formatTime } from '../lib/date';
import { formMetricsFor, pruneMetrics } from '../lib/metrics';
import { matchScore, scoreBand, scoreVerdict } from '../lib/score';
import { Field, Sheet, Stepper } from './ui';

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

  useEffect(() => {
    if (!match) return;
    const existing = match.result;
    setResult(existing ?? emptyResult(team?.position || profile.position, undefined, match.durationMinutes));
    setNotes(match.notes ?? '');
    setShowPens(existing?.penaltiesFor !== null && existing?.penaltiesFor !== undefined);
    setShowDetail(Boolean(existing));
  }, [match, profile.position, team]);

  const group = result.positionGroup;
  const metricDefs = useMemo(() => formMetricsFor(group, result.metrics), [group, result.metrics]);
  const primary = metricDefs.filter((m) => m.primary);
  const secondary = metricDefs.filter((m) => !m.primary);
  const preview = useMemo(() => matchScore(result, duration), [result, duration]);
  const extraSummary = [
    result.motm ? 'Man of the match' : null,
    result.didPlay ? null : 'Did not play',
    showPens ? 'Decided on penalties' : null,
  ].filter((s): s is string => s !== null);

  if (!match) return null;

  const competition = competitionOf(match);
  const patch = (over: Partial<MatchResult>) => setResult((r) => ({ ...r, ...over }));
  const setMetric = (id: MetricId, value: number) =>
    setResult((r) => ({ ...r, metrics: { ...r.metrics, [id]: value } }));
  const isDraw = result.goalsFor === result.goalsAgainst;
  const us = team?.name?.trim() || 'Us';
  const them = match.opponent.trim() || 'Them';

  const changeGroup = (nextGroup: PositionGroup) => {
    const nextPosition = POSITIONS_BY_GROUP[nextGroup].includes(result.position)
      ? result.position
      : POSITIONS_BY_GROUP[nextGroup][0];
    patch({ positionGroup: nextGroup, position: nextPosition });
  };

  const save = () => {
    const cleaned: MatchResult = {
      ...result,
      penaltiesFor: showPens && isDraw ? result.penaltiesFor ?? 0 : null,
      penaltiesAgainst: showPens && isDraw ? result.penaltiesAgainst ?? 0 : null,
      minutes: result.didPlay ? result.minutes : 0,
      motm: result.didPlay ? result.motm : false,
      rating: result.didPlay ? result.rating : null,
      yellowCards: result.didPlay ? result.yellowCards : 0,
      redCards: result.didPlay ? result.redCards : 0,
      metrics: result.didPlay ? pruneMetrics(result.metrics) : {},
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
      subtitle={`${match.venue === 'away' ? '@' : 'vs'} ${them} · ${formatDateShort(match.date)} · ${formatTime(match.time)}${competition ? ` · ${competition.name}` : ''}`}
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
      <div className="scoreboard">
        <div className="score-side">
          <span className="score-team">{us}</span>
          <Stepper label={us} value={result.goalsFor} onChange={(v) => patch({ goalsFor: v })} max={50} accent />
        </div>
        <div className="score-dash">–</div>
        <div className="score-side">
          <span className="score-team">{them}</span>
          <Stepper label={them} value={result.goalsAgainst} onChange={(v) => patch({ goalsAgainst: v })} max={50} accent />
        </div>
      </div>

      {result.didPlay && (
        <>
          <Field label="Position played" hint="Changes which stats are tracked below">
            <div className="chip-wrap">
              {(Object.keys(POSITIONS_BY_GROUP) as PositionGroup[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={g === group ? 'filter-chip on' : 'filter-chip'}
                  onClick={() => changeGroup(g)}
                >
                  {POSITION_GROUP_LABEL[g]}
                </button>
              ))}
            </div>
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

          <button className="link-btn" onClick={() => setShowDetail((s) => !s)}>
            {showDetail ? 'Hide extra detail' : 'Add more detail (minutes, cards, rating)'}
          </button>

          {showDetail && (
            <div className="detail-block">
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

              <div className="row two">
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
                <Field label="Your rating" hint="Out of 10">
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={10}
                    step={0.5}
                    value={result.rating ?? ''}
                    placeholder="-"
                    onChange={(e) => patch({ rating: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </Field>
              </div>
            </div>
          )}
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

      {/* The things that are true of few matches. Kept out of the main flow so
          entering a normal result is a scoreline and your stats, and nothing
          else - but one tap away when a match was odd. */}
      <button className="link-btn" onClick={() => setShowExtra((s) => !s)}>
        {showExtra ? 'Hide extra settings' : 'Extra settings'}
      </button>

      {/* Anything set in here would otherwise be invisible once collapsed, which
          is how a match ends up quietly marked as one you did not play. */}
      {!showExtra && extraSummary.length > 0 && (
        <p className="muted small">{extraSummary.join(' · ')}</p>
      )}

      {showExtra && (
        <div className="detail-block">
          <label className="toggle-row">
            <input type="checkbox" checked={result.motm} onChange={(e) => patch({ motm: e.target.checked })} />
            <span>I was man of the match 🏅</span>
          </label>

          <label className="toggle-row">
            <input type="checkbox" checked={result.didPlay} onChange={(e) => patch({ didPlay: e.target.checked })} />
            <span>I played in this match</span>
          </label>

          {isDraw && (
            <label className="toggle-row">
              <input type="checkbox" checked={showPens} onChange={(e) => setShowPens(e.target.checked)} />
              <span>Decided on penalties</span>
            </label>
          )}

          {isDraw && showPens && (
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

          <button
            className="danger-link"
            onClick={() => {
              cancelMatch(match.id);
              onClose();
            }}
          >
            This match didn't happen (called off)
          </button>
        </div>
      )}
    </Sheet>
  );
}
