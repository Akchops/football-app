import { useMemo, useState } from 'react';
import { useStore } from '../store/AppStore';
import type { Match } from '../types';
import { MONTH_NAMES, fromISODate, kickoffAt } from '../lib/date';
import { pendingResultMatches, playedMatches, upcomingMatches } from '../lib/stats';
import { MatchCard } from './MatchCard';
import { EmptyState, Segmented } from './ui';

type Tab = 'upcoming' | 'results' | 'all';

export function MatchesScreen({
  now,
  onOpenMatch,
  onAddMatch,
  onEnterResult,
}: {
  now: Date;
  onOpenMatch: (match: Match) => void;
  onAddMatch: (dateISO?: string) => void;
  onEnterResult: (match: Match) => void;
}) {
  const { matches, competitions, competitionOf, settings } = useStore();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [competitionId, setCompetitionId] = useState<string>('all');

  const filtered = useMemo(
    () => (competitionId === 'all' ? matches : matches.filter((m) => (m.competitionId ?? '') === competitionId)),
    [matches, competitionId],
  );

  const pending = pendingResultMatches(filtered, settings, now);
  const upcoming = upcomingMatches(filtered, now);
  const played = playedMatches(filtered);
  const cancelled = filtered
    .filter((m) => m.status === 'cancelled')
    .sort((a, b) => kickoffAt(b.date, b.time).getTime() - kickoffAt(a.date, a.time).getTime());

  const groupByMonth = (list: Match[]) => {
    const groups: { key: string; label: string; items: Match[] }[] = [];
    for (const m of list) {
      const d = fromISODate(m.date);
      const key = m.date.slice(0, 7);
      const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(m);
      else groups.push({ key, label, items: [m] });
    }
    return groups;
  };

  const renderList = (list: Match[], showDate = true) =>
    groupByMonth(list).map((group) => (
      <div key={group.key} className="month-group">
        <h3 className="group-label">{group.label}</h3>
        <div className="list">
          {group.items.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              competition={competitionOf(m)}
              showDate={showDate}
              now={now}
              onOpen={() => onOpenMatch(m)}
              onEnterResult={() => onEnterResult(m)}
            />
          ))}
        </div>
      </div>
    ));

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Matches</h1>
        <button className="primary-btn small" onClick={() => onAddMatch()}>
          + Add
        </button>
      </div>

      <Segmented
        options={[
          { value: 'upcoming', label: `Upcoming ${upcoming.length ? `(${upcoming.length})` : ''}`.trim() },
          { value: 'results', label: `Results ${played.length ? `(${played.length})` : ''}`.trim() },
          { value: 'all', label: 'All' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {competitions.length > 0 && (
        <div className="chip-scroll">
          <button
            className={competitionId === 'all' ? 'filter-chip on' : 'filter-chip'}
            onClick={() => setCompetitionId('all')}
          >
            All competitions
          </button>
          {competitions.map((c) => (
            <button
              key={c.id}
              className={competitionId === c.id ? 'filter-chip on' : 'filter-chip'}
              onClick={() => setCompetitionId(c.id)}
              style={competitionId === c.id ? { borderColor: c.color, color: c.color } : undefined}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {tab === 'upcoming' && (
        <>
          {pending.length > 0 && (
            <div className="month-group">
              <h3 className="group-label warn">Waiting on a result</h3>
              <div className="list">
                {pending.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    competition={competitionOf(m)}
                    showDate
                    now={now}
                    onOpen={() => onOpenMatch(m)}
                    onEnterResult={() => onEnterResult(m)}
                  />
                ))}
              </div>
            </div>
          )}
          {upcoming.length === 0 && pending.length === 0 ? (
            <EmptyState
              icon="📅"
              title="No fixtures coming up"
              message="Add the next match and it'll appear here and on the calendar."
              action={
                <button className="primary-btn" onClick={() => onAddMatch()}>
                  Add a match
                </button>
              }
            />
          ) : (
            renderList(upcoming)
          )}
        </>
      )}

      {tab === 'results' &&
        (played.length === 0 ? (
          <EmptyState
            icon="📝"
            title="No results yet"
            message="Once a match kicks off, the app will ask you to log the score."
          />
        ) : (
          renderList(played)
        ))}

      {tab === 'all' && (
        <>
          {renderList([...filtered].sort((a, b) => kickoffAt(b.date, b.time).getTime() - kickoffAt(a.date, a.time).getTime()))}
          {cancelled.length > 0 && <p className="muted small">{cancelled.length} called off</p>}
          {filtered.length === 0 && (
            <EmptyState icon="⚽" title="Nothing here yet" message="Matches you add will be listed here." />
          )}
        </>
      )}
    </div>
  );
}
