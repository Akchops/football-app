import { POSITIONS_BY_GROUP, type Competition, type CompetitionType, type Match, type PositionGroup } from '../types';
import { seasonOf } from './date';
import { computeStats, playedMatches, type Stats } from './stats';
import { isKnockout } from './stage';

/**
 * Stats across an academy's players, for picking teams. Everything here is
 * worked out from each player's own logs - the same matches and the same
 * computeStats() as the player's own app - so the academy sees the numbers the
 * family sees, never different ones.
 */

/** A player on an academy's books, with whatever of their records the viewer may read. */
export interface SquadPlayer {
  /** The academy's id for them (academy_players), which squads and team picks use. */
  id: string;
  name: string;
  position: string;
  positionGroup: PositionGroup;
  ageGroup: string;
  squadIds: string[];
  /** Their matches, from their own Matchday. Empty for a name with no app. */
  matches: Match[];
  competitions: Competition[];
}

export type StageFilter = 'all' | 'group' | 'knockout';

export interface StatsFilter {
  /** '2026/27', or '' for all time. */
  season: string;
  /** A competitionKey(), or '' for every competition. */
  competition: string;
  stage: StageFilter;
  /** '' for every position. */
  positionGroup: PositionGroup | '';
  /** '' for every squad. */
  squadId: string;
}

export const NO_FILTER: StatsFilter = { season: '', competition: '', stage: 'all', positionGroup: '', squadId: '' };

export { seasonOf } from './date';

/**
 * The same competition logged by different families: "Yorkshire U16 League"
 * and "yorkshire u16  league" are one. Each family names its own copy.
 */
export function competitionKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The group a position belongs to, for a player known only by their position. */
export function groupOfPosition(position: string, fallback: PositionGroup = 'midfielder'): PositionGroup {
  for (const [group, positions] of Object.entries(POSITIONS_BY_GROUP) as [PositionGroup, string[]][]) {
    if (positions.includes(position)) return group;
  }
  return fallback;
}

function competitionOf(player: SquadPlayer, match: Match): Competition | undefined {
  return match.competitionId ? player.competitions.find((c) => c.id === match.competitionId) : undefined;
}

/** A player's played matches that the filter keeps. */
export function matchesFor(player: SquadPlayer, filter: StatsFilter): Match[] {
  return playedMatches(player.matches).filter((m) => {
    if (filter.season && seasonOf(m.date) !== filter.season) return false;
    if (filter.competition) {
      const competition = competitionOf(player, m);
      if (!competition || competitionKey(competition.name) !== filter.competition) return false;
    }
    if (filter.stage === 'group' && m.stage !== 'group') return false;
    if (filter.stage === 'knockout' && !isKnockout(m.stage)) return false;
    return true;
  });
}

/** The players the filter keeps, by position and squad. */
export function playersFor(players: SquadPlayer[], filter: StatsFilter): SquadPlayer[] {
  return players.filter(
    (p) =>
      (!filter.positionGroup || p.positionGroup === filter.positionGroup) &&
      (!filter.squadId || p.squadIds.includes(filter.squadId)),
  );
}

/** Seasons with any played match, newest first. */
export function seasonsIn(players: SquadPlayer[]): string[] {
  const seasons = new Set<string>();
  for (const p of players) for (const m of playedMatches(p.matches)) seasons.add(seasonOf(m.date));
  return [...seasons].sort().reverse();
}

/** Competitions that any player has played in, merged by name across families, A to Z. */
export function competitionsIn(players: SquadPlayer[]): { key: string; name: string; type: CompetitionType }[] {
  const found = new Map<string, { key: string; name: string; type: CompetitionType }>();
  for (const p of players) {
    for (const m of playedMatches(p.matches)) {
      const competition = competitionOf(p, m);
      if (!competition) continue;
      const key = competitionKey(competition.name);
      if (key && !found.has(key)) found.set(key, { key, name: competition.name.trim(), type: competition.type });
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type BoardId =
  | 'matchScore' | 'appearances' | 'minutes' | 'motm'
  | 'goals' | 'assists' | 'chancesCreated' | 'tackles'
  | 'saves' | 'cleanSheets' | 'concededPerGame' | 'penaltiesSaved';

/** A leaderboard: who it is for, and the number it ranks by. */
export interface Board {
  id: BoardId;
  label: string;
  /** Keeper boards rank only keepers; outfield ones everyone else. */
  for: 'keeper' | 'outfield' | 'all';
  value: (stats: Stats) => number | null;
  format: (value: number) => string;
  /** Lower is better - goals conceded. */
  ascending?: boolean;
}

/** Goals a keeper let in: what they logged, or the team's goals against if they never did. */
function conceded(stats: Stats): number {
  return stats.totals.conceded || stats.goalsAgainst;
}

const whole = (v: number) => String(Math.round(v));

export const BOARDS: Board[] = [
  { id: 'matchScore', label: 'Match score', for: 'all', value: (s) => s.averageScore, format: whole },
  { id: 'motm', label: 'Man of the Match', for: 'all', value: (s) => s.motm, format: whole },
  { id: 'appearances', label: 'Appearances', for: 'all', value: (s) => s.appearances, format: whole },
  { id: 'minutes', label: 'Minutes', for: 'all', value: (s) => s.minutes, format: whole },
  { id: 'goals', label: 'Goals', for: 'outfield', value: (s) => s.goals, format: whole },
  { id: 'assists', label: 'Assists', for: 'outfield', value: (s) => s.assists, format: whole },
  { id: 'chancesCreated', label: 'Chances created', for: 'outfield', value: (s) => s.totals.chancesCreated ?? 0, format: whole },
  { id: 'tackles', label: 'Tackles won', for: 'outfield', value: (s) => s.totals.tackles ?? 0, format: whole },
  { id: 'saves', label: 'Saves', for: 'keeper', value: (s) => s.totals.saves ?? 0, format: whole },
  { id: 'cleanSheets', label: 'Clean sheets', for: 'keeper', value: (s) => s.cleanSheetsPlayed, format: whole },
  {
    id: 'concededPerGame',
    label: 'Conceded per game',
    for: 'keeper',
    value: (s) => (s.appearances ? conceded(s) / s.appearances : null),
    format: (v) => v.toFixed(2),
    ascending: true,
  },
  { id: 'penaltiesSaved', label: 'Penalties saved', for: 'keeper', value: (s) => s.totals.penaltiesSaved ?? 0, format: whole },
];

export const BOARD_BY_ID = Object.fromEntries(BOARDS.map((b) => [b.id, b])) as Record<BoardId, Board>;

/** The boards worth showing for a position: keepers get keeper boards, everyone else outfield ones. */
export function boardsFor(group: PositionGroup | ''): Board[] {
  if (!group) return BOARDS;
  return BOARDS.filter((b) => b.for === 'all' || (b.for === 'keeper') === (group === 'goalkeeper'));
}

/** Whether a board ranks this player at all: keeper boards are for keepers, outfield ones for everyone else. */
export function boardApplies(board: Board, player: Pick<SquadPlayer, 'positionGroup'>): boolean {
  if (board.for === 'keeper') return player.positionGroup === 'goalkeeper';
  if (board.for === 'outfield') return player.positionGroup !== 'goalkeeper';
  return true;
}

export interface BoardRow {
  player: SquadPlayer;
  stats: Stats;
  value: number;
}

/**
 * Everyone the filter keeps who has played, best first. Level players are
 * split by who has played more, then by name - so nobody climbs a table by
 * playing once and doing well.
 */
export function leaderboard(players: SquadPlayer[], filter: StatsFilter, board: Board): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const player of playersFor(players, filter)) {
    if (!boardApplies(board, player)) continue;
    const stats = computeStats(matchesFor(player, filter));
    if (stats.appearances === 0) continue;
    const value = board.value(stats);
    if (value === null) continue;
    rows.push({ player, stats, value });
  }
  return rows.sort(
    (a, b) =>
      (board.ascending ? a.value - b.value : b.value - a.value) ||
      b.stats.appearances - a.stats.appearances ||
      a.player.name.localeCompare(b.player.name),
  );
}

/** The stats of one player under the filter. */
export function statsFor(player: SquadPlayer, filter: StatsFilter): Stats {
  return computeStats(matchesFor(player, filter));
}

export interface CompareRow {
  label: string;
  values: string[];
  /** Which columns hold the best value, to pick out. */
  best: number[];
}

/**
 * Two or three players side by side: the everyone rows, then keeper rows if
 * any is a keeper and outfield rows if any is not.
 */
export function compareRows(players: SquadPlayer[], filter: StatsFilter): CompareRow[] {
  const stats = players.map((p) => statsFor(p, filter));
  const keepers = players.some((p) => p.positionGroup === 'goalkeeper');
  const outfield = players.some((p) => p.positionGroup !== 'goalkeeper');
  return BOARDS.filter((b) => b.for === 'all' || (b.for === 'keeper' ? keepers : outfield)).map((board) => {
    const values = stats.map((s, i) => (s.appearances && boardApplies(board, players[i]) ? board.value(s) : null));
    const present = values.filter((v): v is number => v !== null);
    const target = present.length > 1 ? (board.ascending ? Math.min(...present) : Math.max(...present)) : null;
    return {
      label: board.label,
      values: values.map((v) => (v === null ? '–' : board.format(v))),
      best: target === null ? [] : values.flatMap((v, i) => (v === target ? [i] : [])),
    };
  });
}

/** A team pick as text, to share or paste: its name, the academy, and the players in order. */
export function selectionText(name: string, academyName: string, players: Pick<SquadPlayer, 'name' | 'position' | 'ageGroup'>[], notes = ''): string {
  const lines = players.map((p, i) => {
    const facts = [p.position, p.ageGroup].filter(Boolean).join(', ');
    return `${i + 1}. ${p.name}${facts ? ` (${facts})` : ''}`;
  });
  return [`${name.trim()} - ${academyName}`, '', ...lines, ...(notes.trim() ? ['', notes.trim()] : [])].join('\n');
}
