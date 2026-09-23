import { describe, expect, it } from 'vitest';
import { reducer } from './AppStore';
import { emptyData, live } from './storage';
import type { AppData, Competition, Match, Team, TrainingSession } from '../types';

const STAMP = '2026-01-01T00:00:00.000Z';

function team(id: string): Team {
  return {
    id, name: `Team ${id}`, ageGroup: 'U16', position: 'GK', color: '#38bdf8', notes: '',
    createdAt: STAMP, updatedAt: STAMP, deletedAt: null,
  };
}

function competition(id: string): Competition {
  return {
    id, name: `Comp ${id}`, type: 'league', season: '25/26', color: '#22c55e', notes: '',
    archived: false, createdAt: STAMP, updatedAt: STAMP, deletedAt: null,
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
