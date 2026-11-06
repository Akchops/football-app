/**
 * Training that repeats: the same session on the same days each week - Tuesday
 * and Thursday nights, say - until a date. Each day becomes its own ordinary
 * session, so any one of them can be moved, changed or deleted on its own.
 */

import { addDays, formatDateShort, fromISODate, toISODate } from './date';

/** How far ahead a repeat can run: about a season's half, and far enough for anyone's plans. */
export const REPEAT_MONTHS = 6;

const PLURAL_DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(fromISODate(value).getTime());
}

/**
 * The last day a repeat starting on `startISO` may run to: six months on, the
 * same day of the month - or the month's last day, when it's shorter.
 */
export function repeatLimit(startISO: string): string {
  const start = fromISODate(startISO);
  const month = new Date(start.getFullYear(), start.getMonth() + REPEAT_MONTHS, 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return toISODate(new Date(month.getFullYear(), month.getMonth(), Math.min(start.getDate(), lastDay)));
}

/** Where the end date starts when a repeat is switched on: four weeks of sessions. */
export function defaultRepeatUntil(startISO: string): string {
  return toISODate(addDays(fromISODate(startISO), 27));
}

/**
 * Every day from `startISO` to `untilISO`, both included, that falls on one of
 * `weekdays` (0 Sunday to 6 Saturday, as Date.getDay counts them). Never runs
 * past `repeatLimit`, and gives nothing for an end before the start.
 */
export function repeatDates(startISO: string, weekdays: readonly number[], untilISO: string): string[] {
  if (!isISODate(startISO) || !isISODate(untilISO) || weekdays.length === 0) return [];
  const limit = repeatLimit(startISO);
  // ISO dates sort as text, so the earlier of the two is the smaller string.
  const last = untilISO < limit ? untilISO : limit;
  const days = new Set(weekdays);
  const dates: string[] = [];
  for (let day = fromISODate(startISO); toISODate(day) <= last; day = addDays(day, 1)) {
    if (days.has(day.getDay())) dates.push(toISODate(day));
  }
  return dates;
}

/** 'Tuesdays and Thursdays', in the order the week runs on this phone. */
export function weekdayList(weekdays: readonly number[], weekStartsOn: 0 | 1): string {
  const chosen = new Set(weekdays);
  if (chosen.size === 7) return 'Every day';
  const names = Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7)
    .filter((day) => chosen.has(day))
    .map((day) => PLURAL_DAYS[day]);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** What saving will do, said before it's done: '8 sessions · Tuesdays and Thursdays · Tue 10 Nov to Thu 3 Dec'. */
export function describeRepeat(dates: readonly string[], weekdays: readonly number[], weekStartsOn: 0 | 1): string {
  if (dates.length === 0) return '';
  if (dates.length === 1) return `1 session · ${formatDateShort(dates[0])}`;
  return `${dates.length} sessions · ${weekdayList(weekdays, weekStartsOn)} · ${formatDateShort(dates[0])} to ${formatDateShort(dates[dates.length - 1])}`;
}
