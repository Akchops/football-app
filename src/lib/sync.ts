import {
  DEFAULT_PROFILE, DEFAULT_SETTINGS,
  type AppData, type Competition, type Match, type Profile, type Settings, type Team, type TrainingSession,
} from '../types';
import { normaliseCompetition, normaliseMatch, normaliseTeam, normaliseTraining } from '../store/storage';

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
export function canonical(value: unknown): string {
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
export function pick<T extends Stamped>(mine: T, theirs: T): T {
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

// ---------------------------------------------------------------------------
// Between this phone and the server.
// ---------------------------------------------------------------------------

/** The four lists that sync, by the names the app uses. */
export type Table = 'matches' | 'training' | 'teams' | 'competitions';
export const TABLES: readonly Table[] = ['matches', 'training', 'teams', 'competitions'];

/** What each list is called on the server. */
export const SERVER_TABLE: Record<Table, string> = {
  matches: 'matches',
  training: 'training_sessions',
  teams: 'teams',
  competitions: 'competitions',
};

type RecordOf = { matches: Match; training: TrainingSession; teams: Team; competitions: Competition };

/**
 * What came back from the server in one pull: any of the lists - only the
 * records that changed - and the profile and settings.
 */
export interface RemoteChanges {
  matches?: Match[];
  training?: TrainingSession[];
  teams?: Team[];
  competitions?: Competition[];
  profile?: Profile;
  settings?: Settings;
}

/**
 * Fold what the server sent into what is on the phone. Lists the server sent
 * nothing for are left exactly as they are - not even re-sorted - so a pull
 * with nothing new changes nothing on screen.
 */
export function mergeRemote(local: AppData, remote: RemoteChanges): AppData {
  let changed = false;
  const next: AppData = { ...local };
  for (const table of TABLES) {
    const theirs = remote[table];
    if (!theirs || theirs.length === 0) continue;
    // Each list is merged with its own record type; the cast only names which.
    (next as unknown as Record<Table, unknown[]>)[table] = mergeList(
      local[table] as RecordOf[typeof table][],
      theirs as RecordOf[typeof table][],
    );
    changed = true;
  }
  if (remote.profile) {
    const winner = pick(local.profile, remote.profile);
    if (winner !== local.profile) {
      next.profile = winner;
      changed = true;
    }
  }
  if (remote.settings) {
    const winner = pick(local.settings, remote.settings);
    if (winner !== local.settings) {
      next.settings = winner;
      changed = true;
    }
  }
  return changed ? next : local;
}

/**
 * A short fingerprint of a record's whole content. Comparing it with the
 * fingerprint of the last version the server confirmed says whether this
 * phone has something to send - without trusting any clock.
 */
export function fingerprint(value: unknown): string {
  const text = canonical(value);
  // FNV-1a, 32 bits. Not security - a collision would only delay one push.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export const keyOf = (table: Table, id: string) => `${table}:${id}`;

/** Everything on this phone that the server has not confirmed. */
export interface Outgoing {
  rows: { [T in Table]: RecordOf[T][] };
  profile?: Profile;
  settings?: Settings;
}

export function outgoing(local: AppData, confirmed: Readonly<Record<string, string>>): Outgoing {
  const rows = { matches: [], training: [], teams: [], competitions: [] } as unknown as Outgoing['rows'];
  for (const table of TABLES) {
    const list = local[table] as { id: string }[];
    (rows[table] as unknown[]) = list.filter((record) => fingerprint(record) !== confirmed[keyOf(table, record.id)]);
  }
  const out: Outgoing = { rows };
  if (fingerprint(local.profile) !== confirmed.profile) out.profile = local.profile;
  if (fingerprint(local.settings) !== confirmed.settings) out.settings = local.settings;
  return out;
}

export function isEmpty(out: Outgoing): boolean {
  return !out.profile && !out.settings && TABLES.every((t) => out.rows[t].length === 0);
}

/**
 * A record as the server hands it back, made safe to hold: anything added to
 * the app since that phone last updated is filled in, exactly as an old backup
 * would be.
 */
export function fromServer<T extends Table>(table: T, data: unknown): RecordOf[T] {
  const record = data as RecordOf[T];
  switch (table) {
    case 'matches':
      return normaliseMatch(record as Match) as RecordOf[T];
    case 'training':
      return normaliseTraining(record as TrainingSession) as RecordOf[T];
    case 'teams':
      return normaliseTeam(record as Team) as RecordOf[T];
    default:
      return normaliseCompetition(record as Competition) as RecordOf[T];
  }
}

export function profileFromServer(data: unknown): Profile {
  return { ...DEFAULT_PROFILE, ...(data as Partial<Profile>) };
}

export function settingsFromServer(data: unknown): Settings {
  return { ...DEFAULT_SETTINGS, ...(data as Partial<Settings>) };
}

/**
 * A time the server's timestamp columns will accept. Records from before
 * syncing existed can carry an empty or unreadable updatedAt; the record itself
 * keeps it as it is, only the column gets the earliest possible time.
 */
export function serverTime(value: string | null | undefined): string {
  return value && !Number.isNaN(Date.parse(value)) ? value : '1970-01-01T00:00:00.000Z';
}
