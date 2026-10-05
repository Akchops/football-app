import { describe, expect, it } from 'vitest';
import { emptyResult, type Competition, type Match, type MatchStage, type MetricTotals, type PositionGroup } from '../types';
import {
  BOARD_BY_ID, NO_FILTER, boardsFor, compareRows, competitionKey, competitionsIn, groupOfPosition, leaderboard, matchesFor,
  playersFor, seasonOf, seasonsIn, selectionText, type SquadPlayer,
} from './academyStats';

let seq = 0;

function game(
  date: string,
  over: { metrics?: MetricTotals; didPlay?: boolean; motm?: boolean; competitionId?: string | null; stage?: MatchStage | null; ga?: number } = {},
): Match {
  seq += 1;
  const result = { ...emptyResult('ST'), goalsFor: 2, goalsAgainst: over.ga ?? 1, didPlay: over.didPlay ?? true, minutes: 70, motm: over.motm ?? false, metrics: over.metrics ?? {} };
  return {
    id: `m${seq}`, competitionId: over.competitionId ?? null, teamId: null, opponent: 'Vale', date, time: '10:30', venue: 'home',
    location: '', durationMinutes: 70, status: 'played', result, stage: over.stage ?? null, stageDetail: '', notes: '',
    remindAfter: null, createdAt: '', updatedAt: '', deletedAt: null,
  };
}

function competition(id: string, name: string, type: Competition['type'] = 'league'): Competition {
  return { id, name, type } as Competition;
}

function player(id: string, name: string, group: PositionGroup, matches: Match[], over: Partial<SquadPlayer> = {}): SquadPlayer {
  return { id, name, position: '', positionGroup: group, ageGroup: 'U16', squadIds: [], matches, competitions: [], ...over };
}

describe('seasons', () => {
  it('run from July, as the rest of the app counts them', () => {
    expect(seasonOf('2026-08-15')).toBe('2026/27');
    expect(seasonOf('2027-03-01')).toBe('2026/27');
    expect(seasonOf('2026-06-30')).toBe('2025/26');
  });

  it('are listed newest first, from games played', () => {
    const p = player('a', 'A', 'forward', [game('2025-09-01'), game('2026-09-01'), game('2026-10-01')]);
    expect(seasonsIn([p])).toEqual(['2026/27', '2025/26']);
  });
});

describe('competitions', () => {
  it('are one competition however each family typed its name', () => {
    expect(competitionKey('  Yorkshire  U16 League ')).toBe(competitionKey('yorkshire u16 league'));
    const a = player('a', 'A', 'forward', [game('2026-09-01', { competitionId: 'c1' })], { competitions: [competition('c1', 'Yorkshire U16 League')] });
    const b = player('b', 'B', 'forward', [game('2026-09-02', { competitionId: 'x9' })], { competitions: [competition('x9', 'yorkshire u16  league')] });
    expect(competitionsIn([a, b]).map((c) => c.name)).toEqual(['Yorkshire U16 League']);
    const key = competitionKey('Yorkshire U16 League');
    expect(matchesFor(b, { ...NO_FILTER, competition: key })).toHaveLength(1);
  });
});

describe('filters', () => {
  const games = [
    game('2025-10-01', { stage: null }),
    game('2026-09-01', { stage: 'group' }),
    game('2026-09-02', { stage: 'semi' }),
    { ...game('2026-09-03'), status: 'scheduled' as const, result: null },
  ];
  const p = player('a', 'A', 'forward', games, { squadIds: ['elite'] });

  it('keep played games in the season and stage asked for', () => {
    expect(matchesFor(p, NO_FILTER)).toHaveLength(3);
    expect(matchesFor(p, { ...NO_FILTER, season: '2026/27' })).toHaveLength(2);
    expect(matchesFor(p, { ...NO_FILTER, stage: 'group' }).map((m) => m.stage)).toEqual(['group']);
    expect(matchesFor(p, { ...NO_FILTER, stage: 'knockout' }).map((m) => m.stage)).toEqual(['semi']);
  });

  it('keep players by position and squad', () => {
    const keeper = player('k', 'K', 'goalkeeper', []);
    expect(playersFor([p, keeper], { ...NO_FILTER, positionGroup: 'goalkeeper' })).toEqual([keeper]);
    expect(playersFor([p, keeper], { ...NO_FILTER, squadId: 'elite' })).toEqual([p]);
  });

  it('know a position\'s group', () => {
    expect(groupOfPosition('GK')).toBe('goalkeeper');
    expect(groupOfPosition('LWB')).toBe('defender');
    expect(groupOfPosition('', 'forward')).toBe('forward');
  });
});

describe('leaderboards', () => {
  const striker = player('s', 'Sam', 'forward', [game('2026-09-01', { metrics: { goals: 2 } }), game('2026-09-08', { metrics: { goals: 1 } })]);
  const winger = player('w', 'Wes', 'forward', [game('2026-09-01', { metrics: { goals: 3 } })]);
  const level = player('l', 'Ali', 'midfielder', [game('2026-09-01', { metrics: { goals: 2 } }), game('2026-09-08', { metrics: { goals: 1 } })]);
  const keeper = player('k', 'Kai', 'goalkeeper', [game('2026-09-01', { ga: 0, metrics: { saves: 6 } }), game('2026-09-08', { ga: 2, metrics: { saves: 3, conceded: 2 } })]);
  const keeper2 = player('k2', 'Ben', 'goalkeeper', [game('2026-09-01', { ga: 1, metrics: { saves: 2, conceded: 1 } })]);
  const benched = player('b', 'Bo', 'forward', [game('2026-09-01', { didPlay: false })]);
  const all = [striker, winger, level, keeper, keeper2, benched];

  it('rank by the number, then by who has played more, then by name', () => {
    const rows = leaderboard(all, NO_FILTER, BOARD_BY_ID.goals);
    // All on 3: Ali and Sam played twice, Wes once; Ali before Sam by name.
    expect(rows.map((r) => [r.player.name, r.value])).toEqual([
      ['Ali', 3],
      ['Sam', 3],
      ['Wes', 3],
    ]);
  });

  it('leave out keepers from outfield boards, and anyone who has not played', () => {
    const names = leaderboard(all, NO_FILTER, BOARD_BY_ID.goals).map((r) => r.player.name);
    expect(names).not.toContain('Kai');
    expect(names).not.toContain('Bo');
  });

  it('rank keepers only on keeper boards, fewest conceded first', () => {
    const rows = leaderboard(all, NO_FILTER, BOARD_BY_ID.concededPerGame);
    expect(rows.map((r) => [r.player.name, BOARD_BY_ID.concededPerGame.format(r.value)])).toEqual([
      ['Kai', '1.00'],
      ['Ben', '1.00'],
    ]);
    expect(leaderboard(all, NO_FILTER, BOARD_BY_ID.saves).map((r) => [r.player.name, r.value])).toEqual([
      ['Kai', 9],
      ['Ben', 2],
    ]);
    expect(leaderboard(all, NO_FILTER, BOARD_BY_ID.cleanSheets)[0]).toMatchObject({ value: 1 });
  });

  it('offer the boards that fit a position', () => {
    expect(boardsFor('goalkeeper').map((b) => b.id)).toContain('saves');
    expect(boardsFor('goalkeeper').map((b) => b.id)).not.toContain('goals');
    expect(boardsFor('forward').map((b) => b.id)).toContain('goals');
    expect(boardsFor('forward').map((b) => b.id)).not.toContain('saves');
    expect(boardsFor('').length).toBeGreaterThan(boardsFor('forward').length);
  });

  it('compare players side by side, picking out the best', () => {
    const rows = compareRows([striker, winger], NO_FILTER);
    const goals = rows.find((r) => r.label === 'Goals')!;
    expect(goals.values).toEqual(['3', '3']);
    expect(goals.best).toEqual([0, 1]);
    expect(rows.some((r) => r.label === 'Saves')).toBe(false);
    const apps = rows.find((r) => r.label === 'Appearances')!;
    expect(apps.best).toEqual([0]);
    const mixed = compareRows([striker, keeper], NO_FILTER);
    expect(mixed.find((r) => r.label === 'Saves')!.values).toEqual(['–', '9']);
    expect(mixed.find((r) => r.label === 'Goals')!.values).toEqual(['3', '–']);
  });
});

describe('a team pick as text', () => {
  it('lists the players in order under its name', () => {
    expect(
      selectionText('Dubai Cup 2027', 'Riverside Academy', [
        { name: 'Kai', position: 'GK', ageGroup: 'U16' },
        { name: 'Sam', position: '', ageGroup: '' },
      ], ' Arrive 8am '),
    ).toBe('Dubai Cup 2027 - Riverside Academy\n\n1. Kai (GK, U16)\n2. Sam\n\nArrive 8am');
  });
});
