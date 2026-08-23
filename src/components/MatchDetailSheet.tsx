import { useStore } from '../store/AppStore';
import { VENUE_LABEL, type Match } from '../types';
import { formatDateLong, formatTime, kickoffAt, relativeDayLabel } from '../lib/date';
import { outcomeOf, scoreline, shootoutWinner } from '../lib/stats';
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
  const { competitionOf, deleteMatch, cancelMatch, restoreMatch, settings } = useStore();
  if (!match) return null;

  const competition = competitionOf(match);
  const kickoff = kickoffAt(match.date, match.time);
  const started = kickoff.getTime() <= now.getTime();
  const us = settings.teamName.trim() || 'Us';

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
              {match.result ? 'Edit result' : started ? 'Enter result' : 'Log result early'}
            </button>
          )}
        </>
      }
    >
      {match.result && (
        <div className={`result-hero outcome-${outcomeOf(match.result).toLowerCase()}`}>
          <div className="result-score">{scoreline(match.result)}</div>
          <div className="result-caption">
            {outcomeOf(match.result) === 'W' ? 'Win' : outcomeOf(match.result) === 'L' ? 'Defeat' : 'Draw'}
            {shootoutWinner(match.result) === 'us' && ' · won on penalties'}
            {shootoutWinner(match.result) === 'them' && ' · lost on penalties'}
            {` · ${us} ${match.venue === 'away' ? 'away' : match.venue === 'home' ? 'at home' : 'neutral venue'}`}
          </div>
        </div>
      )}

      <dl className="detail-list">
        <div>
          <dt>When</dt>
          <dd>
            {relativeDayLabel(match.date, now)} · {formatTime(match.time)}
          </dd>
        </div>
        <div>
          <dt>Venue</dt>
          <dd>{VENUE_LABEL[match.venue]}{match.location ? ` · ${match.location}` : ''}</dd>
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

      {match.result?.didPlay && (
        <div className="your-game">
          <h3>Your game</h3>
          <div className="chips">
            <span className="chip">{match.result.goals} goals</span>
            <span className="chip">{match.result.assists} assists</span>
            <span className="chip">{match.result.minutes} mins</span>
            <span className="chip">{match.result.position}</span>
            {match.result.rating !== null && <span className="chip">{match.result.rating}/10</span>}
            {match.result.yellowCards > 0 && <span className="chip warn">{match.result.yellowCards} yellow</span>}
            {match.result.redCards > 0 && <span className="chip danger">{match.result.redCards} red</span>}
            {match.result.motm && <span className="chip gold">Man of the match</span>}
          </div>
        </div>
      )}

      {match.result && !match.result.didPlay && <p className="muted small">You didn't feature in this match.</p>}

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
