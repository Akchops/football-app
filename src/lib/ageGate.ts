import { useSyncExternalStore } from 'react';

/**
 * How old the person holding this phone is - asked once, before anyone signs
 * in, as a plain "when were you born?" that gives no hint of what answer gets
 * what. Only the band is kept, here on the phone; the server is told only
 * "teen" or "adult" for the account that signs in (supabase/schema.sql,
 * declare_age).
 *
 * Under 13 means no account of their own. They can use Matchday on this phone
 * with nothing leaving it, or a parent or guardian signs in with their own
 * email and looks after the account. Until one has, nothing about the child
 * goes anywhere: no account, no coach, no reminders.
 */

export type AgeBand = 'child' | 'teen' | 'adult';

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
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const age = thisYear - year - (thisMonth <= month ? 1 : 0);
  if (age < 13) return 'child';
  if (age < 18) return 'teen';
  return 'adult';
}

/**
 * The player's own date of birth, read the way the server reads it: under 13,
 * or no usable date at all - the cautious reading.
 */
export function playerIsChild(dateOfBirth: string, now = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth ?? '');
  if (!match) return true;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const thirteenth = new Date(y + 13, m - 1, d);
  if (Number.isNaN(thirteenth.getTime())) return true;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return thirteenth > today;
}

let cached: AgeGate | null | undefined;

export function readGate(): AgeGate | null {
  if (cached !== undefined) return cached;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AgeGate> | null;
    cached =
      raw && (raw.holder === 'child' || raw.holder === 'teen' || raw.holder === 'adult')
        ? {
            holder: raw.holder,
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

/** What the server is told about the account that signs in on this phone. */
export function bandToDeclare(gate: AgeGate | null): 'teen' | 'adult' | null {
  if (!gate) return null;
  if (gate.holder === 'child') return gate.parent ? 'adult' : null;
  return gate.holder;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useAgeGate(): AgeGate | null {
  return useSyncExternalStore(subscribe, readGate, readGate);
}
