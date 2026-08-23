import { useStore } from '../store/AppStore';
import { METRIC_BY_ID, VENUE_LABEL, type Match, type MetricId } from '../types';
import { formatDateLong, formatTime, kickoffAt, relativeDayLabel } from '../lib/date';
import { outcomeOf, scoreline, shootoutWinner } from '../lib/stats';
import { matchScore, scoreBand, scoreVerdict } from '../lib/score';
import { MediaGallery } from './MediaGallery';
import { Sheet } from './ui';

export function MatchDetailSheet({
  match,
  now,
  onClose,
  onEdit,
  onEnterResult,
}: {
  match: Match | null;
  now: Date;
  onClose: () => void;
  onEdit: (match: Match) => void;
  onEnterResult: (match: Match) => void;
}) {
  const { competitionOf, teamOf, deleteMatch, cancelMatch, restoreMatch } = useStore();
  if (!match) return null;

  const competition = competitionOf(match);
  const team = teamOf(match);
  const kickoff = kickoffAt(match.date, match.time);
  const started = kickoff.getTime() <= now.getTime();
  const us = team?.name?.trim() || 'Us';
  const result = match.result;
  const performance = result?.didPlay ? matchScore(result) : null;

  const remove = () => {
    if (confirm(`Delete the match against ${match.opponent}? This can't be undone.`)) {
      deleteMatch(match.id);
      onClose();
    }
  };

  return (
    <Sheet
      open
      title={`${match.venue === 'away' ? '@' : 'vs'} ${match.opponent || 'TBC'}`}
      subtitle={`${formatDateLong(match.date)} · ${formatTime(match.time)}`}
      onClose={onClose}
      footer={
        <>
          <button className="ghost-btn wide" onClick={() => onEdit(match)}>
            Edit match
          </button>
          {match.status !== 'cancelled' && (
            <button className="primary-btn wide" onClick={() => onEnterResult(match)}>
              {result ? 'Edit result' : started ? 'Enter result' : 'Log result early'}
            </button>
          )}
        </>
      }
    >
      {result && (
        <div className={`result-hero outcome-${outcomeOf(result).toLowerCase()}`}>
          <div className="result-score">{scoreline(result)}</div>
          <div className="result-caption">
            {outcomeOf(result) === 'W' ? 'Win' : outcomeOf(result) === 'L' ? 'Defeat' : 'Draw'}
            {shootoutWinner(result) === 'us' && ' · won on penalties'}
            {shootoutWinner(result) === 'them' && ' · lost on penalties'}
            {` · ${us} ${match.venue === 'away' ? 'away' : match.venue === 'home' ? 'at home' : 'neutral venue'}`}
          </div>
        </div>
      )}

      {performance && result && (
        <div className="performance">
          <div className={`perf-head band-${scoreBand(performance.score)}`}>
            <div className="perf-score">
              {performance.score}
              <span>/100</span>
            </div>
            <div className="perf-verdict">
              <strong>{scoreVerdict(performance.score)}</strong>
              <span>
                {result.position} · {result.minutes} mins
                {result.motm ? ' · Man of the match' : ''}
              </span>
            </div>
          </div>

          <div className="perf-stats">
            {(Object.keys(result.metrics) as MetricId[])
              .filter((id) => (result.metrics[id] ?? 0) !== 0)
              .map((id) => (
                <div key={id} className="perf-stat">
                  <span className="perf-stat-value">{result.metrics[id]}</span>
                  <span className="perf-stat-label">{METRIC_BY_ID[id]?.short ?? id}</span>
                </div>
              ))}
            {result.goalsAgainst === 0 && (
              <div className="perf-stat">
                <span className="perf-stat-value">✓</span>
                <span className="perf-stat-label">Clean sheet</span>
              </div>
            )}
            {result.rating !== null && (
              <div className="perf-stat">
                <span className="perf-stat-value">{result.rating}</span>
                <span className="perf-stat-label">Your rating</span>
              </div>
            )}
          </div>

          <details className="perf-breakdown">
            <summary>How this score was worked out</summary>
            <ul>
              {performance.breakdown.map((part, i) => (
                <li key={i}>
                  <span>{part.label}</span>
                  <span className={part.points > 0 ? 'plus' : part.points < 0 ? 'minus' : 'neutral'}>
                    {part.points > 0 ? '+' : ''}
                    {part.points === 0 ? '—' : Math.round(part.points * 10) / 10}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {result && !result.didPlay && <p className="muted small">You didn't feature in this match.</p>}

      <dl className="detail-list">
        <div>
          <dt>When</dt>
          <dd>
            {relativeDayLabel(match.date, now)} · {formatTime(match.time)}
          </dd>
        </div>
        <div>
          <dt>Team</dt>
          <dd>{team ? `${team.name}${team.ageGroup ? ` · ${team.ageGroup}` : ''}` : 'Not set'}</dd>
        </div>
        <div>
          <dt>Venue</dt>
          <dd>
            {VENUE_LABEL[match.venue]}
            {match.location ? ` · ${match.location}` : ''}
          </dd>
        </div>
        <div>
          <dt>Competition</dt>
          <dd>{competition ? `${competition.name}${competition.season ? ` · ${competition.season}` : ''}` : 'None'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd className="cap">{match.status}</dd>
        </div>
      </dl>

      <MediaGallery matchId={match.id} />

      {match.notes && (
        <div className="notes-block">
          <h3>Notes</h3>
          <p>{match.notes}</p>
        </div>
      )}

      <div className="sheet-actions">
        {match.status === 'cancelled' ? (
          <button className="ghost-btn" onClick={() => restoreMatch(match.id)}>
            Restore match
          </button>
        ) : (
          <button className="ghost-btn" onClick={() => cancelMatch(match.id)}>
            Mark as called off
          </button>
        )}
        <button className="danger-link" onClick={remove}>
          Delete match
        </button>
      </div>
    </Sheet>
  );
}
