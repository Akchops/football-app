import { describe, expect, it } from 'vitest';
import { reducer } from './AppStore';
import { emptyData, live } from './storage';
import { emptyResult, type AppData, type Competition, type Match, type Team, type TrainingSession } from '../types';

const STAMP = '2026-01-01T00:00:00.000Z';

function team(id: string): Team {
  return {
    id, name: `Team ${id}`, ageGroup: 'U16', position: 'GK', color: '#38bdf8', notes: '',
    createdAt: STAMP, updatedAt: STAMP, deletedAt: null,
  };
}

function competition(id: string): Competition {
  return {
    id, name: `Comp ${id}`, type: 'league', season: '25/26', ageGroup: '', color: '#22c55e', notes: '',
    archived: false, placing: '', createdAt: STAMP, updatedAt: STAMP, deletedAt: null,
  };
}

function match(id: string, over: Partial<Match> = {}): Match {
  return {
    id, competitionId: null, teamId: null, opponent: 'Riverside FC', date: '2026-04-10',
    time: '16:30', venue: 'home', location: '', durationMinutes: 90, status: 'scheduled',
    result: null, notes: '', remindAfter: null,
    createdAt: STAMP, updatedAt: STAMP, deletedAt: null, ...over,
  };
}

function session(id: string): TrainingSession {
  return {
    id, teamId: null, type: 'team', date: '2026-04-09', time: '18:00', durationMinutes: 60,
    intensity: 3, focus: '', notes: '', createdAt: STAMP, updatedAt: STAMP, deletedAt: null,
  };
}

function dataWith(over: Partial<AppData>): AppData {
  return { ...emptyData(), ...over };
}

/**
 * Deleting has to leave a mark rather than a gap. Without these, a delete on one
 * phone is silently undone by the next phone that syncs its own copy - and the
 * only visible symptom is a match the user already got rid of coming back.
 */
describe('deleting keeps a tombstone', () => {
  it('marks a match deleted instead of dropping it', () => {
    const before = dataWith({ matches: [match('m1'), match('m2')] });
    const after = reducer(before, { type: 'match/delete', id: 'm1' });

    expect(after.matches).toHaveLength(2);
    expect(after.matches[0].deletedAt).not.toBeNull();
    // The edit time moves too, or the delete loses to an older copy on merge.
    expect(after.matches[0].updatedAt).not.toBe(STAMP);
    expect(after.matches[1].deletedAt).toBeNull();
  });

  it('hides the deleted match from everything that reads the list', () => {
    const before = dataWith({ matches: [match('m1'), match('m2')] });
    const after = reducer(before, { type: 'match/delete', id: 'm1' });

    expect(live(after.matches).map((m) => m.id)).toEqual(['m2']);
  });

  it('marks a training session deleted instead of dropping it', () => {
    const before = dataWith({ training: [session('t1'), session('t2')] });
    const after = reducer(before, { type: 'training/delete', id: 't1' });

    expect(after.training).toHaveLength(2);
    expect(live(after.training).map((t) => t.id)).toEqual(['t2']);
  });

  it('buries a team and still lets its matches outlive it', () => {
    const before = dataWith({ teams: [team('a')], matches: [match('m1', { teamId: 'a' })] });
    const after = reducer(before, { type: 'team/delete', id: 'a' });

    expect(after.teams).toHaveLength(1);
    expect(live(after.teams)).toHaveLength(0);
    // The match survives, just without a team - and its own edit time moves so
    // the other phones learn it was unlinked.
    expect(live(after.matches)).toHaveLength(1);
    expect(after.matches[0].teamId).toBeNull();
    expect(after.matches[0].updatedAt).not.toBe(STAMP);
  });

  it('buries a competition and leaves its matches uncategorised', () => {
    const before = dataWith({
      competitions: [competition('c1')],
      matches: [match('m1', { competitionId: 'c1' })],
    });
    const after = reducer(before, { type: 'competition/delete', id: 'c1' });

    expect(live(after.competitions)).toHaveLength(0);
    expect(live(after.matches)).toHaveLength(1);
    expect(after.matches[0].competitionId).toBeNull();
  });

  it('leaves other teams alone when one is deleted', () => {
    const before = dataWith({
      teams: [team('a'), team('b')],
      matches: [match('m1', { teamId: 'b' })],
    });
    const after = reducer(before, { type: 'team/delete', id: 'a' });

    expect(live(after.teams).map((t) => t.id)).toEqual(['b']);
    expect(after.matches[0].teamId).toBe('b');
    expect(after.matches[0].updatedAt).toBe(STAMP);
  });
});

/**
 * Finishing is what the matches can't say for themselves: that it's over, and
 * how far they got. The stats stay worked out from the matches.
 */
describe('finishing a competition', () => {
  const finish = { type: 'competition/finish', id: 'c1', placing: 'Winners', ageGroup: 'U14', notes: 'Golden Glove' } as const;

  it('records how far they got, and moves the edit time so it syncs', () => {
    const after = reducer(dataWith({ competitions: [competition('c1')] }), finish);

    expect(after.competitions[0]).toMatchObject({ archived: true, placing: 'Winners', ageGroup: 'U14', notes: 'Golden Glove' });
    expect(after.competitions[0].updatedAt).not.toBe(STAMP);
  });

  it('calls off only its own rounds that were never played', () => {
    const before = dataWith({
      competitions: [competition('c1'), competition('c2')],
      matches: [
        match('won', { competitionId: 'c1', status: 'played', result: emptyResult('GK') }),
        match('final', { competitionId: 'c1' }),
        match('elsewhere', { competitionId: 'c2' }),
        match('deleted', { competitionId: 'c1', deletedAt: STAMP }),
      ],
    });
    const after = reducer(before, finish);
    const byId = Object.fromEntries(after.matches.map((m) => [m.id, m]));

    // Called off - kept, and restorable - rather than deleted.
    expect(byId.final.status).toBe('cancelled');
    expect(byId.final.deletedAt).toBeNull();
    expect(byId.final.updatedAt).not.toBe(STAMP);
    // Everything else is exactly as it was.
    expect(byId.won).toBe(before.matches[0]);
    expect(byId.elsewhere).toBe(before.matches[2]);
    expect(byId.deleted).toBe(before.matches[3]);
  });

  it('reopens without forgetting the placing, ready for next time', () => {
    const finished = reducer(dataWith({ competitions: [competition('c1')] }), finish);
    const after = reducer(finished, { type: 'competition/reopen', id: 'c1' });

    expect(after.competitions[0].archived).toBe(false);
    expect(after.competitions[0].placing).toBe('Winners');
    expect(after.competitions[0].updatedAt).not.toBe(STAMP);
  });
});

/** Without a new edit time, the other phone's older copy can win the merge and undo the edit. */
describe('edits move the edit time', () => {
  it('on a team', () => {
    const after = reducer(dataWith({ teams: [team('a')] }), { type: 'team/update', id: 'a', patch: { ageGroup: 'U15' } });
    expect(after.teams[0].ageGroup).toBe('U15');
    expect(after.teams[0].updatedAt).not.toBe(STAMP);
  });

  it('on a competition', () => {
    const after = reducer(dataWith({ competitions: [competition('c1')] }), {
      type: 'competition/update',
      id: 'c1',
      patch: { ageGroup: 'U14' },
    });
    expect(after.competitions[0].ageGroup).toBe('U14');
    expect(after.competitions[0].updatedAt).not.toBe(STAMP);
  });
});

describe('answering the new-season question', () => {
  const before = () =>
    dataWith({
      profile: { ...emptyData().profile, ageGroup: 'U13', ageGroupSeason: '2025/26', updatedAt: STAMP },
      teams: [
        { ...team('club'), ageGroup: 'U13' },
        { ...team('sunday'), ageGroup: 'Open age' },
        { ...team('old'), ageGroup: 'U13', deletedAt: STAMP },
      ],
    });

  it('moves up, taking the teams in the old age group along', () => {
    const start = before();
    const after = reducer(start, { type: 'profile/confirmAgeGroup', ageGroup: 'U14', season: '2026/27' });

    expect(after.profile).toMatchObject({ ageGroup: 'U14', ageGroupSeason: '2026/27' });
    expect(after.profile.updatedAt).not.toBe(STAMP);
    expect(after.teams[0].ageGroup).toBe('U14');
    expect(after.teams[0].updatedAt).not.toBe(STAMP);
    // A team in another group was set that way on purpose; a deleted one stays buried as it was.
    expect(after.teams[1]).toBe(start.teams[1]);
    expect(after.teams[2]).toBe(start.teams[2]);
  });

  it('staying put just records the answer', () => {
    const start = before();
    const after = reducer(start, { type: 'profile/confirmAgeGroup', ageGroup: 'U13', season: '2026/27' });

    expect(after.profile).toMatchObject({ ageGroup: 'U13', ageGroupSeason: '2026/27' });
    expect(after.teams).toBe(start.teams);
  });
});
