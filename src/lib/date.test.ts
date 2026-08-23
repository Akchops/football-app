import { describe, expect, it } from 'vitest';
import {
  countdown, daysBetween, formatDateShort, formatTime, fromISODate, kickoffAt, monthGrid,
  relativeDayLabel, seasonLabel, toISODate, weekdayLabels,
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
