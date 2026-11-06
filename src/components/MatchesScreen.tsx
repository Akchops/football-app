import { useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useStore } from '../store/AppStore';
import type { Match } from '../types';
import { MONTH_NAMES, fromISODate, kickoffAt } from '../lib/date';
import { pendingResultMatches, playedMatches, statsByTournament, upcomingMatches } from '../lib/stats';
import { exitOf, springs, stagger } from '../lib/motion';
import { useMatchesTop } from '../useAppearance';
import { MatchRow } from './MatchRow';
import { NextMatchHero } from './NextMatchHero';
import { TournamentList } from './TournamentList';
import { ChevronIcon, MediaIcon } from './icons';
import { EmptyState, Segmented, Sheet } from './ui';

type Tab = 'upcoming' | 'results' | 'all' | 'tournaments';

export function MatchesScreen({
  now,
  onOpenMatch,
  onAddMatch,
  onEnterResult,
  onEditMatch,
  onAddTournament,
  onOpenCompetition,
  onOpenClips,
  clipCount,
}: {
  now: Date;
  onOpenMatch: (match: Match) => void;
  onAddMatch: (dateISO?: string) => void;
  onEnterResult: (match: Match) => void;
  onEditMatch: (match: Match) => void;
  onAddTournament: () => void;
  onOpenCompetition: (id: string, step?: 'summary' | 'finish') => void;
  onOpenClips: () => void;
  clipCount: number;
}) {
  const { matches, competitions, teams, settings } = useStore();
  const [top] = useMatchesTop();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [competitionId, setCompetitionId] = useState<string>('all');
  const [teamId, setTeamId] = useState<string>('all');
  const [filtering, setFiltering] = useState(false);

  const filtered = useMemo(
    () =>
      matches
        .filter((m) => competitionId === 'all' || (m.competitionId ?? '') === competitionId)
        .filter((m) => teamId === 'all' || (m.teamId ?? '') === teamId),
    [matches, competitionId, teamId],
  );

  const pending = pendingResultMatches(filtered, settings, now);
  const upcoming = upcomingMatches(filtered, now);
  const played = playedMatches(filtered);
  const next = upcomingMatches(matches, now)[0] ?? null;
  const cancelled = filtered.filter((m) => m.status === 'cancelled').length;

  // Every tournament, not just the one a filter picks - this is the list of them.
  const tournaments = useMemo(() => statsByTournament(matches, competitions, now), [matches, competitions, now]);
  const going = tournaments.filter((t) => t.status === 'playing' || t.status === 'played');
  const comingUp = tournaments
    .filter((t) => t.status === 'upcoming')
    .sort((a, b) => (a.from || '9999').localeCompare(b.from || '9999'));
  const finished = tournaments.filter((t) => t.status === 'finished');

  const activeFilters = (competitionId === 'all' ? 0 : 1) + (teamId === 'all' ? 0 : 1);
  const canFilter = teams.length > 1 || competitions.length > 0;

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

  let row = 0;
  const rows = (list: Match[]) => (
    <div className="list-group">
      {list.map((match) => (
        <m.div key={match.id} layout="position" {...stagger(row++)}>
          <MatchRow
            match={match}
            now={now}
            onOpen={() => onOpenMatch(match)}
            onEnterResult={() => onEnterResult(match)}
            onEdit={() => onEditMatch(match)}
          />
        </m.div>
      ))}
    </div>
  );
  const byMonth = (list: Match[]) =>
    groupByMonth(list).map((group) => (
      <section key={group.key} className="month-group">
        <h3 className="group-label">{group.label}</h3>
        {rows(group.items)}
      </section>
    ));

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Matches</h1>
        <div className="head-actions">
          {top === 'list' && (
            <button className="toolbar-btn" onClick={onOpenClips} aria-label={`Clips (${clipCount})`}>
              <MediaIcon />
            </button>
          )}
          {canFilter && (
            <button
              className={activeFilters ? 'toolbar-btn text on' : 'toolbar-btn text'}
              onClick={() => setFiltering(true)}
            >
              Filter{activeFilters ? ` · ${activeFilters}` : ''}
            </button>
          )}
        </div>
      </div>

      {top === 'hero' && next && tab !== 'tournaments' && (
        <NextMatchHero key={next.id} match={next} onOpen={() => onOpenMatch(next)} />
      )}

      {top === 'hero' && (
        <button className="clips-row" onClick={onOpenClips}>
          <span className="icon-square" style={{ background: '#ff375f' }}>
            <MediaIcon />
          </span>
          <span className="clips-row-text">
            <strong>Clips</strong>
            <span>{clipCount ? `${clipCount} saved from your matches` : 'Videos and photos from your games'}</span>
          </span>
          <span className="row-chevron" aria-hidden="true">
            <ChevronIcon />
          </span>
        </button>
      )}

      <Segmented
        options={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'results', label: 'Results' },
          { value: 'all', label: 'All' },
          { value: 'tournaments', label: 'Tournaments' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* The old list fades out over the new one as it arrives: no blank moment between. */}
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div
          key={tab}
          className="seg-panel"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: exitOf({ duration: 0.22 }) }}
          transition={springs.smooth}
        >
      {tab === 'upcoming' && (
        <>
          {pending.length > 0 && (
            <section className="month-group">
              <h3 className="group-label warn">Waiting on a result</h3>
              {rows(pending)}
            </section>
          )}
          {upcoming.length === 0 && pending.length === 0 ? (
            <EmptyState
              icon="📅"
              title="No fixtures coming up"
              message="Tap + to add the next match. It'll show here and on the calendar."
              action={
                <button className="primary-btn" onClick={() => onAddMatch()}>
                  Add a match
                </button>
              }
            />
          ) : (
            byMonth(upcoming)
          )}
        </>
      )}

      {tab === 'results' &&
        (played.length === 0 ? (
          <EmptyState icon="📝" title="No results yet" message="Once a match kicks off, the app asks you for the score." />
        ) : (
          byMonth(played)
        ))}

      {tab === 'tournaments' &&
        (tournaments.length === 0 ? (
          <EmptyState
            icon="🏆"
            title="No tournaments yet"
            message="Add one and all of its matches go in at once. Every tournament you play shows up here, finished or not."
            action={
              <button className="primary-btn" onClick={onAddTournament}>
                Add a tournament
              </button>
            }
          />
        ) : (
          [
            { label: 'Still going', rows: going },
            { label: 'Coming up', rows: comingUp },
            { label: 'Finished', rows: finished },
          ]
            .filter((group) => group.rows.length > 0)
            .map((group) => (
              <section key={group.label} className="month-group">
                <h3 className="group-label">{group.label}</h3>
                <TournamentList
                  rows={group.rows}
                  now={now}
                  onOpen={(id) => onOpenCompetition(id)}
                  onFinish={(id) => onOpenCompetition(id, 'finish')}
                />
              </section>
            ))
        ))}

      {tab === 'all' && (
        <>
          {byMonth([...filtered].sort((a, b) => kickoffAt(b.date, b.time).getTime() - kickoffAt(a.date, a.time).getTime()))}
          {cancelled > 0 && <p className="muted small">{cancelled} called off</p>}
          {filtered.length === 0 && (
            <EmptyState icon="⚽" title="Nothing here yet" message="Matches you add will be listed here." />
          )}
        </>
      )}

        </m.div>
      </AnimatePresence>

      {tab !== 'tournaments' && <p className="list-hint">Swipe a match left for more, or hold it for a menu.</p>}

      <Sheet open={filtering} title="Filter" subtitle="Show matches for" onClose={() => setFiltering(false)}>
        {teams.length > 1 && (
          <div className="choice-group" role="radiogroup" aria-label="Team">
            <h3 className="group-label">Team</h3>
            <div className="list-group">
              {[{ id: 'all', name: 'All teams' }, ...teams].map((t) => (
                <button
                  key={t.id}
                  role="radio"
                  aria-checked={teamId === t.id}
                  className="choice-row"
                  onClick={() => setTeamId(t.id)}
                >
                  <span>{t.name}</span>
                  {teamId === t.id && (
                    <m.span layoutId="filter-team-check" className="choice-check" transition={springs.snappy}>
                      ✓
                    </m.span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        {competitions.length > 0 && (
          <div className="choice-group" role="radiogroup" aria-label="Competition">
            <h3 className="group-label">Competition</h3>
            <div className="list-group">
              {[{ id: 'all', name: 'All competitions' }, ...competitions].map((c) => (
                <button
                  key={c.id}
                  role="radio"
                  aria-checked={competitionId === c.id}
                  className="choice-row"
                  onClick={() => setCompetitionId(c.id)}
                >
                  <span>{c.name}</span>
                  {competitionId === c.id && (
                    <m.span layoutId="filter-comp-check" className="choice-check" transition={springs.snappy}>
                      ✓
                    </m.span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
