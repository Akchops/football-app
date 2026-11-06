import { describe, expect, it } from 'vitest';
import { defaultRepeatUntil, describeRepeat, repeatDates, repeatLimit, weekdayList } from './repeat';

const SUN = 0;
const MON = 1;
const TUE = 2;
const THU = 4;
const SAT = 6;

describe('repeatDates', () => {
  it('gives every chosen weekday up to the end date, both ends included', () => {
    // Tuesday 3 November 2026 to Thursday 19 November.
    expect(repeatDates('2026-11-03', [TUE, THU], '2026-11-19')).toEqual([
      '2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12', '2026-11-17', '2026-11-19',
    ]);
  });

  it('starts from the first chosen day on or after the date, not the date itself', () => {
    // Friday 6 November: the first Tuesday is the 10th.
    expect(repeatDates('2026-11-06', [TUE], '2026-11-24')).toEqual(['2026-11-10', '2026-11-17', '2026-11-24']);
  });

  it('gives nothing without a day, or with an end before the start', () => {
    expect(repeatDates('2026-11-03', [], '2026-12-31')).toEqual([]);
    expect(repeatDates('2026-11-10', [TUE], '2026-11-03')).toEqual([]);
  });

  it('gives nothing for a date that is missing or unreadable', () => {
    expect(repeatDates('', [TUE], '2026-12-31')).toEqual([]);
    expect(repeatDates('2026-11-03', [TUE], '')).toEqual([]);
  });

  it('keeps one session a day however the days are listed', () => {
    expect(repeatDates('2026-11-03', [TUE, TUE], '2026-11-10')).toEqual(['2026-11-03', '2026-11-10']);
  });

  // The UK's clocks go back on 25 October 2026; run with TZ=Europe/London to cross it for real.
  it('crosses the clocks going back and the turn of the year without losing or doubling a day', () => {
    const dates = repeatDates('2026-10-20', [SUN], '2027-01-10');
    expect(dates).toContain('2026-10-25');
    expect(dates).toContain('2027-01-03');
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates.every((d, i) => i === 0 || (Date.parse(d) - Date.parse(dates[i - 1])) / 86400000 === 7)).toBe(true);
  });

  it('stops at six months, however far away the end date is', () => {
    const dates = repeatDates('2026-11-06', [MON, SAT], '2028-01-01');
    expect(dates[dates.length - 1] <= '2027-05-06').toBe(true);
    // Twice a week for six months: about 52, never a year's worth.
    expect(dates.length).toBeGreaterThan(48);
    expect(dates.length).toBeLessThan(56);
  });
});

describe('repeatLimit', () => {
  it('is six months on, the same day of the month', () => {
    expect(repeatLimit('2026-11-06')).toBe('2027-05-06');
  });

  it('keeps inside a shorter month', () => {
    expect(repeatLimit('2026-08-31')).toBe('2027-02-28');
    expect(repeatLimit('2027-08-31')).toBe('2028-02-29');
  });
});

describe('defaultRepeatUntil', () => {
  it('covers four weeks of sessions', () => {
    expect(repeatDates('2026-11-03', [TUE], defaultRepeatUntil('2026-11-03'))).toHaveLength(4);
  });
});

describe('weekdayList', () => {
  it('names the days in the order the week runs', () => {
    expect(weekdayList([THU, TUE], 1)).toBe('Tuesdays and Thursdays');
    expect(weekdayList([SUN, MON, SAT], 1)).toBe('Mondays, Saturdays and Sundays');
    expect(weekdayList([SUN, MON, SAT], 0)).toBe('Sundays, Mondays and Saturdays');
  });

  it('says one day plainly, and all seven as every day', () => {
    expect(weekdayList([TUE], 1)).toBe('Tuesdays');
    expect(weekdayList([0, 1, 2, 3, 4, 5, 6], 1)).toBe('Every day');
  });
});

describe('describeRepeat', () => {
  it('says how many, which days and from when to when', () => {
    const dates = repeatDates('2026-11-10', [TUE, THU], '2026-12-03');
    expect(describeRepeat(dates, [TUE, THU], 1)).toBe('8 sessions · Tuesdays and Thursdays · Tue 10 Nov to Thu 3 Dec');
  });

  it('says one session as one', () => {
    expect(describeRepeat(['2026-11-10'], [TUE], 1)).toBe('1 session · Tue 10 Nov');
  });
});
