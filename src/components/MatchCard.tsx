import type { Competition, Match } from '../types';
import { VENUE_LABEL } from '../types';
import { countdown, formatDateShort, formatTime, kickoffAt } from '../lib/date';
import { outcomeOf, scoreline, shootoutWinner } from '../lib/stats';

export function ResultBadge({ match }: { match: Match }) {
  if (match.status === 'cancelled') return <span className="badge cancelled">Called off</span>;
  if (!match.result) return null;
  const outcome = outcomeOf(match.result);
  const pens = shootoutWinner(match.result);
  const label = outcome === 'W' ? 'W' : outcome === 'L' ? 'L' : pens === 'us' ? 'D+' : 'D';
  return (
    <span className={`badge outcome-${outcome.toLowerCase()}`}>
      {label} {scoreline(match.result)}
    </span>
  );
}

export function MatchCard({
  match,
  competition,
  showDate = false,
  onOpen,
  onEnterResult,
  now = new Date(),
}: {
  match: Match;
  competition: Competition | null;
  showDate?: boolean;
  onOpen: () => void;
  onEnterResult?: () => void;
  now?: Date;
}) {
  const kickoff = kickoffAt(match.date, match.time);
  const awaitingResult = match.status === 'scheduled' && kickoff.getTime() <= now.getTime();
  const upcoming = match.status === 'scheduled' && kickoff.getTime() > now.getTime();

  return (
    <div className={`match-card${match.status === 'cancelled' ? ' is-cancelled' : ''}`}>
      <button className="match-main" onClick={onOpen}>
        <span className="match-rail" style={{ background: competition?.color ?? 'var(--line)' }} aria-hidden="true" />
        <span className="match-when">
          {showDate && <span className="match-date">{formatDateShort(match.date)}</span>}
          <span className="match-time">{formatTime(match.time)}</span>
        </span>
        <span className="match-body">
          <span className="match-opponent">
            <span className="vs">{match.venue === 'away' ? '@' : 'vs'}</span> {match.opponent || 'TBC'}
          </span>
          <span className="match-meta">
            {competition && <span className="meta-chip">{competition.name}</span>}
            <span className="meta-chip subtle">{VENUE_LABEL[match.venue]}</span>
            {match.location && <span className="meta-chip subtle">{match.location}</span>}
          </span>
        </span>
        <span className="match-right">
          <ResultBadge match={match} />
          {upcoming && <span className="countdown">{countdown(kickoff, now)}</span>}
          {awaitingResult && <span className="badge pending">Result?</span>}
        </span>
      </button>
      {awaitingResult && onEnterResult && (
        <button className="match-cta" onClick={onEnterResult}>
          Enter result
        </button>
      )}
    </div>
  );
}
