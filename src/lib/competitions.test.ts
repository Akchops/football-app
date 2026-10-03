import { describe, expect, it } from 'vitest';
import type { Competition, Match, Team } from '../types';
import { hourAfter, nextMatchFor } from './competitions';

const settings = { defaultKickoff: '16:30', defaultMatchLength: 90 };
const today = '2026-10-03';

function tournament(over: Partial<Competition> = {}): Competition {
  return {
    id: 'harvest', name: 'Harvest Cup', type: 'tournament', season: '2026/27', ageGroup: 'U13', color: '#fff',
    notes: '', archived: false, placing: '', startDate: '2026-10-18', teamId: 'wanderers', location: 'Central Fields',
    matchLength: 40, createdAt: '', updatedAt: '', deletedAt: null, ...over,
  };
}

const wanderers: Team = {
  id: 'wanderers', name: 'Wanderers FC', ageGroup: 'U13', position: 'GK', color: '#38bdf8', notes: '',
  createdAt: '', updatedAt: '', deletedAt: null,
};

let seq = 0;
function match(over: Partial<Match> = {}): Match {
  seq += 1;
  return {
    id: `m${seq}`, competitionId: 'harvest', teamId: 'wanderers', opponent: 'Vale FC', stage: 'group',
    stageDetail: 'B', date: '2026-10-18', time: '10:00', venue: 'neutral', location: 'North Pitch', durationMinutes: 30,
    status: 'scheduled', result: null, notes: '', remindAfter: null, createdAt: '', updatedAt: '', deletedAt: null,
    ...over,
  };
}

/**
 * Fixtures for a tournament often arrive one at a time. Each one added should
 * need only its opponent and kickoff, not the whole tournament typed in again.
 */
describe('the next match for a competition', () => {
  it('keeps the group going: another game in the same group', () => {
    expect(nextMatchFor(tournament(), [match()], [wanderers], settings, today)).toMatchObject({ stage: 'group', stageDetail: 'B' });
  });

  it('starts an empty tournament from what it was set up with', () => {
    expect(nextMatchFor(tournament(), [], [wanderers], settings, today)).toEqual({
      competitionId: 'harvest',
      teamId: 'wanderers',
      opponent: '',
      stage: 'group',
      stageDetail: '',
      date: '2026-10-18',
      time: '16:30',
      venue: 'neutral',
      location: 'Central Fields',
      durationMinutes: 40,
      notes: '',
    });
  });

  it('follows its latest match: same day an hour on, same ground, the next round', () => {
    const matches = [
      match({ time: '10:00' }),
      match({ time: '11:00', stage: 'semi', stageDetail: 'Plate' }),
      // Another tournament's match doesn't count.
      match({ competitionId: 'other', time: '15:00', stage: 'final', stageDetail: '' }),
    ];
    expect(nextMatchFor(tournament(), matches, [wanderers], settings, today)).toMatchObject({
      // The Plate semi is followed by the Plate final.
      stage: 'final',
      stageDetail: 'Plate',
      date: '2026-10-18',
      time: '12:00',
      location: 'North Pitch',
      durationMinutes: 30,
    });
  });

  it('starts on today, at the usual kickoff, once its days have passed', () => {
    const draft = nextMatchFor(
      tournament({ startDate: '2026-09-20' }),
      [match({ date: '2026-09-20' })],
      [wanderers],
      settings,
      today,
    );
    expect(draft).toMatchObject({ date: today, time: '16:30' });
  });

  it('never plays for a team that has been deleted', () => {
    expect(nextMatchFor(tournament(), [], [], settings, today).teamId).toBeNull();
    // A deleted team on the latest match falls back to the tournament's own.
    expect(nextMatchFor(tournament(), [match({ teamId: 'gone' })], [wanderers], settings, today).teamId).toBe('wanderers');
  });

  it('gives a league a home game with no round, at its usual length', () => {
    const league = tournament({ type: 'league', startDate: '', teamId: null, location: '', matchLength: 0 });
    expect(nextMatchFor(league, [], [wanderers], settings, today)).toMatchObject({
      stage: null,
      stageDetail: '',
      venue: 'home',
      date: today,
      durationMinutes: 90,
      teamId: null,
    });
  });

  it('moves the kickoff on an hour, but not past the end of the day', () => {
    expect(hourAfter('09:30')).toBe('10:30');
    expect(hourAfter('23:15')).toBe('23:15');
    expect(hourAfter('')).toBe('01:00');
  });
});
