import { describe, expect, it } from 'vitest';
import {
  ageGroupCheck, ageOn, countdown, daysBetween, formatDateShort, formatTime, fromISODate, kickoffAt, monthGrid,
  nextSeasonAgeGroup, relativeDayLabel, seasonLabel, suggestAgeGroup, toISODate, weekdayLabels,
} from './date';

describe('date helpers', () => {
  it('formats an ISO date in local time, not UTC', () => {
    // A late-evening local time would roll over to the next day under toISOString().
    expect(toISODate(new Date(2026, 2, 14, 23, 30))).toBe('2026-03-14');
  });

  it('round-trips ISO dates', () => {
    const d = fromISODate('2026-03-14');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(14);
  });

  it('builds a kickoff Date from date + time', () => {
    const k = kickoffAt('2026-04-05', '16:30');
    expect(k.getHours()).toBe(16);
    expect(k.getMinutes()).toBe(30);
    expect(k.getDate()).toBe(5);
  });

  it('formats a 24h time as 12h', () => {
    expect(formatTime('16:30')).toBe('4:30 PM');
    expect(formatTime('09:05')).toBe('9:05 AM');
    expect(formatTime('00:00')).toBe('12:00 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
  });

  it('formats short dates', () => {
    expect(formatDateShort('2026-04-05')).toBe('Sun 5 Apr');
  });

  it('returns a full 6-week grid starting on the configured weekday', () => {
    const grid = monthGrid(2026, 3, 1); // April 2026, weeks start Monday
    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(1);
    expect(grid.some((d) => toISODate(d) === '2026-04-01')).toBe(true);
    expect(grid.some((d) => toISODate(d) === '2026-04-30')).toBe(true);
  });

  it('labels weekdays from the configured start', () => {
    expect(weekdayLabels(1)[0]).toBe('Mon');
    expect(weekdayLabels(0)[0]).toBe('Sun');
  });

  it('counts whole days between dates across a month boundary', () => {
    expect(daysBetween('2026-04-28', '2026-05-02')).toBe(4);
    expect(daysBetween('2026-05-02', '2026-04-28')).toBe(-4);
  });

  it('describes days relative to today', () => {
    const now = new Date(2026, 3, 10, 12, 0);
    expect(relativeDayLabel('2026-04-10', now)).toBe('Today');
    expect(relativeDayLabel('2026-04-11', now)).toBe('Tomorrow');
    expect(relativeDayLabel('2026-04-09', now)).toBe('Yesterday');
    expect(relativeDayLabel('2026-04-15', now)).toBe('In 5 days');
    expect(relativeDayLabel('2026-04-03', now)).toBe('7 days ago');
  });

  it('counts down to kickoff and stops at zero', () => {
    const now = new Date(2026, 3, 10, 12, 0);
    expect(countdown(new Date(2026, 3, 10, 12, 35), now)).toBe('35m');
    expect(countdown(new Date(2026, 3, 10, 14, 30), now)).toBe('2h 30m');
    expect(countdown(new Date(2026, 3, 12, 16, 0), now)).toBe('2d 4h');
    expect(countdown(new Date(2026, 3, 10, 11, 0), now)).toBe('Kicked off');
  });

  it('rolls the season over in July', () => {
    expect(seasonLabel(new Date(2026, 7, 1))).toBe('2026/27');
    expect(seasonLabel(new Date(2026, 2, 1))).toBe('2025/26');
  });
});

describe('age helpers', () => {
  it('works out age, allowing for a birthday that has not happened yet', () => {
    expect(ageOn('2010-04-12', new Date(2026, 7, 23))).toBe(16);
    expect(ageOn('2010-12-12', new Date(2026, 7, 23))).toBe(15);
    expect(ageOn('', new Date(2026, 7, 23))).toBeNull();
  });

  it('suggests a youth age group from age on 31 August', () => {
    // Turns 15 in April 2026, so 15 on 31 Aug 2026 -> U16 for the 2026/27 season.
    expect(suggestAgeGroup('2011-04-12', new Date(2026, 8, 15))).toBe('U16');
    expect(suggestAgeGroup('2000-04-12', new Date(2026, 8, 15))).toBe('Open age');
    expect(suggestAgeGroup('2007-04-12', new Date(2026, 8, 15))).toBe('U21');
    expect(suggestAgeGroup('', new Date(2026, 8, 15))).toBe('');
  });
});

/**
 * The age group never moves by itself - a player might be playing up a year -
 * so a new season asks once. These pin down what it offers and when it asks.
 */
describe('new-season age group', () => {
  // 28 September 2026: the 2026/27 season started on 1 July.
  const now = new Date(2026, 8, 28);
  const profile = { ageGroup: 'U13', ageGroupSeason: '2025/26', dateOfBirth: '2013-05-01', onboardedAt: '2025-09-01' };

  it('offers the next youth band up, whatever the date of birth says', () => {
    expect(nextSeasonAgeGroup('U13', '2013-05-01', now)).toBe('U14');
    // Playing a year up stays a year up.
    expect(nextSeasonAgeGroup('U15', '2013-05-01', now)).toBe('U16');
    expect(nextSeasonAgeGroup('U17', '', now)).toBe('U18');
  });

  it('lets the date of birth decide past U18, where bands span several years', () => {
    // 18 on 31 August 2026.
    expect(nextSeasonAgeGroup('U18', '2008-05-01', now)).toBe('U21');
    // Still 19, so still U21: nothing to move to.
    expect(nextSeasonAgeGroup('U21', '2007-05-01', now)).toBeNull();
    expect(nextSeasonAgeGroup('Open age', '1991-05-01', now)).toBe('Veterans');
    // Without a date of birth there is no telling.
    expect(nextSeasonAgeGroup('U18', '', now)).toBeNull();
    expect(nextSeasonAgeGroup('', '2013-05-01', now)).toBeNull();
  });

  it('never offers a move back down', () => {
    // A 12-year-old somehow down as U21 is not told to drop to U13.
    expect(nextSeasonAgeGroup('U21', '2014-05-01', now)).toBeNull();
  });

  it('asks once a new season has started', () => {
    expect(ageGroupCheck(profile, now)).toEqual({ season: '2026/27', from: 'U13', to: 'U14' });
  });

  it('does not ask again once answered this season', () => {
    expect(ageGroupCheck({ ...profile, ageGroupSeason: '2026/27' }, now)).toBeNull();
    // A season ahead - a phone with its clock wrong - counts as answered, not as a reason to nag.
    expect(ageGroupCheck({ ...profile, ageGroupSeason: '2027/28' }, now)).toBeNull();
  });

  it('asks nothing before setup, with no group set, or with no band above', () => {
    expect(ageGroupCheck({ ...profile, onboardedAt: null }, now)).toBeNull();
    expect(ageGroupCheck({ ...profile, ageGroup: '' }, now)).toBeNull();
    expect(ageGroupCheck({ ...profile, ageGroup: 'Open age', dateOfBirth: '' }, now)).toBeNull();
  });

  it('asks a profile that has never been asked', () => {
    expect(ageGroupCheck({ ...profile, ageGroupSeason: '' }, now)?.to).toBe('U14');
  });
});
