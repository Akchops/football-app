import { useMemo, useState } from 'react';
import { useStore } from '../store/AppStore';
import type { Match } from '../types';
import { formatDateShort, formatTime, kickoffAt } from '../lib/date';
import { outcomeOf, scoreline } from '../lib/stats';
import { Sheet } from './ui';

/**
 * "Which match is this from?" - used when adding photos or clips from the
 * Media tab, and when moving one to a different match.
 */
export function MatchPickerSheet({
  open,
  title,
  subtitle,
  currentMatchId,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  currentMatchId?: string;
  onPick: (matchId: string) => void;
  onClose: () => void;
}) {
  const { matches, competitionOf, teamOf, teams } = useStore();
  const [query, setQuery] = useState('');

  // A photo is nearly always from the match just played, so recent past matches
  // come first, then upcoming ones soonest-first.
  const ordered = useMemo(() => {
    const now = Date.now();
    const live = matches.filter((m) => m.status !== 'cancelled');
    const past = live
      .filter((m) => kickoffAt(m.date, m.time).getTime() <= now)
      .sort((a, b) => kickoffAt(b.date, b.time).getTime() - kickoffAt(a.date, a.time).getTime());
    const upcoming = live
      .filter((m) => kickoffAt(m.date, m.time).getTime() > now)
      .sort((a, b) => kickoffAt(a.date, a.time).getTime() - kickoffAt(b.date, b.time).getTime());
    return [...past, ...upcoming];
  }, [matches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((m) => {
      const team = teamOf(m)?.name ?? '';
      const competition = competitionOf(m)?.name ?? '';
      return [m.opponent, team, competition, m.date].join(' ').toLowerCase().includes(q);
    });
  }, [ordered, query, teamOf, competitionOf]);

  if (!open) return null;

  const row = (match: Match) => {
    const competition = competitionOf(match);
    const team = teamOf(match);
    return (
      <button
        key={match.id}
        className={match.id === currentMatchId ? 'picker-row on' : 'picker-row'}
        onClick={() => onPick(match.id)}
      >
        <span className="picker-main">
          <span className="picker-opponent">
            {match.venue === 'away' ? '@' : 'vs'} {match.opponent || 'TBC'}
          </span>
          <span className="picker-meta">
            {formatDateShort(match.date)} · {formatTime(match.time)}
            {teams.length > 1 && team ? ` · ${team.name}` : ''}
            {competition ? ` · ${competition.name}` : ''}
          </span>
        </span>
        {match.result && (
          <span className={`badge outcome-${outcomeOf(match.result).toLowerCase()}`}>
            {scoreline(match.result)}
          </span>
        )}
      </button>
    );
  };

  return (
    <Sheet open title={title} subtitle={subtitle} onClose={onClose}>
      {matches.length > 6 && (
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by opponent, team or date"
          aria-label="Search matches"
        />
      )}

      <button className={currentMatchId ? 'picker-row' : 'picker-row on'} onClick={() => onPick('')}>
        <span className="picker-main">
          <span className="picker-opponent">Not sure yet</span>
          <span className="picker-meta">Keep it unfiled and pick a match later</span>
        </span>
      </button>

      {filtered.length === 0 ? (
        <p className="muted small">
          {matches.length === 0 ? 'Add a match first and it will show up here.' : 'No matches found.'}
        </p>
      ) : (
        <div className="list">{filtered.map(row)}</div>
      )}
    </Sheet>
  );
}
