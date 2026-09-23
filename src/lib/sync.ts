import type { AppData } from '../types';

/**
 * Bringing two phones' copies of the same player back together.
 *
 * Everything here is pure: two copies in, one copy out, no network and no
 * storage. That is deliberate - the merge is the part that can silently lose
 * somebody's evening of typing, so it is the part worth being able to test
 * exhaustively without a server involved.
 */

/** A single record that carries its own edit time, like the profile or settings. */
interface Stamped {
  updatedAt: string;
}

/** What merging a list needs: an identity, an edit time, and a tombstone. */
export interface Syncable extends Stamped {
  id: string;
  deletedAt: string | null;
}

/**
 * Stable stringify - same text for the same content, whatever order the keys
 * happen to be in. A record built on the phone and the same record rebuilt from
 * the server can easily differ in key order, and `pick` leans on this for its
 * tie-break, so that difference must not change the answer.
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
    const entries = Object.entries(v as Record<string, unknown>);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries);
  });
}

function isDeleted(row: Stamped): boolean {
  return 'deletedAt' in row && (row as Syncable).deletedAt !== null;
}

/**
 * Which of two copies of one record to keep.
 *
 * Whole records win, never single fields. Merging two copies of a result field
 * by field would produce a scoreline neither person ever entered, which is worse
 * than either of them being wrong.
 *
 * The last thing anyone did wins - including an edit that lands after a delete,
 * which brings the record back. That is the rule that never silently throws away
 * somebody's later work, and deleting again is cheap. `deleteThenEdit` in the
 * tests pins this down, because it is a decision rather than an accident.
 *
 * Both phones must reach the same answer. Each computes `merge(its own copy,
 * the other's)`, so a rule that quietly favoured "mine" would leave the two of
 * them disagreeing forever, each pushing its own winner back at the other. That
 * is why an exact tie is broken on the records themselves and not on which
 * argument they arrived in.
 */
function pick<T extends Stamped>(mine: T, theirs: T): T {
  const a = mine.updatedAt || '';
  const b = theirs.updatedAt || '';
  if (a > b) return mine;
  if (b > a) return theirs;

  // Same instant. A delete sticks, so a coincidental edit cannot undo it.
  if (isDeleted(mine) !== isDeleted(theirs)) return isDeleted(mine) ? mine : theirs;

  // Same instant, same state, different content. Any fixed rule will do as long
  // as both phones apply it identically.
  return canonical(mine) <= canonical(theirs) ? mine : theirs;
}

/**
 * Merge two copies of one list. A record only on one side is kept as it is -
 * this is why two people each adding a session offline ends with both sessions
 * rather than one, which whole-file "newest wins" could never manage.
 */
export function mergeList<T extends Syncable>(mine: T[], theirs: T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of mine) byId.set(row.id, row);
  for (const row of theirs) {
    const existing = byId.get(row.id);
    byId.set(row.id, existing ? pick(existing, row) : row);
  }
  // Sorted, so the two phones agree on the array and not merely on the set.
  // Ids lead with a base-36 timestamp, so this is roughly creation order.
  return [...byId.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

/** Bring a remote copy of everything together with this phone's copy. */
export function mergeData(mine: AppData, theirs: AppData): AppData {
  return {
    version: Math.max(mine.version, theirs.version),
    profile: pick(mine.profile, theirs.profile),
    settings: pick(mine.settings, theirs.settings),
    teams: mergeList(mine.teams, theirs.teams),
    competitions: mergeList(mine.competitions, theirs.competitions),
    matches: mergeList(mine.matches, theirs.matches),
    training: mergeList(mine.training, theirs.training),
  };
}

/**
 * Whether this phone is holding anything worth uploading. Signing in on a phone
 * that already has a season on it must offer to keep it, not quietly replace it
 * with an empty account.
 */
export function hasContent(data: AppData): boolean {
  return (
    data.matches.length > 0 ||
    data.training.length > 0 ||
    data.teams.length > 0 ||
    data.competitions.length > 0 ||
    data.profile.onboardedAt !== null
  );
}
