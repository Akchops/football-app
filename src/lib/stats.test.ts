import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, emptyResult, type Match, type MatchResult, type Settings } from '../types';
import {
  computeStats, outcomeOf, pendingResultMatches, scoreline, shootoutWinner, statsByCompetition,
  statsByMonth, statsByVenue, upcomingMatches,
} from './stats';

let seq = 0;
function match(over: Partial<Match> = {}): Match {
  seq += 1;
  return {
    id: `m${seq}`,
    competitionId: null,
    opponent: 'Opponent',
    date: '2026-04-10',
    time: '16:30',
    venue: 'home',
    location: '',
    status: 'scheduled',
    result: null,
    notes: '',
    remindAfter: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function played(goalsFor: number, goalsAgainst: number, over: Partial<Match & MatchResult> = {}): Match {
  const { date, time, venue, competitionId, opponent, ...resultOver } = over as Partial<Match> & Partial<MatchResult>;
  return match({
    status: 'played',
    date: date ?? '2026-04-10',
    time: time ?? '16:30',
    venue: venue ?? 'home',
    competitionId: competitionId ?? null,
    opponent: opponent ?? 'Opponent',
    result: { ...emptyResult('CM'), goalsFor, goalsAgainst, ...(resultOver as Partial<MatchResult>) },
  });
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
    played(2, 1, { date: '2026-04-01', goals: 1, assists: 1, rating: 8, motm: true }),
    played(0, 3, { date: '2026-04-08', minutes: 65, rating: 5 }),
    played(1, 1, { date: '2026-04-15', penaltiesFor: 4, penaltiesAgainst: 3, assists: 1 }),
    played(3, 0, { date: '2026-04-22', goals: 2, venue: 'away' }),
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
    const withBench = computeStats([played(2, 0, { didPlay: false, goals: 0 }), played(1, 0, { goals: 1 })]);
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
      [{ id: 'c1', name: 'League', type: 'league', season: '25/26', color: '#fff', notes: '', archived: false, createdAt: '' }],
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
      [played(1, 0, { date: '2026-04-02', goals: 1 }), played(0, 1, { date: '2025-04-02' })],
      6,
      now,
    );
    expect(buckets).toHaveLength(6);
    expect(buckets[buckets.length - 1].played).toBe(1);
    expect(buckets.reduce((sum, b) => sum + b.played, 0)).toBe(1);
  });
});
