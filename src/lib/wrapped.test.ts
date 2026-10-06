import { describe, expect, it } from 'vitest';
import { emptyResult, type Competition, type Match, type MatchResult, type TrainingSession } from '../types';
import { wrappedFor, wrappedInvite, wrappedYear, type WrappedInput } from './wrapped';

let seq = 0;
function keeperGame(date: string, goalsFor: number, goalsAgainst: number, over: Partial<MatchResult> & Partial<Pick<Match, 'opponent' | 'competitionId' | 'teamId'>> = {}): Match {
  seq += 1;
  const { opponent, competitionId, teamId, ...result } = over;
  return {
    id: `m${seq}`, competitionId: competitionId ?? null, teamId: teamId ?? 't1', opponent: opponent ?? `Team ${seq}`,
    date, time: '10:00', venue: 'home', location: '', durationMinutes: 60, status: 'played',
    result: { ...emptyResult('GK', 'goalkeeper', 60), goalsFor, goalsAgainst, ...result },
    notes: '', remindAfter: null, stage: null, stageDetail: '',
    createdAt: '', updatedAt: '', deletedAt: null,
  };
}

function tournament(id: string, name: string, placing: string): Competition {
  return {
    id, name, type: 'tournament', season: '', ageGroup: '', color: '#f59e0b', notes: '', archived: placing !== '',
    placing, startDate: '', teamId: null, location: '', matchLength: 0, pointsWin: 3, pointsDraw: 1,
    createdAt: '', updatedAt: '', deletedAt: null,
  };
}

function session(date: string, minutes: number, type: TrainingSession['type']): TrainingSession {
  seq += 1;
  return {
    id: `s${seq}`, teamId: null, type, date, time: '18:00', durationMinutes: minutes, intensity: 3, focus: '', notes: '',
    createdAt: '', updatedAt: '', deletedAt: null,
  } as TrainingSession;
}

const year: WrappedInput = {
  profile: { positionGroup: 'goalkeeper' },
  competitions: [tournament('c1', 'Easter 7s', 'Winners'), tournament('c2', 'Summer Cup', ''), tournament('c3', 'Old Cup', 'Runners-up')],
  matches: [
    keeperGame('2025-12-20', 1, 0, { metrics: { saves: 9 } }), // last year - not counted
    keeperGame('2026-03-07', 2, 0, { metrics: { saves: 4 }, opponent: 'Oakfield' }),
    keeperGame('2026-03-14', 1, 1, { metrics: { saves: 6, conceded: 1 }, opponent: 'Vale' }),
    keeperGame('2026-04-05', 3, 0, { metrics: { saves: 7, penaltiesSaved: 1 }, motm: true, competitionId: 'c1', opponent: 'Oakfield' }),
    keeperGame('2026-04-05', 0, 2, { metrics: { saves: 2, conceded: 2 }, competitionId: 'c1', opponent: 'Hillcrest' }),
    keeperGame('2026-04-12', 2, 0, { metrics: { saves: 5 }, competitionId: 'c2', opponent: 'Oakfield' }),
    keeperGame('2026-09-01', 1, 0, { metrics: { saves: 3 }, didPlay: false, minutes: 0 }),
  ],
  training: [session('2026-02-01', 60, 'keeper'), session('2026-02-08', 90, 'keeper'), session('2026-02-09', 60, 'team'), session('2025-11-01', 600, 'gym')],
};

describe('wrappedFor', () => {
  const w = wrappedFor(year, 2026)!;

  it("counts only the year's results", () => {
    expect(w.year).toBe(2026);
    expect(w.played).toBe(6);
    expect(w.appearances).toBe(5);
    expect([w.wins, w.draws, w.losses]).toEqual([4, 1, 1]);
  });

  it("tells a keeper's year in saves, clean sheets and penalties", () => {
    expect(w.group).toBe('goalkeeper');
    // The game they didn't play in isn't theirs to count.
    expect(w.headline).toEqual([
      { value: 24, label: 'saves', one: 'save' },
      { value: 3, label: 'clean sheets', one: 'clean sheet' },
      { value: 1, label: 'penalties saved', one: 'penalty saved' },
    ]);
  });

  it('finds the best game and says why', () => {
    expect(w.best?.match.opponent).toBe('Oakfield');
    expect(w.best?.match.date).toBe('2026-04-05');
    expect(w.best?.line).toBe('Won 3-0 · 7 saves · 1 penalty saved · clean sheet');
  });

  it('runs, rivals, busiest month, tournaments and trophies', () => {
    expect(w.longestUnbeaten).toBe(3);
    expect(w.rival).toEqual({ name: 'Oakfield', played: 3, wins: 3, draws: 0, losses: 0 });
    expect(w.busiestMonth).toEqual({ name: 'April', matches: 3 });
    expect(w.tournaments.map((t) => [t.name, t.placing])).toEqual([
      ['Easter 7s', 'Winners'],
      ['Summer Cup', ''],
    ]);
    expect(w.trophies).toBe(1);
    expect(w.motm).toBe(1);
  });

  it("adds up the year's training", () => {
    expect(w.training).toEqual({ sessions: 3, hours: 4, topType: 'keeper' });
  });

  it('names the year from the numbers', () => {
    expect(w.type).toEqual({ name: 'The Wall', why: 'A clean sheet in 60% of your games.' });
    // Without the last clean sheet it's two in four - not enough for The Wall.
    const fewer = wrappedFor({ ...year, matches: year.matches.filter((m) => m.date !== '2026-04-12') }, 2026)!;
    expect(fewer.type).toEqual({ name: 'Last Line', why: '19 saves between the sticks.' });
    const busy = wrappedFor({ ...year, matches: [keeperGame('2026-05-01', 1, 2, { metrics: { saves: 11, conceded: 2 } })] }, 2026)!;
    expect(busy.type).toEqual({ name: 'Shot Stopper', why: '11 saves a game. Nothing got past easily.' });
  });

  it('has nothing to say about a year with no results', () => {
    expect(wrappedFor(year, 2024)).toBeNull();
  });

  it('tells a striker in goals', () => {
    const striker = wrappedFor(
      {
        ...year,
        profile: { positionGroup: 'forward' },
        matches: [
          { ...keeperGame('2026-02-01', 3, 1), result: { ...emptyResult('ST', 'forward', 60), goalsFor: 3, goalsAgainst: 1, metrics: { goals: 2, assists: 1 } } },
          { ...keeperGame('2026-02-08', 1, 0), result: { ...emptyResult('ST', 'forward', 60), goalsFor: 1, goalsAgainst: 0, metrics: { goals: 1 } } },
        ],
      },
      2026,
    )!;
    expect(striker.headline.map((h) => [h.value, h.label])).toEqual([
      [3, 'goals'],
      [1, 'assists'],
    ]);
    expect(striker.type).toEqual({ name: 'Goal Machine', why: '1.5 goals a game.' });
    expect(striker.best?.line).toBe('Won 3-1 · 2 goals · 1 assist');
  });
});

describe('wrappedYear and wrappedInvite', () => {
  it('offers the year just gone in January, this year the rest of the time', () => {
    expect(wrappedYear(new Date(2027, 0, 3))).toEqual({ year: 2026, complete: true });
    expect(wrappedYear(new Date(2026, 9, 6))).toEqual({ year: 2026, complete: false });
  });

  it('invites once, in January, when there is a year worth telling', () => {
    expect(wrappedInvite(new Date(2027, 0, 3), 0, year)).toBe(2026);
    expect(wrappedInvite(new Date(2027, 0, 3), 2026, year)).toBeNull();
    expect(wrappedInvite(new Date(2026, 11, 3), 0, year)).toBeNull();
    // Two games isn't much of a story.
    expect(wrappedInvite(new Date(2027, 0, 3), 0, { ...year, matches: year.matches.slice(0, 3) })).toBeNull();
  });
});
