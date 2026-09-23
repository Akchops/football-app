import { describe, expect, it } from 'vitest';
import { hasContent, mergeData, mergeList } from './sync';
import { emptyData } from '../store/storage';
import { emptyResult, type AppData, type Match, type TrainingSession } from '../types';

const T1 = '2026-04-01T10:00:00.000Z';
const T2 = '2026-04-02T10:00:00.000Z';
const T3 = '2026-04-03T10:00:00.000Z';

function match(id: string, over: Partial<Match> = {}): Match {
  return {
    id, competitionId: null, teamId: null, opponent: 'Riverside FC', date: '2026-04-10',
    time: '16:30', venue: 'home', location: '', durationMinutes: 90, status: 'scheduled',
    result: null, notes: '', remindAfter: null,
    createdAt: T1, updatedAt: T1, deletedAt: null, ...over,
  };
}

function session(id: string, over: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id, teamId: null, type: 'team', date: '2026-04-09', time: '18:00', durationMinutes: 60,
    intensity: 3, focus: '', notes: '', createdAt: T1, updatedAt: T1, deletedAt: null, ...over,
  };
}

function dataWith(over: Partial<AppData>): AppData {
  return { ...emptyData(), ...over };
}

describe('mergeList', () => {
  it('keeps both records when two people each add one offline', () => {
    // The whole point of merging per record: mum adds a session on her phone,
    // dad adds one on his, neither has signal. Both must survive.
    const mine = [session('t_mum')];
    const theirs = [session('t_dad')];

    expect(mergeList(mine, theirs).map((s) => s.id)).toEqual(['t_dad', 't_mum']);
  });

  it('keeps the newer edit when the same record changed on both phones', () => {
    const mine = [match('m1', { opponent: 'Mine', updatedAt: T2 })];
    const theirs = [match('m1', { opponent: 'Theirs', updatedAt: T3 })];

    const merged = mergeList(mine, theirs);
    expect(merged).toHaveLength(1);
    expect(merged[0].opponent).toBe('Theirs');
  });

  it('takes the winning record whole rather than blending the two', () => {
    // A result built half from one phone and half from the other is a scoreline
    // that never happened, so the loser contributes nothing at all.
    const mine = [match('m1', {
      updatedAt: T2, status: 'played', notes: 'my notes',
      result: { ...emptyResult('GK'), goalsFor: 5, goalsAgainst: 0 },
    })];
    const theirs = [match('m1', {
      updatedAt: T3, status: 'played', notes: 'their notes',
      result: { ...emptyResult('GK'), goalsFor: 1, goalsAgainst: 1 },
    })];

    const [merged] = mergeList(mine, theirs);
    expect(merged.result?.goalsFor).toBe(1);
    expect(merged.result?.goalsAgainst).toBe(1);
    expect(merged.notes).toBe('their notes');
  });

  it('does not resurrect a record the other phone has not touched', () => {
    // The failure this guards against: a delete travels, the other phone pushes
    // its stale copy back, and the match the user got rid of reappears.
    const mine = [match('m1', { updatedAt: T2, deletedAt: T2 })];
    const theirs = [match('m1', { updatedAt: T1 })];

    expect(mergeList(mine, theirs)[0].deletedAt).toBe(T2);
    expect(mergeList(theirs, mine)[0].deletedAt).toBe(T2);
  });

  it('lets a later edit bring a deleted record back', () => {
    // A decision, not an accident: the last thing anyone did wins, so no one's
    // later work is thrown away silently. Deleting again is cheap.
    const deleted = [match('m1', { updatedAt: T2, deletedAt: T2 })];
    const edited = [match('m1', { updatedAt: T3, opponent: 'Edited later' })];

    const merged = mergeList(deleted, edited);
    expect(merged[0].deletedAt).toBeNull();
    expect(merged[0].opponent).toBe('Edited later');
  });

  it('lets a later delete beat an earlier edit', () => {
    const edited = [match('m1', { updatedAt: T2, opponent: 'Edited first' })];
    const deleted = [match('m1', { updatedAt: T3, deletedAt: T3 })];

    expect(mergeList(edited, deleted)[0].deletedAt).toBe(T3);
  });

  it('makes a delete stick when both happened in the same instant', () => {
    const deleted = [match('m1', { updatedAt: T2, deletedAt: T2 })];
    const edited = [match('m1', { updatedAt: T2, opponent: 'Same moment' })];

    expect(mergeList(deleted, edited)[0].deletedAt).toBe(T2);
    expect(mergeList(edited, deleted)[0].deletedAt).toBe(T2);
  });

  it('lets a record with an edit time beat one migrated without', () => {
    // Teams and competitions from before syncing existed can carry an empty
    // updatedAt. Untouched should lose to actually edited.
    const untouched = [match('m1', { updatedAt: '', opponent: 'Old' })];
    const edited = [match('m1', { updatedAt: T1, opponent: 'New' })];

    expect(mergeList(untouched, edited)[0].opponent).toBe('New');
    expect(mergeList(edited, untouched)[0].opponent).toBe('New');
  });

  it('handles either side being empty', () => {
    expect(mergeList([], [match('m1')])).toHaveLength(1);
    expect(mergeList([match('m1')], [])).toHaveLength(1);
    expect(mergeList<Match>([], [])).toEqual([]);
  });
});

describe('both phones reach the same answer', () => {
  // This is the property that matters most. Each phone computes
  // merge(its own copy, the other's). If the two results differ, they push
  // conflicting states at each other forever and never settle.
  const cases: Array<[string, Match[], Match[]]> = [
    ['different records', [match('m1')], [match('m2')]],
    ['same record, different times', [match('m1', { updatedAt: T2 })], [match('m1', { updatedAt: T3 })]],
    ['same record, same time, different content', [match('m1', { opponent: 'A' })], [match('m1', { opponent: 'B' })]],
    ['delete against edit', [match('m1', { updatedAt: T2, deletedAt: T2 })], [match('m1', { updatedAt: T2, notes: 'x' })]],
    ['one side empty', [], [match('m1')]],
    ['overlapping sets', [match('m1'), match('m2', { updatedAt: T3 })], [match('m2', { updatedAt: T2 }), match('m3')]],
  ];

  for (const [name, a, b] of cases) {
    it(`converges: ${name}`, () => {
      expect(mergeList(a, b)).toEqual(mergeList(b, a));
    });
  }

  it('converges even when key order differs between the two copies', () => {
    // A record rebuilt from the server can have its keys in a different order
    // than the one built on the phone. That must not change the winner.
    const mine = [match('m1', { updatedAt: T2, opponent: 'Same' })];
    const reordered = [JSON.parse(JSON.stringify(
      Object.fromEntries(Object.entries(match('m1', { updatedAt: T2, opponent: 'Same' })).reverse()),
    )) as Match];

    expect(mergeList(mine, reordered)).toEqual(mergeList(reordered, mine));
  });

  it('settles: merging an already-merged result changes nothing', () => {
    const a = [match('m1', { updatedAt: T2 }), match('m2')];
    const b = [match('m2', { updatedAt: T3 }), match('m3')];
    const once = mergeList(a, b);

    expect(mergeList(once, b)).toEqual(once);
    expect(mergeList(once, a)).toEqual(once);
  });
});

describe('mergeData', () => {
  it('merges every list and keeps the higher version', () => {
    const mine = dataWith({ version: 5, matches: [match('m1')], training: [session('t1')] });
    const theirs = dataWith({ version: 5, matches: [match('m2')], training: [session('t2')] });

    const merged = mergeData(mine, theirs);
    expect(merged.matches).toHaveLength(2);
    expect(merged.training).toHaveLength(2);
    expect(merged.version).toBe(5);
  });

  it('keeps the newer profile and settings whole', () => {
    const mine = dataWith({
      profile: { ...emptyData().profile, name: 'Old name', updatedAt: T1 },
      settings: { ...emptyData().settings, defaultKickoff: '10:00', updatedAt: T3 },
    });
    const theirs = dataWith({
      profile: { ...emptyData().profile, name: 'New name', updatedAt: T2 },
      settings: { ...emptyData().settings, defaultKickoff: '19:00', updatedAt: T1 },
    });

    const merged = mergeData(mine, theirs);
    expect(merged.profile.name).toBe('New name');
    expect(merged.settings.defaultKickoff).toBe('10:00');
  });

  it('is the same from either phone', () => {
    const mine = dataWith({ matches: [match('m1', { updatedAt: T2 })], training: [session('t1')] });
    const theirs = dataWith({ matches: [match('m1', { updatedAt: T3 })], training: [session('t2')] });

    expect(mergeData(mine, theirs)).toEqual(mergeData(theirs, mine));
  });
});

describe('hasContent', () => {
  it('is false for a phone with nothing on it', () => {
    expect(hasContent(emptyData())).toBe(false);
  });

  it('is true once there is anything worth keeping', () => {
    expect(hasContent(dataWith({ matches: [match('m1')] }))).toBe(true);
    expect(hasContent(dataWith({ training: [session('t1')] }))).toBe(true);
    expect(hasContent(dataWith({ profile: { ...emptyData().profile, onboardedAt: T1 } }))).toBe(true);
  });
});
