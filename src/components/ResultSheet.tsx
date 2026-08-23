import { useEffect, useState } from 'react';
import { useStore } from '../store/AppStore';
import { POSITIONS, emptyResult, type Match, type MatchResult } from '../types';
import { formatDateShort, formatTime } from '../lib/date';
import { Field, Sheet, Stepper } from './ui';

/**
 * Entering a result for one match. Also used by the post-kickoff prompt,
 * where `onSkip` offers "remind me later" instead of a plain cancel.
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
  const { saveResult, updateMatch, settings, competitionOf, cancelMatch } = useStore();
  const [result, setResult] = useState<MatchResult>(() => emptyResult(settings.defaultPosition));
  const [notes, setNotes] = useState('');
  const [showPens, setShowPens] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    if (!match) return;
    const existing = match.result;
    setResult(existing ?? emptyResult(settings.defaultPosition));
    setNotes(match.notes ?? '');
    setShowPens(existing?.penaltiesFor !== null && existing?.penaltiesFor !== undefined);
    setShowDetail(Boolean(existing));
  }, [match, settings.defaultPosition]);

  if (!match) return null;

  const competition = competitionOf(match);
  const patch = (over: Partial<MatchResult>) => setResult((r) => ({ ...r, ...over }));
  const isDraw = result.goalsFor === result.goalsAgainst;
  const us = settings.teamName.trim() || 'Us';
  const them = match.opponent.trim() || 'Them';

  const save = () => {
    const cleaned: MatchResult = {
      ...result,
      penaltiesFor: showPens && isDraw ? result.penaltiesFor ?? 0 : null,
      penaltiesAgainst: showPens && isDraw ? result.penaltiesAgainst ?? 0 : null,
      minutes: result.didPlay ? result.minutes : 0,
      goals: result.didPlay ? result.goals : 0,
      assists: result.didPlay ? result.assists : 0,
      yellowCards: result.didPlay ? result.yellowCards : 0,
      redCards: result.didPlay ? result.redCards : 0,
      motm: result.didPlay ? result.motm : false,
      rating: result.didPlay ? result.rating : null,
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

      <label className="toggle-row">
        <input type="checkbox" checked={result.didPlay} onChange={(e) => patch({ didPlay: e.target.checked })} />
        <span>I played in this match</span>
      </label>

      {result.didPlay && (
        <>
          <div className="stat-steppers">
            <Stepper label="Goals" value={result.goals} onChange={(v) => patch({ goals: v })} max={20} />
            <Stepper label="Assists" value={result.assists} onChange={(v) => patch({ assists: v })} max={20} />
          </div>

          <button className="link-btn" onClick={() => setShowDetail((s) => !s)}>
            {showDetail ? 'Hide extra detail' : 'Add more detail (minutes, cards, rating)'}
          </button>

          {showDetail && (
            <div className="detail-block">
              <div className="stat-steppers">
                <Stepper label="Minutes" value={result.minutes} onChange={(v) => patch({ minutes: v })} max={130} step={5} />
                <Stepper label="Yellows" value={result.yellowCards} onChange={(v) => patch({ yellowCards: v })} max={2} />
                <Stepper label="Reds" value={result.redCards} onChange={(v) => patch({ redCards: v })} max={1} />
              </div>

              <div className="row two">
                <Field label="Position">
                  <select className="input" value={result.position} onChange={(e) => patch({ position: e.target.value })}>
                    {POSITIONS.map((p) => (
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

              <label className="toggle-row">
                <input type="checkbox" checked={result.motm} onChange={(e) => patch({ motm: e.target.checked })} />
                <span>Man of the match 🏅</span>
              </label>
            </div>
          )}
        </>
      )}

      <Field label="Match notes" hint="Optional">
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering?" />
      </Field>

      <button
        className="danger-link"
        onClick={() => {
          cancelMatch(match.id);
          onClose();
        }}
      >
        This match didn't happen (called off)
      </button>
    </Sheet>
  );
}
