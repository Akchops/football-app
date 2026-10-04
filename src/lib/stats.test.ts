import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, emptyResult, type Competition, type Match, type MatchResult, type Settings } from '../types';
import {
  computeStats, mainPositionGroup, outcomeOf, pendingResultMatches, placingLabel, scoreline, shootoutWinner,
  statsByCompetition, statsByMonth, statsByOpponent, statsByStage, statsByTournament, statsByVenue, upcomingMatches,
} from './stats';

let seq = 0;
function match(over: Partial<Match> = {}): Match {
  seq += 1;
  return {
    id: `m${seq}`,
    competitionId: null,
    teamId: null,
    opponent: 'Opponent',
    date: '2026-04-10',
    time: '16:30',
    venue: 'home',
    location: '',
    durationMinutes: 90,
    status: 'scheduled',
    result: null,
    notes: '',
    remindAfter: null,
    stage: null,
    stageDetail: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...over,
  };
}

type PlayedOver = Partial<Pick<Match, 'date' | 'time' | 'venue' | 'competitionId' | 'teamId' | 'opponent'>> &
  Partial<MatchResult>;

function played(goalsFor: number, goalsAgainst: number, over: PlayedOver = {}): Match {
  const { date, time, venue, competitionId, teamId, opponent, ...resultOver } = over;
  return match({
    status: 'played',
    date: date ?? '2026-04-10',
    time: time ?? '16:30',
    venue: venue ?? 'home',
    competitionId: competitionId ?? null,
    teamId: teamId ?? null,
    opponent: opponent ?? 'Opponent',
    result: { ...emptyResult('CM'), goalsFor, goalsAgainst, ...resultOver },
  });
}

function comp(id: string, over: Partial<Competition> = {}): Competition {
  return {
    id, name: `Comp ${id}`, type: 'tournament', season: '25/26', ageGroup: '', color: '#fff', notes: '',
    archived: false, placing: '', startDate: '', teamId: null, location: '', matchLength: 0,
    pointsWin: 3, pointsDraw: 1, createdAt: '', updatedAt: '', deletedAt: null, ...over,
  };
}

const settings: Settings = { ...DEFAULT_SETTINGS };

describe('outcomes', () => {
  it('reads a win, draw and loss off the scoreline', () => {
    expect(outcomeOf({ ...emptyResult('CM'), goalsFor: 2, goalsAgainst: 1 })).toBe('W');
    expect(outcomeOf({ ...emptyResult('CM'), goalsFor: 1, goalsAgainst: 1 })).toBe('D');
    expect(outcomeOf({ ...emptyResult('CM'), goalsFor: 0, goalsAgainst: 3 })).toBe('L');
  });

  it('treats a shootout as a draw but records who won it', () => {
    const r = { ...emptyResult('CM'), goalsFor: 1, goalsAgainst: 1, penaltiesFor: 4, penaltiesAgainst: 3 };
    expect(outcomeOf(r)).toBe('D');
    expect(shootoutWinner(r)).toBe('us');
    expect(scoreline(r)).toBe('1-1 (4-3 pens)');
  });

  it('ignores penalties that were never taken', () => {
    expect(shootoutWinner(emptyResult('CM'))).toBeNull();
    expect(scoreline({ ...emptyResult('CM'), goalsFor: 3, goalsAgainst: 0 })).toBe('3-0');
  });
});

describe('pendingResultMatches', () => {
  const now = new Date(2026, 3, 10, 17, 0); // 5pm

  it('asks for a result once kickoff has passed', () => {
    const m = match({ date: '2026-04-10', time: '16:30' });
    expect(pendingResultMatches([m], settings, now)).toHaveLength(1);
  });

  it('leaves matches that have not kicked off alone', () => {
    const m = match({ date: '2026-04-10', time: '18:30' });
    expect(pendingResultMatches([m], settings, now)).toHaveLength(0);
  });

  it('respects the configured delay after kickoff', () => {
    const m = match({ date: '2026-04-10', time: '16:30' });
    const delayed: Settings = { ...settings, resultPromptDelayMinutes: 105 };
    expect(pendingResultMatches([m], delayed, now)).toHaveLength(0);
    expect(pendingResultMatches([m], delayed, new Date(2026, 3, 10, 18, 30))).toHaveLength(1);
  });

  it('skips matches that are already played or called off', () => {
    const list = [played(1, 0), match({ status: 'cancelled', time: '10:00' })];
    expect(pendingResultMatches(list, settings, now)).toHaveLength(0);
  });

  it('stays quiet while a match is snoozed, then asks again', () => {
    const m = match({ time: '16:30', remindAfter: new Date(2026, 3, 10, 20, 0).toISOString() });
    expect(pendingResultMatches([m], settings, now)).toHaveLength(0);
    expect(pendingResultMatches([m], settings, new Date(2026, 3, 10, 20, 30))).toHaveLength(1);
  });

  it('queues a whole tournament day oldest first', () => {
    const list = [
      match({ date: '2026-04-10', time: '14:00', opponent: 'Semi' }),
      match({ date: '2026-04-10', time: '09:30', opponent: 'Group 1' }),
      match({ date: '2026-04-10', time: '11:15', opponent: 'Group 2' }),
    ];
    expect(pendingResultMatches(list, settings, now).map((m) => m.opponent)).toEqual(['Group 1', 'Group 2', 'Semi']);
  });
});

describe('upcomingMatches', () => {
  it('returns only future kickoffs, soonest first', () => {
    const now = new Date(2026, 3, 10, 12, 0);
    const list = [
      match({ date: '2026-04-20', time: '16:30' }),
      match({ date: '2026-04-10', time: '09:00' }),
      match({ date: '2026-04-12', time: '11:00' }),
      played(1, 1, { date: '2026-04-12', time: '15:00' }),
    ];
    expect(upcomingMatches(list, now).map((m) => m.date)).toEqual(['2026-04-12', '2026-04-20']);
  });
});

describe('computeStats', () => {
  const list = [
    played(2, 1, { date: '2026-04-01', metrics: { goals: 1, assists: 1 }, rating: 8, motm: true }),
    played(0, 3, { date: '2026-04-08', minutes: 65, rating: 5 }),
    played(1, 1, { date: '2026-04-15', penaltiesFor: 4, penaltiesAgainst: 3, metrics: { assists: 1 } }),
    played(3, 0, { date: '2026-04-22', metrics: { goals: 2 }, venue: 'away' }),
    match({ date: '2026-05-01' }), // still scheduled - must not count
  ];
  const stats = computeStats(list);

  it('counts only played matches', () => {
    expect(stats.played).toBe(4);
  });

  it('builds the win/draw/loss record and points', () => {
    expect([stats.wins, stats.draws, stats.losses]).toEqual([2, 1, 1]);
    expect(stats.points).toBe(7);
    expect(stats.winRate).toBeCloseTo(0.5);
    expect(stats.pointsPerGame).toBeCloseTo(1.75);
  });

  it('totals goals, difference, clean sheets and blanks', () => {
    expect(stats.goalsFor).toBe(6);
    expect(stats.goalsAgainst).toBe(5);
    expect(stats.goalDifference).toBe(1);
    expect(stats.cleanSheets).toBe(1);
    expect(stats.failedToScore).toBe(1);
    expect(stats.shootoutWins).toBe(1);
  });

  it('totals personal contributions', () => {
    expect(stats.goals).toBe(3);
    expect(stats.assists).toBe(2);
    expect(stats.contributions).toBe(5);
    expect(stats.appearances).toBe(4);
    expect(stats.averageRating).toBeCloseTo(6.5);
  });

  it('excludes matches you sat out from personal totals but not the team record', () => {
    const withBench = computeStats([
      played(2, 0, { didPlay: false }),
      played(1, 0, { metrics: { goals: 1 } }),
    ]);
    expect(withBench.played).toBe(2);
    expect(withBench.appearances).toBe(1);
    expect(withBench.goals).toBe(1);
  });

  it('reads form newest first and finds the current streak', () => {
    expect(stats.form).toEqual(['W', 'D', 'L', 'W']);
    expect(stats.streak).toEqual({ type: 'W', count: 1 });
  });

  it('picks out the biggest win and heaviest defeat', () => {
    expect(stats.biggestWin?.result.goalsFor).toBe(3);
    expect(stats.heaviestDefeat?.result.goalsAgainst).toBe(3);
  });

  it('handles having no matches at all', () => {
    const empty = computeStats([]);
    expect(empty.played).toBe(0);
    expect(empty.winRate).toBe(0);
    expect(empty.averageRating).toBeNull();
    expect(empty.streak).toBeNull();
    expect(empty.form).toEqual([]);
  });
});

describe('breakdowns', () => {
  it('splits the record by competition, keeping uncategorised matches', () => {
    const rows = statsByCompetition(
      [played(1, 0, { competitionId: 'c1' }), played(0, 1, { competitionId: 'c1' }), played(2, 2)],
      [comp('c1', { name: 'League', type: 'league' })],
    );
    const league = rows.find((r) => r.competition?.id === 'c1');
    const none = rows.find((r) => r.competition === null);
    expect(league?.played).toBe(2);
    expect(league?.points).toBe(3);
    expect(none?.played).toBe(1);
  });

  it('splits home from away and drops venues never played', () => {
    const rows = statsByVenue([played(1, 0, { venue: 'home' }), played(0, 2, { venue: 'away' })]);
    expect(rows.map((r) => r.venue)).toEqual(['home', 'away']);
    expect(rows[0].wins).toBe(1);
    expect(rows[1].losses).toBe(1);
  });

  it('buckets recent months and ignores anything older', () => {
    const now = new Date(2026, 3, 20);
    const buckets = statsByMonth(
      [played(1, 0, { date: '2026-04-02', metrics: { goals: 1 } }), played(0, 1, { date: '2025-04-02' })],
      6,
      now,
    );
    expect(buckets).toHaveLength(6);
    expect(buckets[buckets.length - 1].played).toBe(1);
    expect(buckets.reduce((sum, b) => sum + b.played, 0)).toBe(1);
  });
});

describe('tournaments', () => {
  const now = new Date(2026, 3, 12, 18, 0);

  it('lists every tournament, most recent first, with where it is up to', () => {
    const rows = statsByTournament(
      [
        played(2, 0, { competitionId: 'spring', date: '2026-03-14' }),
        played(0, 1, { competitionId: 'spring', date: '2026-03-15' }),
        played(3, 1, { competitionId: 'easter', date: '2026-04-05' }),
        match({ competitionId: 'easter', date: '2026-04-19' }),
        // A league is not a tournament.
        played(1, 1, { competitionId: 'league', date: '2026-04-11' }),
        match({ competitionId: 'summer', date: '2026-06-01' }),
      ],
      [comp('spring', { archived: true, placing: 'Winners' }), comp('easter'), comp('league', { type: 'league' }), comp('summer')],
      now,
    );
    expect(rows.map((r) => [r.competition.id, r.status])).toEqual([
      ['summer', 'upcoming'],
      ['easter', 'playing'],
      ['spring', 'finished'],
    ]);
    expect(rows[2]).toMatchObject({ played: 2, wins: 1, losses: 1, fixtures: 2, from: '2026-03-14', to: '2026-03-15' });
    expect(rows[1]).toMatchObject({ played: 1, fixtures: 2 });
    expect(rows[0].played).toBe(0);
  });

  it('is all played once every match has a result or was called off - the time to finish it', () => {
    const [row] = statsByTournament(
      [
        played(1, 0, { competitionId: 't1', date: '2026-04-11' }),
        match({ competitionId: 't1', date: '2026-04-11', status: 'cancelled' }),
      ],
      [comp('t1')],
      now,
    );
    // A round called off is left out of the count, not counted as unplayed.
    expect(row).toMatchObject({ status: 'played', fixtures: 1 });
  });

  it('is under way from the first kickoff, even before a score is logged', () => {
    const [row] = statsByTournament([match({ competitionId: 't1', date: '2026-04-12', time: '09:30' })], [comp('t1')], now);
    expect(row).toMatchObject({ status: 'playing', played: 0 });
  });

  it('copes with a tournament that has no matches', () => {
    const [row] = statsByTournament([], [comp('t1')], now);
    expect(row).toMatchObject({ status: 'upcoming', fixtures: 0, from: '', to: '' });
  });

  it('judges the player on the position they played most', () => {
    const matches = [
      played(1, 0, { positionGroup: 'goalkeeper' }),
      played(1, 0, { positionGroup: 'goalkeeper' }),
      played(1, 0, { positionGroup: 'defender' }),
      // Sitting a match out says nothing about position.
      played(1, 0, { positionGroup: 'forward', didPlay: false }),
    ];
    expect(mainPositionGroup(matches, 'midfielder')).toBe('goalkeeper');
    expect(mainPositionGroup([], 'midfielder')).toBe('midfielder');
  });

  it('puts a medal on a podium finish only', () => {
    expect(placingLabel('Winners')).toBe('🏆 Winners');
    expect(placingLabel('Runners-up')).toBe('🥈 Runners-up');
    expect(placingLabel('Group stage')).toBe('Group stage');
    expect(placingLabel('')).toBe('');
  });
});

describe('statsByStage', () => {
  const at = (stage: Match['stage'], m: Match): Match => ({ ...m, stage });

  it('splits group games from knockouts, and leaves league games out', () => {
    const rows = statsByStage([
      at('group', played(2, 0)),
      at('group', played(1, 1)),
      at('group', played(0, 2)),
      at('semi', played(1, 1, { penaltiesFor: 4, penaltiesAgainst: 3 })),
      at('final', played(0, 1)),
      played(5, 0), // a league game: neither
    ]);

    expect(rows.map((r) => r.stage)).toEqual(['group', 'knockout']);
    const [group, knockout] = rows;
    expect([group.wins, group.draws, group.losses]).toEqual([1, 1, 1]);
    expect(group.cleanSheets).toBe(1);
    expect([knockout.wins, knockout.draws, knockout.losses]).toEqual([0, 1, 1]);
    expect([knockout.shootoutsWon, knockout.shootoutsLost]).toEqual([1, 0]);
    expect(knockout.goalsFor).toBe(1);
  });

  it('counts every knockout round, early cup rounds included, as a knockout', () => {
    const rows = statsByStage([at('round', played(3, 1)), at('quarter', played(2, 0)), at('third', played(0, 0))]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stage: 'knockout', played: 3, wins: 2, draws: 1, cleanSheets: 2 });
  });

  it('shows nothing until a match with a stage has been played', () => {
    expect(statsByStage([played(1, 0), at('semi', match())])).toEqual([]);
  });
});

describe('statsByOpponent', () => {
  it('leaves out games whose opponent was never filled in', () => {
    const rows = statsByOpponent([
      played(1, 0, { opponent: 'Vale FC' }),
      played(2, 1, { opponent: 'vale fc' }),
      played(1, 1, { opponent: 'TBC' }),
      played(0, 1, { opponent: '' }),
    ]);
    expect(rows.map((r) => [r.opponent, r.played])).toEqual([['Vale FC', 2]]);
  });
});
