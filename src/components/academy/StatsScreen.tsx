import { useMemo, useState } from 'react';
import type { Squad, StaffAcademy } from '../../lib/academy';
import {
  NO_FILTER, boardsFor, compareRows, competitionsIn, groupOfPosition, leaderboard, matchesFor, seasonOf,
  seasonsIn, statsFor, type BoardId, type SquadPlayer, type StageFilter, type StatsFilter,
} from '../../lib/academyStats';
import { seasonLabel } from '../../lib/date';
import { positionStatCards } from '../../lib/metrics';
import { matchScore } from '../../lib/score';
import { STAGE_SHORT } from '../../lib/stage';
import { placingLabel, recordSummary, scoreline, statsByStage, statsByTournament } from '../../lib/stats';
import { useAcademy } from '../../store/AcademyProvider';
import type { PositionGroup } from '../../types';
import { Section, Segmented, Sheet, StatTile } from '../ui';
import { useLoad } from './parts';
import { TeamPicks } from './TeamPicks';
import { isActive, playerFacts, useRoster } from './useRoster';

const POSITIONS: { value: PositionGroup | ''; label: string }[] = [
  { value: '', label: 'Everyone' },
  { value: 'goalkeeper', label: 'Keepers' },
  { value: 'defender', label: 'Defenders' },
  { value: 'midfielder', label: 'Midfielders' },
  { value: 'forward', label: 'Forwards' },
];

const MAX_COMPARE = 3;

export interface SquadData {
  players: SquadPlayer[];
  squads: Squad[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
}

/**
 * Everyone on the academy's books, each with whatever of their own records the
 * viewer may read - all linked players for the owner and managers, the
 * players in their squads for a coach - shaped for the stats.
 */
export function useSquadData(academy: StaffAcademy): SquadData {
  const { api } = useAcademy();
  const roster = useRoster(academy);
  const active = (roster.players ?? []).filter(isActive);
  const linked = active
    .filter((p) => p.status === 'linked' && p.playerId)
    .map((p) => p.playerId as string)
    .sort();
  const key = `${academy.id}:${linked.join(',')}`;
  const records = useLoad(api && roster.players ? () => api.playerRecords(linked) : null, key);
  const squads = roster.squads ?? [];

  const players = useMemo(
    () =>
      active.map((ap): SquadPlayer => {
        const rec = ap.playerId && ap.status === 'linked' ? records.data?.find((r) => r.playerId === ap.playerId) : undefined;
        const position = rec?.profile?.position || ap.position;
        return {
          id: ap.id,
          name: ap.name,
          position,
          positionGroup: rec?.profile?.positionGroup ?? groupOfPosition(position),
          ageGroup: rec?.profile?.ageGroup || ap.ageGroup,
          squadIds: squads.filter((s) => s.memberIds.includes(ap.id)).map((s) => s.id),
          matches: rec?.matches ?? [],
          competitions: rec?.competitions ?? [],
        };
      }),
    // The roster and records arrays are new on each load, which is when this should change.
    [roster.players, roster.squads, records.data],
  );

  return {
    players,
    squads,
    loading: !roster.players || !roster.squads || (linked.length > 0 && !records.data && !records.error),
    error: roster.error || records.error,
    reload: async () => {
      await roster.reload();
      await records.reload();
    },
  };
}

/** Leaderboards across the academy's players, a page per player, side-by-side comparison, and team picks. */
export function StatsScreen({ academy }: { academy: StaffAcademy }) {
  const data = useSquadData(academy);
  const seasons = useMemo(() => seasonsIn(data.players), [data.players]);
  const competitions = useMemo(() => competitionsIn(data.players), [data.players]);
  const thisSeason = seasonLabel();
  const [filter, setFilter] = useState<StatsFilter | null>(null);
  const [boardId, setBoardId] = useState<BoardId>('matchScore');
  const [comparing, setComparing] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Start at this season if anything has been played in it; all time otherwise.
  const f: StatsFilter = filter ?? { ...NO_FILTER, season: seasons.includes(thisSeason) ? thisSeason : '' };
  const set = (patch: Partial<StatsFilter>) => setFilter({ ...f, ...patch });
  const boards = boardsFor(f.positionGroup);
  const board = boards.find((b) => b.id === boardId) ?? boards[0];
  const rows = useMemo(() => leaderboard(data.players, f, board), [data.players, f, board]);

  const withGames = data.players.filter((p) => p.matches.length > 0).length;
  const noApp = data.players.filter((p) => p.matches.length === 0).length;
  const squadName = (id: string) => data.squads.find((s) => s.id === id)?.name ?? '';
  const open = data.players.find((p) => p.id === openId) ?? null;

  const toggleCompare = (id: string) =>
    setComparing((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= MAX_COMPARE ? list : [...list, id]));

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Stats</h1>
      </div>
      <p className="muted small">
        From each linked player&apos;s own Matchday - logged by them and their family, not checked by the academy.
      </p>

      {data.error && <p className="notice warn">{data.error}</p>}
      {data.loading && !data.error && <p className="muted small">Loading players&apos; stats…</p>}

      {!data.loading && (
        <>
          <div className="stats-filters">
            <select className="input" aria-label="Season" value={f.season} onChange={(e) => set({ season: e.target.value })}>
              <option value="">All time</option>
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s} season
                </option>
              ))}
            </select>
            <select className="input" aria-label="Competition" value={f.competition} onChange={(e) => set({ competition: e.target.value })}>
              <option value="">All competitions</option>
              {competitions.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className="input" aria-label="Squad" value={f.squadId} onChange={(e) => set({ squadId: e.target.value })}>
              <option value="">All squads</option>
              {data.squads.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <Segmented<StageFilter>
            options={[
              { value: 'all', label: 'All games' },
              { value: 'group', label: 'Group stage' },
              { value: 'knockout', label: 'Knockouts' },
            ]}
            value={f.stage}
            onChange={(stage) => set({ stage })}
          />
          <div className="chip-scroll" role="group" aria-label="Position">
            {POSITIONS.map((p) => (
              <button
                key={p.value || 'all'}
                type="button"
                className={f.positionGroup === p.value ? 'filter-chip on' : 'filter-chip'}
                aria-pressed={f.positionGroup === p.value}
                onClick={() => set({ positionGroup: p.value })}
              >
                {p.label}
              </button>
            ))}
          </div>

          <Section title="Leaderboard">
            <div className="chip-scroll" role="group" aria-label="Rank by">
              {boards.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={b.id === board.id ? 'filter-chip on' : 'filter-chip'}
                  aria-pressed={b.id === board.id}
                  onClick={() => setBoardId(b.id)}
                >
                  {b.label}
                </button>
              ))}
            </div>

            {rows.length === 0 ? (
              <p className="muted small">
                {withGames === 0
                  ? 'No linked player has logged a game yet. Stats appear here as they log matches in their Matchday.'
                  : 'Nobody has played a game that fits these filters.'}
              </p>
            ) : (
              <ol className="board">
                {rows.map((row, i) => (
                  <li key={row.player.id}>
                    <input
                      type="checkbox"
                      aria-label={`Compare ${row.player.name}`}
                      checked={comparing.includes(row.player.id)}
                      disabled={!comparing.includes(row.player.id) && comparing.length >= MAX_COMPARE}
                      onChange={() => toggleCompare(row.player.id)}
                    />
                    <span className="board-rank">{i + 1}</span>
                    <button className="board-name" onClick={() => setOpenId(row.player.id)}>
                      <strong>{row.player.name}</strong>
                      <span className="muted small">{playerFacts(row.player, row.player.squadIds.map(squadName))}</span>
                    </button>
                    <span className="board-value">
                      <strong>{board.format(row.value)}</strong>
                      <span className="muted small">
                        {row.stats.appearances} app{row.stats.appearances === 1 ? '' : 's'}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {comparing.length >= 2 && (
              <div className="button-row">
                <button className="primary-btn" onClick={() => setCompareOpen(true)}>
                  Compare {comparing.length}
                </button>
                <button className="link-btn" onClick={() => setComparing([])}>
                  Clear
                </button>
              </div>
            )}
            {comparing.length === 1 && <p className="muted small">Tick one or two more to compare them.</p>}
            {noApp > 0 && (
              <p className="muted small">
                {noApp} on your books {noApp === 1 ? 'has' : 'have'} no games to show - no app yet, not linked, not in a
                squad you coach, or nothing logged.
              </p>
            )}
          </Section>

          <TeamPicks academy={academy} data={data} filter={f} board={board} />
        </>
      )}

      <PlayerStatsSheet player={open} filter={f} squadName={squadName} onClose={() => setOpenId(null)} />
      <CompareSheet
        open={compareOpen}
        players={comparing.map((id) => data.players.find((p) => p.id === id)).filter((p): p is SquadPlayer => Boolean(p))}
        filter={f}
        onClose={() => setCompareOpen(false)}
      />
    </div>
  );
}

/** "This season · Group stage · Yorkshire U16 League" - what a number covers. */
function filterWords(filter: StatsFilter): string {
  return [
    filter.season ? `${filter.season} season` : 'All time',
    filter.stage === 'group' ? 'group games' : filter.stage === 'knockout' ? 'knockouts' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function PlayerStatsSheet({
  player,
  filter,
  squadName,
  onClose,
}: {
  player: SquadPlayer | null;
  filter: StatsFilter;
  squadName: (id: string) => string;
  onClose: () => void;
}) {
  if (!player) return null;
  const matches = matchesFor(player, filter);
  const stats = statsFor(player, filter);
  const cards = positionStatCards(player.positionGroup, {
    appearances: stats.appearances,
    played: stats.played,
    minutes: stats.minutes,
    cleanSheetsPlayed: stats.cleanSheetsPlayed,
    goalsAgainst: stats.goalsAgainst,
    totals: stats.totals,
  });
  const stages = statsByStage(matches);
  const tournaments = statsByTournament(player.matches, player.competitions).filter((t) =>
    !filter.season || seasonOf(t.to || t.from || '1970-01-01') === filter.season,
  );
  const recent = matches.slice(0, 5);

  return (
    <Sheet open title={player.name} subtitle={playerFacts(player, player.squadIds.map(squadName))} onClose={onClose}>
      <p className="muted small">
        From {player.name}&apos;s own Matchday · {filterWords(filter)}
        {stats.played > 0 ? ` · their team ${recordSummary(stats)}` : ''}
      </p>
      {stats.appearances === 0 ? (
        <p className="muted small">No games to show for these filters.</p>
      ) : (
        <>
          <div className="tile-grid">
            <StatTile label="Appearances" value={stats.appearances} sub={`${stats.minutes} min`} />
            <StatTile label="Match score" value={stats.averageScore === null ? '–' : Math.round(stats.averageScore)} sub="average" />
            <StatTile label="Man of the Match" value={stats.motm} />
          </div>
          <div className="tile-grid">
            {cards.map((c) => (
              <StatTile key={c.label} label={c.label} value={c.value} sub={c.sub} />
            ))}
          </div>
        </>
      )}

      {stages.length > 0 && (
        <Section title="Group stage and knockouts">
          <ul className="plain-list">
            {stages.map((s) => (
              <li key={s.stage}>
                <span>{s.stage === 'group' ? 'Group games' : 'Knockouts'}</span>
                <span className="muted small">
                  {recordSummary(s)} · {s.cleanSheets} clean sheet{s.cleanSheets === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {tournaments.length > 0 && (
        <Section title="Tournaments">
          <ul className="plain-list">
            {tournaments.map((t) => (
              <li key={t.competition.id}>
                <span>{t.competition.name}</span>
                <span className="muted small">
                  {t.played ? recordSummary(t) : 'Not played yet'}
                  {t.competition.placing ? ` · ${placingLabel(t.competition.placing)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {recent.length > 0 && (
        <Section title="Recent games">
          <ul className="plain-list">
            {recent.map((m) => (
              <li key={m.id}>
                <span>
                  {m.date.slice(5).split('-').reverse().join('/')} · {m.venue === 'away' ? '@ ' : 'v '}
                  {m.opponent || 'TBC'}
                  {m.stage && m.stage !== 'group' ? ` · ${STAGE_SHORT[m.stage]}` : ''}
                </span>
                <span className="muted small">
                  {m.result ? scoreline(m.result) : ''}
                  {m.result?.didPlay ? ` · score ${matchScore(m.result, m.durationMinutes).score}` : ' · did not play'}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Sheet>
  );
}

function CompareSheet({
  open,
  players,
  filter,
  onClose,
}: {
  open: boolean;
  players: SquadPlayer[];
  filter: StatsFilter;
  onClose: () => void;
}) {
  if (!open || players.length < 2) return null;
  const rows = compareRows(players, filter);
  return (
    <Sheet open title="Side by side" subtitle={filterWords(filter)} onClose={onClose}>
      <div className="table-scroll">
        <table className="compare">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Stat</span>
              </th>
              {players.map((p) => (
                <th key={p.id} scope="col">
                  {p.name}
                  <span className="muted small">{p.position || ' '}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {row.values.map((v, i) => (
                  <td key={players[i].id} className={row.best.includes(i) ? 'best' : undefined}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Best in each row is marked. A dash means it doesn&apos;t apply to their position.</p>
    </Sheet>
  );
}
