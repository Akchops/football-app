/** Date helpers. Everything is handled in the device's local timezone. */

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DD' for a Date, in local time (not UTC like toISOString). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

/** Parse 'YYYY-MM-DD' into a local Date at midnight. */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Combine a match's date + time into a local Date. */
export function kickoffAt(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh || 0, mm || 0, 0, 0);
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return toISODate(a) === toISODate(b);
}

/**
 * The 6x7 grid of days covering a month, padded with the surrounding days
 * so every row is a full week.
 */
export function monthGrid(year: number, month: number, weekStartsOn: 0 | 1): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function weekdayLabels(weekStartsOn: 0 | 1): string[] {
  return Array.from({ length: 7 }, (_, i) => DAY_NAMES_SHORT[(i + weekStartsOn) % 7]);
}

/** '4:30 PM' style label from 'HH:mm'. */
export function formatTime(time: string): string {
  const [hRaw, mRaw] = (time || '00:00').split(':').map(Number);
  const h = hRaw ?? 0;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(mRaw ?? 0)} ${suffix}`;
}

/** 'Sat 12 Apr' style label from 'YYYY-MM-DD'. */
export function formatDateShort(iso: string): string {
  const d = fromISODate(iso);
  return `${DAY_NAMES_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
}

export function formatDateLong(iso: string): string {
  const d = fromISODate(iso);
  return `${DAY_NAMES_SHORT[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Whole days between two calendar dates (b - a). */
export function daysBetween(aISO: string, bISO: string): number {
  const a = fromISODate(aISO).getTime();
  const b = fromISODate(bISO).getTime();
  return Math.round((b - a) / 86400000);
}

/** 'Today', 'Tomorrow', 'in 5 days', '3 days ago'. */
export function relativeDayLabel(iso: string, now: Date = new Date()): string {
  const diff = daysBetween(todayISO(now), iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

/** Countdown text for an upcoming kickoff, e.g. '2d 4h' or '35m'. */
export function countdown(target: Date, now: Date = new Date()): string {
  let ms = target.getTime() - now.getTime();
  if (ms <= 0) return 'Kicked off';
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const minutes = mins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function seasonLabel(now: Date = new Date()): string {
  const y = now.getFullYear();
  // Northern-hemisphere season runs Aug -> May.
  return now.getMonth() >= 6 ? `${y}/${String(y + 1).slice(2)}` : `${y - 1}/${String(y).slice(2)}`;
}
