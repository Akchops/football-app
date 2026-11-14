import { useSyncExternalStore } from 'react';

/**
 * How old the person holding this phone is - asked once, before anyone signs
 * in, as a plain "when were you born?" that gives no hint of what answer gets
 * what. Only the band is kept, here on the phone; the server is told only
 * "adult" for the account that signs in (supabase/schema.sql, declare_age).
 *
 * Matchday follows India's Digital Personal Data Protection Act, 2023, under
 * which everyone under 18 is a child, and a child's personal data needs the
 * verifiable consent of a parent or lawful guardian (section 9). So under 18
 * means no account of their own: they use Matchday on this phone with nothing
 * leaving it, or a parent or guardian signs in with their own email and looks
 * after the account. Until one has, nothing about the child goes anywhere: no
 * account, no coach, no reminders.
 */

export const ADULT_AGE = 18;

export type AgeBand = 'child' | 'adult';

export interface AgeGate {
  /** The person holding the phone. */
  holder: AgeBand;
  /** A parent or guardian has signed in for a child holder. */
  parent: boolean;
  /** A child using Matchday with nothing leaving the phone. */
  localOnly: boolean;
  /** Accounts the server has been told the band for, from this phone. */
  recorded: string[];
}

const KEY = 'matchday.ageGate.v1';
const listeners = new Set<() => void>();

/**
 * From a month and year alone, so the same day is never needed. In the birth
 * month itself the birthday is taken as not yet here - the younger reading.
 */
export function bandFor(year: number, month: number, now = new Date()): AgeBand {
  const age = now.getFullYear() - year - (now.getMonth() + 1 <= month ? 1 : 0);
  return age < ADULT_AGE ? 'child' : 'adult';
}

/**
 * The player's own date of birth, read the way the server reads it: under 18,
 * or no usable date at all - the cautious reading.
 */
export function playerIsChild(dateOfBirth: string, now = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth ?? '');
  if (!match) return true;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const comesOfAge = new Date(y + ADULT_AGE, m - 1, d);
  if (Number.isNaN(comesOfAge.getTime())) return true;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return comesOfAge > today;
}

let cached: AgeGate | null | undefined;

export function readGate(): AgeGate | null {
  if (cached !== undefined) return cached;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as (Partial<AgeGate> & { holder?: string }) | null;
    // An answer kept by an earlier build as "teen" (13 to 17) is a child here.
    const holder = raw?.holder === 'adult' ? 'adult' : raw?.holder === 'child' || raw?.holder === 'teen' ? 'child' : null;
    cached =
      raw && holder
        ? {
            holder,
            parent: raw.parent === true,
            localOnly: raw.localOnly === true,
            recorded: Array.isArray(raw.recorded) ? raw.recorded.filter((id): id is string => typeof id === 'string') : [],
          }
        : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function saveGate(gate: AgeGate | null): void {
  cached = gate;
  try {
    if (gate) localStorage.setItem(KEY, JSON.stringify(gate));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: asked again next time, which is the safe way round.
  }
  listeners.forEach((fn) => fn());
}

export function updateGate(change: Partial<AgeGate>): void {
  const gate = readGate();
  if (gate) saveGate({ ...gate, ...change });
}

/** Forgets the cached copy, after something else has cleared storage. */
export function reloadGate(): void {
  cached = undefined;
  listeners.forEach((fn) => fn());
}

/** A child with no parent or guardian signed in: nothing about them may leave the phone. */
export function childOnly(gate: AgeGate | null = readGate()): boolean {
  return gate !== null && gate.holder === 'child' && !gate.parent;
}

/** What the server is told about the account that signs in on this phone: only ever that it is an adult's. */
export function bandToDeclare(gate: AgeGate | null): 'adult' | null {
  if (!gate) return null;
  return gate.holder === 'adult' || gate.parent ? 'adult' : null;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useAgeGate(): AgeGate | null {
  return useSyncExternalStore(subscribe, readGate, readGate);
}
