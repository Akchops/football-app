import type { Competition, Match, MatchStage, Result } from '../types';
import { normaliseOpponent } from './fixtures';
import { stageName } from './stage';

/**
 * League and group tables, worked out from the games themselves: the player's
 * own matches plus whatever other teams' results have been entered. Nothing is
 * stored - fix a score and the table follows.
 */

export type FormLetter = 'W' | 'D' | 'L';

export interface TableRow {
  /** The team's name as first written. */
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** The last five, oldest first - read left to right, the latest on the right. */
  form: FormLetter[];
  /** The player's own team. */
  ours: boolean;
}

export interface TableGroup {
  /** "Group B" in a tournament; '' for a league's one table. */
  name: string;
  rows: TableRow[];
}

export interface TableInput {
  competition: Pick<Competition, 'type' | 'pointsWin' | 'pointsDraw'>;
  /** The player's own matches in this competition, in any state. */
  matches: Match[];
  /** Other teams' games in it. */
  results: Result[];
  /** The player's team, as named in the table, for one of their matches. */
  ourName: (match: Match) => string;
  /** Teams to mark as ours by name - an academy's side, whose games are all entered as results. */
  ourTeams?: string[];
}

/** One game, as a table sees it. */
interface Game {
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  /** For putting form in order. */
  order: string;
  group: string;
}

/**
 * A team's identity in a table. "Vale FC", "Vale" and "VALE F.C." are one
 * team, as they are when fixtures are imported; a name that is nothing but
 * club words ("United") falls back to itself.
 */
export function teamKey(name: string): string {
  return normaliseOpponent(name) || name.trim().toLowerCase();
}

/**
 * Whether a game belongs in a table. Group games always do; knockout rounds
 * never do. A game with no stage counts everywhere except a cup, which is
 * knockout unless it says it has groups.
 */
function counts(stage: MatchStage | null, type: Competition['type']): boolean {
  return stage === 'group' || (stage === null && type !== 'cup');
}

function groupOf(stage: MatchStage | null, detail: string, type: Competition['type']): string {
  // A league is one table, whatever its games say.
  if (type === 'league' || stage !== 'group') return '';
  return stageName('group', detail);
}

const unknown = (name: string) => name.trim() === '' || name.trim().toLowerCase() === 'tbc';

function gamesFrom(input: TableInput): { games: Game[]; ours: Set<string> } {
  const { competition, matches, results, ourName } = input;
  const games: Game[] = [];
  const ours = new Set<string>((input.ourTeams ?? []).filter((name) => !unknown(name)).map(teamKey));
  // Which own games are already counted, so the same game entered again as a
  // result isn't counted twice: our team, the other team and the day.
  const owned: { pair: string; date: string }[] = [];
  const pairOf = (a: string, b: string) => [teamKey(a), teamKey(b)].sort().join(' v ');

  for (const match of matches) {
    if (match.deletedAt !== null || match.status !== 'played' || !match.result) continue;
    if (!counts(match.stage, competition.type) || unknown(match.opponent)) continue;
    const us = ourName(match);
    ours.add(teamKey(us));
    owned.push({ pair: pairOf(us, match.opponent), date: match.date });
    games.push({
      home: us,
      away: match.opponent.trim(),
      homeGoals: match.result.goalsFor,
      awayGoals: match.result.goalsAgainst,
      order: `${match.date}T${match.time}`,
      group: groupOf(match.stage, match.stageDetail, competition.type),
    });
  }

  for (const result of results) {
    if (result.deletedAt !== null || result.homeGoals === null || result.awayGoals === null) continue;
    if (!counts(result.stage, competition.type) || unknown(result.home) || unknown(result.away)) continue;
    if (teamKey(result.home) === teamKey(result.away)) continue;
    const pair = pairOf(result.home, result.away);
    if (owned.some((o) => o.pair === pair && (o.date === result.date || result.date === ''))) continue;
    games.push({
      home: result.home.trim(),
      away: result.away.trim(),
      homeGoals: result.homeGoals,
      awayGoals: result.awayGoals,
      order: `${result.date}T99:99${result.createdAt}`,
      group: groupOf(result.stage, result.stageDetail, competition.type),
    });
  }
  return { games, ours };
}

interface Tally {
  row: TableRow;
  key: string;
  history: { order: string; letter: FormLetter }[];
}

function tally(games: Game[], win: number, draw: number, ours: Set<string>): Map<string, Tally> {
  const teams = new Map<string, Tally>();
  const entry = (name: string): Tally => {
    const key = teamKey(name);
    let found = teams.get(key);
    if (!found) {
      found = {
        key,
        history: [],
        row: {
          team: name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0,
          goalDifference: 0, points: 0, form: [], ours: ours.has(key),
        },
      };
      teams.set(key, found);
    }
    return found;
  };
  for (const game of games) {
    const sides: [Tally, number, number][] = [
      [entry(game.home), game.homeGoals, game.awayGoals],
      [entry(game.away), game.awayGoals, game.homeGoals],
    ];
    for (const [t, scored, conceded] of sides) {
      const letter: FormLetter = scored > conceded ? 'W' : scored < conceded ? 'L' : 'D';
      t.row.played += 1;
      t.row.goalsFor += scored;
      t.row.goalsAgainst += conceded;
      if (letter === 'W') {
        t.row.won += 1;
        t.row.points += win;
      } else if (letter === 'D') {
        t.row.drawn += 1;
        t.row.points += draw;
      } else {
        t.row.lost += 1;
      }
      t.history.push({ order: game.order, letter });
    }
  }
  for (const t of teams.values()) {
    t.row.goalDifference = t.row.goalsFor - t.row.goalsAgainst;
    t.row.form = t.history
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
      .slice(-5)
      .map((h) => h.letter);
  }
  return teams;
}

const byOverall = (a: TableRow, b: TableRow) =>
  b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor;

/**
 * Teams level on points, goal difference and goals scored are split by the
 * games between them alone - a mini-table of just those teams - and then by
 * name, so the order never depends on the order results were typed in.
 */
function splitTies(level: Tally[], games: Game[], win: number, draw: number): Tally[] {
  if (level.length < 2) return level;
  const keys = new Set(level.map((t) => t.key));
  const between = games.filter((g) => keys.has(teamKey(g.home)) && keys.has(teamKey(g.away)));
  const mini = tally(between, win, draw, new Set());
  const miniRow = (t: Tally) => mini.get(t.key)?.row;
  return [...level].sort((a, b) => {
    const ma = miniRow(a);
    const mb = miniRow(b);
    const h2h = ma && mb ? byOverall(ma, mb) : 0;
    return h2h || a.row.team.localeCompare(b.row.team);
  });
}

export function standings(input: TableInput): TableGroup[] {
  const win = input.competition.pointsWin;
  const draw = input.competition.pointsDraw;
  const { games, ours } = gamesFrom(input);

  const groups = new Map<string, Game[]>();
  for (const game of games) {
    const list = groups.get(game.group) ?? [];
    list.push(game);
    groups.set(game.group, list);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { numeric: true })))
    .map(([name, groupGames]) => {
      const sorted = [...tally(groupGames, win, draw, ours).values()].sort((a, b) => byOverall(a.row, b.row));
      // Walk the sorted list, splitting each run of exactly level teams.
      const rows: TableRow[] = [];
      for (let i = 0; i < sorted.length; ) {
        let j = i + 1;
        while (j < sorted.length && byOverall(sorted[i].row, sorted[j].row) === 0) j += 1;
        rows.push(...splitTies(sorted.slice(i, j), groupGames, win, draw).map((t) => t.row));
        i = j;
      }
      return { name, rows };
    });
}

/** Every team named in a competition so far, for suggesting names as they're typed. */
export function knownTeams(matches: Match[], results: Result[]): string[] {
  const names = new Map<string, string>();
  const add = (name: string) => {
    if (unknown(name)) return;
    const key = teamKey(name);
    if (!names.has(key)) names.set(key, name.trim());
  };
  for (const m of matches) add(m.opponent);
  for (const r of results) {
    add(r.home);
    add(r.away);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
