import { useMemo, useState } from 'react';
import { useStore } from '../store/AppStore';
import { VENUE_LABEL } from '../types';
import { formatDateShort } from '../lib/date';
import {
  computeStats, recordSummary, scoreline, statsByCompetition, statsByMonth, statsByOpponent, statsByVenue,
} from '../lib/stats';
import { EmptyState, Section, StatTile } from './ui';

export function StatsScreen({ now, onGoToMatches }: { now: Date; onGoToMatches: () => void }) {
  const { matches, competitions, settings } = useStore();
  const [competitionId, setCompetitionId] = useState<string>('all');

  const scoped = useMemo(
    () => (competitionId === 'all' ? matches : matches.filter((m) => (m.competitionId ?? '') === competitionId)),
    [matches, competitionId],
  );

  const stats = useMemo(() => computeStats(scoped), [scoped]);
  const byComp = useMemo(() => statsByCompetition(matches, competitions), [matches, competitions]);
  const byMonth = useMemo(() => statsByMonth(scoped, 6, now), [scoped, now]);
  const byVenue = useMemo(() => statsByVenue(scoped), [scoped]);
  const byOpponent = useMemo(() => statsByOpponent(scoped), [scoped]);

  if (stats.played === 0) {
    return (
      <div className="screen">
        <div className="screen-head">
          <h1>Stats</h1>
        </div>
        <EmptyState
          icon="📊"
          title="No stats yet"
          message="Log a couple of results and this page fills up: record, goals, assists, form and more."
          action={
            <button className="primary-btn" onClick={onGoToMatches}>
              Go to matches
            </button>
          }
        />
      </div>
    );
  }

  const maxMonth = Math.max(1, ...byMonth.map((b) => b.played));
  const winPct = Math.round(stats.winRate * 100);
  const drawPct = stats.played ? Math.round((stats.draws / stats.played) * 100) : 0;
  const lossPct = Math.max(0, 100 - winPct - drawPct);

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Stats</h1>
        {settings.playerName && <span className="muted small">{settings.playerName}</span>}
      </div>

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

      <div className="record-hero">
        <div className="record-line">
          <div>
            <div className="record-big">{recordSummary(stats)}</div>
            <div className="record-sub">
              {stats.played} played · {winPct}% win rate · {stats.pointsPerGame.toFixed(2)} pts/game
            </div>
          </div>
          {stats.streak && stats.streak.count > 1 && (
            <div className={`streak outcome-${stats.streak.type.toLowerCase()}`}>
              {stats.streak.count} {stats.streak.type === 'W' ? 'wins' : stats.streak.type === 'L' ? 'losses' : 'draws'}
              <span>in a row</span>
            </div>
          )}
        </div>

        <div className="wdl-bar" role="img" aria-label={`${winPct}% wins, ${drawPct}% draws, ${lossPct}% losses`}>
          <span className="wdl w" style={{ width: `${winPct}%` }} />
          <span className="wdl d" style={{ width: `${drawPct}%` }} />
          <span className="wdl l" style={{ width: `${lossPct}%` }} />
        </div>

        {stats.form.length > 0 && (
          <div className="form-guide">
            <span className="form-label">Form</span>
            {stats.form.map((f, i) => (
              <span key={i} className={`form-pill outcome-${f.toLowerCase()}`}>
                {f}
              </span>
            ))}
            <span className="muted small">most recent first</span>
          </div>
        )}
      </div>

      <div className="tile-grid">
        <StatTile label="Goals for" value={stats.goalsFor} sub={`${(stats.goalsFor / stats.played).toFixed(1)} per game`} />
        <StatTile label="Goals against" value={stats.goalsAgainst} sub={`${(stats.goalsAgainst / stats.played).toFixed(1)} per game`} />
        <StatTile label="Goal difference" value={stats.goalDifference > 0 ? `+${stats.goalDifference}` : stats.goalDifference} />
        <StatTile label="Clean sheets" value={stats.cleanSheets} sub={`${stats.failedToScore} blanks`} />
      </div>

      <Section title="Your game">
        <div className="tile-grid">
          <StatTile label="Appearances" value={stats.appearances} sub={`${stats.minutes} mins`} />
          <StatTile label="Goals" value={stats.goals} sub={`${stats.goalsPerMatch.toFixed(2)} per game`} />
          <StatTile label="Assists" value={stats.assists} />
          <StatTile label="G + A" value={stats.contributions} sub={stats.minutesPerGoalContribution ? `1 every ${Math.round(stats.minutesPerGoalContribution)} mins` : undefined} />
          <StatTile label="Avg rating" value={stats.averageRating ? stats.averageRating.toFixed(1) : '–'} sub="out of 10" />
          <StatTile label="MOTM" value={stats.motm} sub={`${stats.yellowCards}Y / ${stats.redCards}R`} />
        </div>
      </Section>

      <Section title="Last 6 months">
        <div className="bar-chart">
          {byMonth.map((b) => (
            <div key={b.key} className="bar-col">
              <div className="bar-stack" style={{ height: `${(b.played / maxMonth) * 100}%` }} title={`${b.played} matches`}>
                {b.wins > 0 && <span className="bar w" style={{ flex: b.wins }} />}
                {b.draws > 0 && <span className="bar d" style={{ flex: b.draws }} />}
                {b.losses > 0 && <span className="bar l" style={{ flex: b.losses }} />}
              </div>
              <span className="bar-count">{b.played || ''}</span>
              <span className="bar-label">{b.label}</span>
            </div>
          ))}
        </div>
        <p className="muted small">
          {byMonth.reduce((sum, b) => sum + b.goals, 0)} goals and {byMonth.reduce((sum, b) => sum + b.assists, 0)} assists
          in this window.
        </p>
      </Section>

      {byComp.length > 0 && competitionId === 'all' && (
        <Section title="By competition">
          <div className="table">
            {byComp.map((row, i) => (
              <div key={row.competition?.id ?? `none-${i}`} className="table-row">
                <span className="table-name">
                  <span className="swatch" style={{ background: row.competition?.color ?? 'var(--line)' }} />
                  {row.competition?.name ?? 'No competition'}
                </span>
                <span className="table-value">{recordSummary(row)}</span>
                <span className="table-sub">
                  {row.played} pl · {row.goalsFor}:{row.goalsAgainst}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {byVenue.length > 0 && (
        <Section title="Home & away">
          <div className="table">
            {byVenue.map((row) => (
              <div key={row.venue} className="table-row">
                <span className="table-name">{VENUE_LABEL[row.venue]}</span>
                <span className="table-value">{recordSummary(row)}</span>
                <span className="table-sub">
                  {row.goalsFor}:{row.goalsAgainst}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {byOpponent.length > 0 && (
        <Section title="Most played">
          <div className="table">
            {byOpponent.map((row) => (
              <div key={row.opponent} className="table-row">
                <span className="table-name">{row.opponent}</span>
                <span className="table-value">{recordSummary(row)}</span>
                <span className="table-sub">{row.played} pl</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {(stats.biggestWin || stats.heaviestDefeat) && (
        <Section title="Highlights">
          <div className="table">
            {stats.biggestWin && (
              <div className="table-row">
                <span className="table-name">Biggest win</span>
                <span className="table-value outcome-w">{scoreline(stats.biggestWin.result)}</span>
                <span className="table-sub">
                  {stats.biggestWin.opponent} · {formatDateShort(stats.biggestWin.date)}
                </span>
              </div>
            )}
            {stats.heaviestDefeat && (
              <div className="table-row">
                <span className="table-name">Heaviest defeat</span>
                <span className="table-value outcome-l">{scoreline(stats.heaviestDefeat.result)}</span>
                <span className="table-sub">
                  {stats.heaviestDefeat.opponent} · {formatDateShort(stats.heaviestDefeat.date)}
                </span>
              </div>
            )}
            {stats.shootoutWins > 0 && (
              <div className="table-row">
                <span className="table-name">Shootouts won</span>
                <span className="table-value">{stats.shootoutWins}</span>
                <span className="table-sub" />
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
