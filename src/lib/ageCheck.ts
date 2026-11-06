/**
 * The age check before an account is made. Without an account nothing leaves
 * the phone, so this is the point where the law starts to care: under 13s need
 * a parent or guardian to sign in for them (COPPA in the US; 13 is also the UK
 * age for agreeing to an online service yourself).
 *
 * Only a month and year are asked - enough to tell, and less to hand over -
 * and they aren't kept. What the server is told is just how the check was
 * passed: by someone 13 or over, or by a parent or guardian who agreed.
 */

/** The youngest anyone can sign in for themselves. */
export const MIN_AGE = 13;
/** A parent or guardian signing in for a child has to be an adult. */
export const ADULT_AGE = 18;

/**
 * Whole years from a month (1-12) and year of birth. A birthday in the current
 * month counts as not reached yet: the day isn't asked, and for a minimum age
 * that's the safe way round.
 */
export function ageFromBirthMonth(month: number, year: number, now: Date = new Date()): number {
  const thisMonth = now.getMonth() + 1;
  return now.getFullYear() - year - (thisMonth <= month ? 1 : 0);
}

const UNDER_13_KEY = 'matchday.signInUnder13';

/**
 * An under-13 answer is remembered for the rest of the visit, so going back and
 * picking an older year isn't the way round it. Only a parent signing in moves on.
 */
export function rememberedUnder13(): boolean {
  try {
    return sessionStorage.getItem(UNDER_13_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberUnder13(): void {
  try {
    sessionStorage.setItem(UNDER_13_KEY, '1');
  } catch {
    // Private mode: it just isn't remembered.
  }
}

/** How the check was passed, kept with a new account. Never the birth date. */
export interface AgeRecord {
  signed_in_by: 'self' | 'parent';
  /** 'parent' is set only with the parent's agreement, so this says when they gave it. */
  checked_at: string;
}

const HELD_KEY = 'matchday.ageCheck';

/** Keeps how the check was passed until sign-in finishes, including a trip out to Google and back. */
export function holdAgeRecord(age: AgeRecord): void {
  try {
    sessionStorage.setItem(HELD_KEY, JSON.stringify(age));
  } catch {
    // Private mode: an account made by email still gets it with the code request.
  }
}

/** The held record, once - it is cleared as it is read. */
export function takeHeldAgeRecord(): AgeRecord | null {
  try {
    const raw = sessionStorage.getItem(HELD_KEY);
    sessionStorage.removeItem(HELD_KEY);
    const age = raw ? (JSON.parse(raw) as Partial<AgeRecord>) : null;
    return age && (age.signed_in_by === 'self' || age.signed_in_by === 'parent') && typeof age.checked_at === 'string'
      ? { signed_in_by: age.signed_in_by, checked_at: age.checked_at }
      : null;
  } catch {
    return null;
  }
}
