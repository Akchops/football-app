import { useMemo, useState } from 'react';
import { useStore } from '../store/AppStore';
import { POSITION_GROUP_LABEL, VENUE_LABEL, type PositionGroup } from '../types';
import { formatDateShort } from '../lib/date';
import { positionStatCards, showsTeamAttack } from '../lib/metrics';
import { scoreBand, scoreVerdict } from '../lib/score';
import {
  computeStats, recentScores, recordSummary, scoreline, statsByCompetition, statsByMonth,
  statsByOpponent, statsByTeam, statsByVenue,
} from '../lib/stats';
import { EmptyState, Section, StatTile } from './ui';

export function StatsScreen({ now, onGoToMatches }: { now: Date; onGoToMatches: () => void }) {
  const { matches, competitions, teams, profile } = useStore();
  const [competitionId, setCompetitionId] = useState<string>('all');
  const [teamId, setTeamId] = useState<string>('all');

  const scoped = useMemo(
    () =>
      matches
        .filter((m) => competitionId === 'all' || (m.competitionId ?? '') === competitionId)
        .filter((m) => teamId === 'all' || (m.teamId ?? '') === teamId),
    [matches, competitionId, teamId],
  );

  const stats = useMemo(() => computeStats(scoped), [scoped]);
  const byComp = useMemo(() => statsByCompetition(matches, competitions), [matches, competitions]);
  const byTeam = useMemo(() => statsByTeam(matches, teams), [matches, teams]);
  const byMonth = useMemo(() => statsByMonth(scoped, 6, now), [scoped, now]);
  const byVenue = useMemo(() => statsByVenue(scoped), [scoped]);
  const byOpponent = useMemo(() => statsByOpponent(scoped), [scoped]);
  const trend = useMemo(() => recentScores(scoped, 5), [scoped]);

  // Judge the player by the position they actually played most in this selection.
  const group: PositionGroup = useMemo(() => {
    const counts = new Map<PositionGroup, number>();
    for (const m of scoped) {
      if (m.result?.didPlay) counts.set(m.result.positionGroup, (counts.get(m.result.positionGroup) ?? 0) + 1);
    }
    let best: PositionGroup = profile.positionGroup;
    let bestCount = 0;
    for (const [g, count] of counts) {
      if (count > bestCount) {
        best = g;
        bestCount = count;
      }
    }
    return best;
  }, [scoped, profile.positionGroup]);

  if (stats.played === 0) {
    return (
      <div className="screen">
        <div className="screen-head">
          <h1>Stats</h1>
        </div>
        <EmptyState
          icon="📊"
          title="No stats yet"
          message="Log a couple of results and this page fills up with the numbers that matter for your position."
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

  const positionCards = positionStatCards(group, {
    appearances: stats.appearances,
    played: stats.played,
    minutes: stats.minutes,
    cleanSheetsPlayed: stats.cleanSheetsPlayed,
    goalsAgainst: stats.goalsAgainst,
    totals: stats.totals,
  });

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Stats</h1>
        <span className="muted small">
          {profile.name ? `${profile.name} · ` : ''}
          {POSITION_GROUP_LABEL[group]}
        </span>
      </div>

      {teams.length > 1 && (
        <div className="chip-scroll">
          <button className={teamId === 'all' ? 'filter-chip on' : 'filter-chip'} onClick={() => setTeamId('all')}>
            All teams
          </button>
          {teams.map((t) => (
            <button
              key={t.id}
              className={teamId === t.id ? 'filter-chip on' : 'filter-chip'}
              onClick={() => setTeamId(t.id)}
              style={teamId === t.id ? { borderColor: t.color, color: t.color } : undefined}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

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
        {showsTeamAttack(group) && (
          <StatTile label="Goals for" value={stats.goalsFor} sub={`${(stats.goalsFor / stats.played).toFixed(1)} per game`} />
        )}
        <StatTile
          label="Goals against"
          value={stats.goalsAgainst}
          sub={`${(stats.goalsAgainst / stats.played).toFixed(1)} per game`}
        />
        <StatTile label="Goal difference" value={stats.goalDifference > 0 ? `+${stats.goalDifference}` : stats.goalDifference} />
        <StatTile label="Clean sheets" value={stats.cleanSheets} sub={`${stats.played - stats.cleanSheets} conceded in`} />
      </div>

      <Section title={`Your game · ${POSITION_GROUP_LABEL[group]}`}>
        {trend.length > 0 && (
          <div className="trend">
            <div className="trend-head">
              <div>
                <div className="trend-value">{stats.averageScore ? Math.round(stats.averageScore) : '–'}</div>
                <div className="trend-label">Average match score</div>
              </div>
              <div className="trend-verdict">
                {stats.averageScore !== null && (
                  <>
                    <strong>{scoreVerdict(stats.averageScore)}</strong>
                    <span>{stats.appearances} appearances</span>
                  </>
                )}
              </div>
            </div>

            <div className="trend-bars">
              {[...trend].reverse().map(({ match, score }) => (
                <div key={match.id} className="trend-col">
                  <span className={`trend-score band-${scoreBand(score)}`}>{score}</span>
                  <div className="trend-track">
                    <div className={`trend-fill band-${scoreBand(score)}`} style={{ height: `${score}%` }} />
                  </div>
                  <span className="trend-opponent">{match.opponent.slice(0, 8)}</span>
                  <span className="trend-date">{formatDateShort(match.date).slice(4)}</span>
                </div>
              ))}
            </div>
            <p className="muted small">Out of 100, from the stats that matter in your position. Oldest to newest.</p>
          </div>
        )}

        <div className="tile-grid">
          {positionCards.map((card) => (
            <StatTile key={card.label} label={card.label} value={card.value} sub={card.sub} />
          ))}
        </div>

        <div className="table">
          <div className="table-row">
            <span className="table-name">Minutes played</span>
            <span className="table-value">{stats.minutes}</span>
            <span className="table-sub">{stats.appearances} appearances</span>
          </div>
          <div className="table-row">
            <span className="table-name">Discipline</span>
            <span className="table-value">
              {stats.yellowCards}Y / {stats.redCards}R
            </span>
            <span className="table-sub">{stats.motm} man of the match</span>
          </div>
          {stats.averageRating !== null && (
            <div className="table-row">
              <span className="table-name">Your own rating</span>
              <span className="table-value">{stats.averageRating.toFixed(1)}</span>
              <span className="table-sub">out of 10, self-rated</span>
            </div>
          )}
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
      </Section>

      {byTeam.length > 1 && teamId === 'all' && (
        <Section title="By team">
          <div className="table">
            {byTeam.map((row, i) => (
              <div key={row.team?.id ?? `none-${i}`} className="table-row">
                <span className="table-name">
                  <span className="swatch" style={{ background: row.team?.color ?? 'var(--line)' }} />
                  {row.team?.name ?? 'No team set'}
                </span>
                <span className="table-value">{recordSummary(row)}</span>
                <span className="table-sub">
                  {row.appearances} apps · {row.goalsFor}:{row.goalsAgainst}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

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
