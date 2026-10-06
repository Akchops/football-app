/** Date helpers. Everything is handled in the device's local timezone. */

import { AGE_GROUPS, type Profile } from '../types';

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

/** Midnight on the first day of the week containing `d`. */
export function startOfWeek(d: Date, weekStartsOn: 0 | 1): Date {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (start.getDay() - weekStartsOn + 7) % 7;
  return addDays(start, -offset);
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

/** The football season a day falls in - '2026/27' from July on, as the rest of the app counts it. */
export function seasonOf(dateISO: string): string {
  return seasonLabel(fromISODate(dateISO));
}

/** Age on a given day, from a 'YYYY-MM-DD' date of birth. */
export function ageOn(dob: string, on: Date): number | null {
  if (!dob) return null;
  const born = fromISODate(dob);
  if (Number.isNaN(born.getTime())) return null;
  let age = on.getFullYear() - born.getFullYear();
  const beforeBirthday =
    on.getMonth() < born.getMonth() ||
    (on.getMonth() === born.getMonth() && on.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

export function currentAge(dob: string, now: Date = new Date()): number | null {
  return ageOn(dob, now);
}

/**
 * Youth football bands by age on 31 August of the current season, which is how
 * English grassroots leagues set them.
 */
export function suggestAgeGroup(dob: string, now: Date = new Date()): string {
  const seasonStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const age = ageOn(dob, new Date(seasonStart, 7, 31));
  if (age === null) return '';
  if (age < 6) return 'U7';
  if (age < 18) return `U${age + 1}`;
  if (age < 21) return 'U21';
  if (age < 23) return 'U23';
  if (age >= 35) return 'Veterans';
  return 'Open age';
}

/**
 * The age group a player moves into when a new season starts, or null when it
 * stays the same. Youth bands are a year wide, so it's simply the next one up -
 * which keeps anyone playing a year up or down exactly where they were. From
 * U18 the bands span several years, so the date of birth decides.
 */
export function nextSeasonAgeGroup(current: string, dob: string, now: Date = new Date()): string | null {
  if (!current) return null;
  const youth = /^U(\d+)$/.exec(current);
  if (youth && Number(youth[1]) < 18) return `U${Number(youth[1]) + 1}`;
  const byBirthday = suggestAgeGroup(dob, now);
  return byBirthday && AGE_GROUPS.indexOf(byBirthday) > AGE_GROUPS.indexOf(current) ? byBirthday : null;
}

/** The new-season question: move up from `from` to `to`? */
export interface AgeGroupCheck {
  year: number;
  from: string;
  to: string;
}

/**
 * The age group never moves by itself - the player might be playing up, or
 * staying down - so once a year, when the new season starts with the new year,
 * the app asks. Null when there is nothing to ask: no group set, already
 * answered this year, or no band above.
 */
export function ageGroupCheck(
  profile: Pick<Profile, 'ageGroup' | 'ageGroupYear' | 'dateOfBirth' | 'onboardedAt'>,
  now: Date = new Date(),
): AgeGroupCheck | null {
  if (!profile.onboardedAt || !profile.ageGroup) return null;
  const year = now.getFullYear();
  // A later year counts as answered too, so a phone with its clock wrong doesn't nag.
  if (profile.ageGroupYear >= year) return null;
  const to = nextSeasonAgeGroup(profile.ageGroup, profile.dateOfBirth, now);
  return to ? { year, from: profile.ageGroup, to } : null;
}
