import { describe, expect, it } from 'vitest';
import { emptyResult, type Match, type MatchResult, type TrainingSession } from '../types';
import { currentMissions, rankFor, starTotals, type MissionContext } from './missions';

const NOW = new Date(2026, 3, 15, 12, 0); // Wed 15 Apr 2026

let seq = 0;
type MatchOver = Omit<Partial<Match>, 'result'> & { result?: Partial<MatchResult> };

function match(date: string, over: MatchOver = {}): Match {
  seq += 1;
  const { result, ...rest } = over;
  return {
    id: `m${seq}`,
    competitionId: null,
    teamId: null,
    opponent: `Team ${seq}`,
    date,
    time: '16:30',
    venue: 'home',
    location: '',
    durationMinutes: 90,
    status: 'played',
    notes: '',
    remindAfter: null,
    createdAt: '',
    updatedAt: '',
    result: { ...emptyResult('GK'), ...result },
    ...rest,
  };
}

function session(date: string, durationMinutes = 60): TrainingSession {
  seq += 1;
  return {
    id: `t${seq}`,
    teamId: null,
    type: 'team',
    date,
    time: '18:00',
    durationMinutes,
    intensity: 3,
    focus: '',
    notes: '',
    createdAt: '',
    updatedAt: '',
  };
}

function ctx(over: Partial<MissionContext> = {}): MissionContext {
  return {
    matches: [],
    training: [],
    group: 'goalkeeper',
    weekStartsOn: 1,
    now: NOW,
    ...over,
  };
}

const find = (list: ReturnType<typeof currentMissions>, id: string) => list.find((m) => m.id === id);

describe('currentMissions', () => {
  it('offers weekly and monthly missions', () => {
    const list = currentMissions(ctx());
    expect(list.some((m) => m.period === 'week')).toBe(true);
    expect(list.some((m) => m.period === 'month')).toBe(true);
  });

  it('counts training in the current week only', () => {
    // Week starting Monday 13 Apr; the 10th is the previous week.
    const list = currentMissions(
      ctx({ training: [session('2026-04-13'), session('2026-04-15'), session('2026-04-10')] }),
    );
    const train2 = find(list, 'train2');
    expect(train2?.current).toBe(2);
    expect(train2?.complete).toBe(true);
    expect(find(list, 'train4')?.current).toBe(2);
    expect(find(list, 'train4')?.complete).toBe(false);
  });

  it('respects a Sunday week start', () => {
    // Sunday 12 Apr falls in this week when weeks start on Sunday, not Monday.
    const training = [session('2026-04-12')];
    expect(find(currentMissions(ctx({ training })), 'train2')?.current).toBe(0);
    expect(find(currentMissions(ctx({ training, weekStartsOn: 0 })), 'train2')?.current).toBe(1);
  });

  it('gives keepers a saves mission and forwards a scoring one', () => {
    const asKeeper = currentMissions(ctx({ group: 'goalkeeper' })).map((m) => m.id);
    const asForward = currentMissions(ctx({ group: 'forward' })).map((m) => m.id);
    expect(asKeeper).toContain('saves5');
    expect(asKeeper).not.toContain('contribute');
    expect(asForward).toContain('contribute');
    expect(asForward).not.toContain('saves5');
  });

  it('tracks a keeper\'s saves across the week', () => {
    const list = currentMissions(
      ctx({ matches: [match('2026-04-14', { result: { metrics: { saves: 3 } } }), match('2026-04-15', { result: { metrics: { saves: 4 } } })] }),
    );
    expect(find(list, 'saves5')?.complete).toBe(true);
  });

  it('caps progress at the target so bars never overflow', () => {
    const training = Array.from({ length: 9 }, () => session('2026-04-14'));
    expect(find(currentMissions(ctx({ training })), 'train2')?.current).toBe(2);
  });

  it('only rewards logging results once a match has been played', () => {
    expect(find(currentMissions(ctx()), 'logAll')?.complete).toBe(false);
    const played = currentMissions(ctx({ matches: [match('2026-04-14')] }));
    expect(find(played, 'logAll')?.complete).toBe(true);
  });

  it('withholds the logging star while a played match has no result', () => {
    const list = currentMissions(
      ctx({ matches: [match('2026-04-14'), match('2026-04-13', { status: 'scheduled', result: undefined })] }),
    );
    expect(find(list, 'logAll')?.complete).toBe(false);
  });

  it('sorts unfinished missions above finished ones', () => {
    const list = currentMissions(ctx({ training: [session('2026-04-14'), session('2026-04-15')] }));
    const firstDone = list.findIndex((m) => m.complete);
    const lastOpen = list.map((m) => m.complete).lastIndexOf(false);
    expect(firstDone).toBeGreaterThan(lastOpen);
  });

  it('averages match score for the monthly rating mission', () => {
    const list = currentMissions(
      ctx({
        matches: [
          match('2026-04-02', { result: { goalsFor: 2, goalsAgainst: 0, metrics: { saves: 5 } } }),
          match('2026-04-09', { result: { goalsFor: 1, goalsAgainst: 0, metrics: { saves: 4 } } }),
        ],
      }),
    );
    expect(find(list, 'rated70')?.current).toBeGreaterThan(60);
  });
});

describe('starTotals', () => {
  it('is zero with nothing logged', () => {
    expect(starTotals(ctx())).toEqual({ milestone: 0, mission: 0, total: 0 });
  });

  it('counts milestone stars from appearances', () => {
    const matches = Array.from({ length: 5 }, (_, i) => match(`2026-04-${String(i + 1).padStart(2, '0')}`));
    const totals = starTotals(ctx({ matches }));
    expect(totals.milestone).toBeGreaterThan(0);
    expect(totals.total).toBe(totals.milestone + totals.mission);
  });

  it('awards mission stars for a completed week', () => {
    const bare = starTotals(ctx());
    const trained = starTotals(ctx({ training: [session('2026-04-13'), session('2026-04-14')] }));
    expect(trained.mission).toBeGreaterThan(bare.mission);
  });

  it('keeps stars from weeks that have already gone by', () => {
    // Two sessions in a week a month ago still count towards the running total.
    const past = starTotals(ctx({ training: [session('2026-03-09'), session('2026-03-10')] }));
    expect(past.mission).toBeGreaterThan(0);
  });

  it('never goes down when more is logged', () => {
    const before = starTotals(ctx({ training: [session('2026-04-13')] })).total;
    const after = starTotals(ctx({ training: [session('2026-04-13'), session('2026-04-14')] })).total;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

describe('rankFor', () => {
  it('starts at Rookie and climbs with stars', () => {
    expect(rankFor(0).name).toBe('Rookie');
    expect(rankFor(5).name).toBe('Squad Player');
    expect(rankFor(30).name).toBe('First Choice');
    expect(rankFor(999).name).toBe('Club Legend');
  });

  it('points at the next rank until the top', () => {
    const early = rankFor(0);
    expect(early.next).toBe(5);
    expect(early.nextName).toBe('Squad Player');
    expect(rankFor(999).next).toBeNull();
  });
});
