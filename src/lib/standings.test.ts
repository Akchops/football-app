import { describe, expect, it } from 'vitest';
import { emptyResult, type Competition, type Match, type MatchStage, type Result } from '../types';
import { knownTeams, standings, teamKey, type TableGroup } from './standings';

let seq = 0;

function result(home: string, homeGoals: number | null, awayGoals: number | null, away: string, over: Partial<Result> = {}): Result {
  seq += 1;
  return {
    id: `r${seq}`, competitionId: 'c1', home, away, homeGoals, awayGoals, date: `2026-09-${String(seq % 28 + 1).padStart(2, '0')}`,
    stage: null, stageDetail: '', createdAt: `2026-09-01T00:00:${String(seq % 60).padStart(2, '0')}Z`, updatedAt: '', deletedAt: null,
    ...over,
  };
}

function ours(opponent: string, goalsFor: number, goalsAgainst: number, over: Partial<Match> = {}): Match {
  seq += 1;
  return {
    id: `m${seq}`, competitionId: 'c1', teamId: 't1', opponent, date: `2026-09-${String(seq % 28 + 1).padStart(2, '0')}`,
    time: '10:30', venue: 'home', location: '', durationMinutes: 70, status: 'played',
    result: { ...emptyResult('GK'), goalsFor, goalsAgainst }, stage: null, stageDetail: '', notes: '',
    remindAfter: null, createdAt: '', updatedAt: '', deletedAt: null, ...over,
  };
}

const league = { type: 'league', pointsWin: 3, pointsDraw: 1 } as Pick<Competition, 'type' | 'pointsWin' | 'pointsDraw'>;
const tournament = { ...league, type: 'tournament' } as typeof league;
const cup = { ...league, type: 'cup' } as typeof league;

function table(input: { competition?: typeof league; matches?: Match[]; results?: Result[] }): TableGroup[] {
  return standings({
    competition: input.competition ?? league,
    matches: input.matches ?? [],
    results: input.results ?? [],
    ourName: () => 'Oakwood Rangers',
  });
}

/** "Team P W D L GF:GA Pts" per row, for reading a table at a glance. */
const lines = (group: TableGroup) =>
  group.rows.map((r) => `${r.team} ${r.played} ${r.won} ${r.drawn} ${r.lost} ${r.goalsFor}:${r.goalsAgainst} ${r.points}`);

describe('a league table', () => {
  it('gives three points for a win and one for a draw, best first', () => {
    const [group] = table({
      results: [
        result('Vale', 2, 1, 'Castle Park'),
        result('Castle Park', 1, 1, 'Hilltop'),
        result('Hilltop', 0, 3, 'Vale'),
      ],
    });
    expect(group.name).toBe('');
    expect(lines(group)).toEqual(['Vale 2 2 0 0 5:1 6', 'Castle Park 2 0 1 1 2:3 1', 'Hilltop 2 0 1 1 1:4 1']);
    expect(group.rows[0].goalDifference).toBe(4);
  });

  it('counts the player\'s own matches, and marks their team', () => {
    const [group] = table({ matches: [ours('Vale', 2, 0)], results: [result('Vale', 1, 0, 'Hilltop')] });
    expect(lines(group)).toEqual(['Oakwood Rangers 1 1 0 0 2:0 3', 'Vale 2 1 0 1 1:2 3', 'Hilltop 1 0 0 1 0:1 0']);
    expect(group.rows.map((r) => r.ours)).toEqual([true, false, false]);
  });

  it('knows "Vale FC" and "Vale" are the same team', () => {
    const [group] = table({ results: [result('Vale FC', 1, 0, 'Hilltop'), result('Hilltop', 0, 2, 'VALE F.C.')] });
    expect(group.rows).toHaveLength(2);
    expect(group.rows[0]).toMatchObject({ team: 'Vale FC', played: 2, points: 6 });
    expect(teamKey('Vale FC')).toBe(teamKey('vale'));
  });

  it('leaves out games not played yet, called off, or never finished', () => {
    const [group] = table({
      matches: [
        ours('Vale', 1, 0),
        ours('Hilltop', 0, 0, { status: 'scheduled', result: null }),
        ours('Castle Park', 0, 0, { status: 'cancelled', result: null }),
      ],
      results: [result('Vale', null, null, 'Castle Park'), result('Vale', 3, 3, 'Hilltop', { deletedAt: '2026-09-30T00:00:00Z' })],
    });
    expect(lines(group)).toEqual(['Oakwood Rangers 1 1 0 0 1:0 3', 'Vale 1 0 0 1 0:1 0']);
  });

  it('does not count a game twice when it is also entered as a result', () => {
    const own = ours('Vale', 2, 1, { date: '2026-09-12' });
    const [group] = table({
      matches: [own],
      results: [result('Vale FC', 1, 2, 'Oakwood Rangers', { date: '2026-09-12' }), result('Vale', 0, 0, 'Oakwood Rangers', { date: '2026-11-01' })],
    });
    // The same-day entry is the same game; the November one is the return fixture.
    expect(lines(group)).toEqual(['Oakwood Rangers 2 1 1 0 2:1 4', 'Vale 2 0 1 1 1:2 1']);
  });

  it('uses the competition\'s own points', () => {
    const [group] = table({
      competition: { ...league, pointsWin: 2, pointsDraw: 1 },
      results: [result('Vale', 1, 0, 'Hilltop'), result('Hilltop', 2, 2, 'Castle Park')],
    });
    expect(group.rows.map((r) => [r.team, r.points])).toEqual([['Vale', 2], ['Castle Park', 1], ['Hilltop', 1]]);
  });

  it('shows the last five, oldest first', () => {
    const results = ['W', 'L', 'D', 'W', 'W', 'L'].map((outcome, i) =>
      result('Vale', outcome === 'W' ? 1 : 0, outcome === 'L' ? 1 : 0, `Team ${i}`, { date: `2026-10-0${i + 1}` }),
    );
    const [group] = table({ results });
    expect(group.rows.find((r) => r.team === 'Vale')?.form).toEqual(['L', 'D', 'W', 'W', 'L']);
  });
});

describe('teams level on points', () => {
  it('are split by goal difference, then goals scored', () => {
    const [group] = table({
      results: [
        result('Vale', 3, 0, 'Hilltop'),
        result('Castle Park', 1, 0, 'Moor'),
        result('Rovers', 4, 1, 'Moor'),
      ],
    });
    // Vale and Rovers both +3; Vale scored 3, Rovers 4.
    expect(group.rows.slice(0, 3).map((r) => r.team)).toEqual(['Rovers', 'Vale', 'Castle Park']);
  });

  it('then by the games between them', () => {
    const [group] = table({
      results: [
        result('Vale', 1, 0, 'Rovers'), // the game between the two level teams
        result('Rovers', 1, 0, 'Hilltop'),
        result('Moor', 1, 0, 'Vale'),
        result('Hilltop', 0, 1, 'Moor'),
      ],
    });
    const vale = group.rows.find((r) => r.team === 'Vale')!;
    const rovers = group.rows.find((r) => r.team === 'Rovers')!;
    expect([vale.points, vale.goalDifference, vale.goalsFor]).toEqual([3, 0, 1]);
    expect([rovers.points, rovers.goalDifference, rovers.goalsFor]).toEqual([3, 0, 1]);
    // Vale beat Rovers, so Vale is above - though by name Rovers would come first.
    expect(group.rows.map((r) => r.team)).toEqual(['Moor', 'Vale', 'Rovers', 'Hilltop']);
  });

  it('and finally by name, so typing order never matters', () => {
    const one = table({ results: [result('Vale', 1, 1, 'Abbey')] });
    const other = table({ results: [result('Abbey', 1, 1, 'Vale')] });
    expect(one[0].rows.map((r) => r.team)).toEqual(['Abbey', 'Vale']);
    expect(other[0].rows.map((r) => r.team)).toEqual(['Abbey', 'Vale']);
  });
});

describe('a tournament', () => {
  const at = (stage: MatchStage | null, detail = '') => ({ stage, stageDetail: detail });

  it('has a table per group, in order', () => {
    const groups = table({
      competition: tournament,
      matches: [ours('Vale', 1, 0, at('group', 'B')), ours('TBC', 0, 0, { ...at('semi'), status: 'scheduled', result: null })],
      results: [result('Hilltop', 2, 0, 'Moor', at('group', 'A')), result('Vale', 1, 1, 'Castle', at('group', 'Group B'))],
    });
    expect(groups.map((g) => g.name)).toEqual(['Group A', 'Group B']);
    expect(lines(groups[1])).toEqual(['Oakwood Rangers 1 1 0 0 1:0 3', 'Castle 1 0 1 0 1:1 1', 'Vale 2 0 1 1 1:2 1']);
  });

  it('keeps knockout rounds out of the tables', () => {
    const groups = table({
      competition: tournament,
      matches: [ours('Vale', 1, 0, at('group', 'B')), ours('Hilltop', 3, 0, at('semi'))],
      results: [result('Moor', 1, 0, 'Castle', at('final'))],
    });
    expect(groups).toHaveLength(1);
    expect(lines(groups[0])).toEqual(['Oakwood Rangers 1 1 0 0 1:0 3', 'Vale 1 0 0 1 0:1 0']);
  });
});

describe('a cup', () => {
  it('only has a table for its group games', () => {
    expect(table({ competition: cup, matches: [ours('Vale', 2, 0)] })).toEqual([]);
    const groups = table({ competition: cup, matches: [ours('Vale', 2, 0, { stage: 'group', stageDetail: 'C' })] });
    expect(groups.map((g) => g.name)).toEqual(['Group C']);
  });
});

describe('knownTeams', () => {
  it('lists every team named so far, once each, leaving out TBC', () => {
    expect(knownTeams([ours('Vale FC', 1, 0), ours('TBC', 0, 0)], [result('Vale', 1, 0, 'Hilltop')])).toEqual(['Hilltop', 'Vale FC']);
  });
});
