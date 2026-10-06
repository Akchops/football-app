import { describe, expect, it } from 'vitest';
import type { Competition, Match } from '../types';
import { reminderSchedule } from './reminders';

let seq = 0;
function fixture(date: string, time: string, over: Partial<Match> = {}): Match {
  seq += 1;
  return {
    id: `m${seq}`, competitionId: null, teamId: 't1', opponent: 'Oakfield', date, time, venue: 'home', location: '',
    durationMinutes: 60, status: 'scheduled', result: null, notes: '', remindAfter: null, stage: null, stageDetail: '',
    createdAt: '', updatedAt: '', deletedAt: null, ...over,
  };
}

const cup = { id: 'c1', name: 'Harvest Cup' } as Competition;
const both = { dayBefore: true, results: true };
// Tuesday 6 October 2026, midday.
const now = new Date(2026, 9, 6, 12, 0);
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('reminderSchedule', () => {
  it('reminds the evening before and asks for the result after full time', () => {
    const list = reminderSchedule(
      [fixture('2026-10-10', '10:30', { opponent: 'Oakfield Rangers', venue: 'away', location: 'Riverside Park', notes: 'Meet 9:45 AM' })],
      [],
      both,
      now,
    );
    expect(list).toEqual([
      {
        at: at(2026, 10, 9, 18),
        title: 'Tomorrow: @ Oakfield Rangers',
        body: 'Meet 9:45 AM · Kick-off 10:30 AM · Riverside Park',
        url: './',
        tag: 'day-2026-10-10',
      },
      {
        at: at(2026, 10, 10, 12),
        title: 'How did it go @ Oakfield Rangers?',
        body: 'Log the result while it’s fresh.',
        url: './',
        tag: 'result-2026-10-10',
      },
    ]);
  });

  it('makes a tournament day one reminder each way, not one per game', () => {
    const day = [
      fixture('2026-10-18', '11:00', { competitionId: 'c1', opponent: 'Vale', location: 'Central Fields' }),
      fixture('2026-10-18', '09:30', { competitionId: 'c1', opponent: 'Hillcrest', location: 'Central Fields' }),
      fixture('2026-10-18', '13:00', { competitionId: 'c1', opponent: 'TBC', location: 'Central Fields', durationMinutes: 30 }),
    ];
    const list = reminderSchedule(day, [cup], both, now);
    expect(list.map((r) => [r.title, r.body])).toEqual([
      ['Tomorrow: Harvest Cup', '3 matches, first at 9:30 AM · Central Fields'],
      ['How did Harvest Cup go?', 'Log your 3 results while they’re fresh.'],
    ]);
    // After the last game: 13:00 + 30 minutes + half an hour.
    expect(list[1].at).toBe(at(2026, 10, 18, 14));
  });

  it('names two separate games on one day', () => {
    const list = reminderSchedule(
      [fixture('2026-10-11', '10:00', { opponent: 'Ajax' }), fixture('2026-10-11', '15:00', { opponent: 'Brighton', venue: 'away' })],
      [],
      { dayBefore: true, results: false },
      now,
    );
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'Tomorrow: 2 matches', body: 'vs Ajax 10:00 AM, @ Brighton 3:00 PM' });
  });

  it('leaves out what has already happened, results already in, and what is turned off', () => {
    const list = reminderSchedule(
      [
        // Tomorrow's: its evening-before is 6pm today, still to come.
        fixture('2026-10-07', '10:00', { opponent: 'Tomorrow FC' }),
        // This morning's game: too late for "tomorrow", but its result is still to log at 12:30.
        fixture('2026-10-06', '11:00', { opponent: 'This Morning' }),
        // An earlier one today with no result yet goes in the same nudge.
        fixture('2026-10-06', '09:00', { opponent: 'Earlier' }),
        // Kicked off last week.
        fixture('2026-09-29', '10:00', { opponent: 'Last Week' }),
        // Already played, and called off.
        fixture('2026-10-12', '10:00', { opponent: 'Played', status: 'played' }),
        fixture('2026-10-13', '10:00', { opponent: 'Off', status: 'cancelled' }),
        // Too far ahead for now - it'll come round when the list is next sent.
        fixture('2026-12-25', '10:00', { opponent: 'Christmas' }),
      ],
      [],
      both,
      now,
    );
    expect(list.map((r) => [r.title, r.body])).toEqual([
      ['How did today go?', 'Log your 2 results while they’re fresh.'],
      ['Tomorrow: vs Tomorrow FC', 'Kick-off 10:00 AM'],
      ['How did it go vs Tomorrow FC?', 'Log the result while it’s fresh.'],
    ]);
    expect(reminderSchedule([fixture('2026-10-10', '10:00')], [], { dayBefore: false, results: false }, now)).toEqual([]);
  });
});
