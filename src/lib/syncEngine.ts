import { live } from '../store/storage';
import type { AppData, Profile, Settings } from '../types';
import {
  TABLES, fingerprint, fromServer, hasContent, isEmpty, keyOf, mergeRemote, outgoing,
  profileFromServer, settingsFromServer, type Outgoing, type RemoteChanges, type Table,
} from './sync';

/**
 * One sync between this phone and the household's copy on the server.
 *
 * Everything that talks to the network sits behind `Remote`, so this file
 * holds only the decisions - which household, what to fetch, what to send -
 * and can be tested against an in-memory server with several phones at once.
 */

/** A record as the server keeps it, with the server's own stamp of when it arrived. */
export interface ServerRow {
  id: string;
  data: unknown;
  syncedAt: string;
}

export interface Household {
  id: string;
  name: string;
  playerId: string;
}

export interface Invite {
  id: string;
  householdId: string;
  householdName: string;
  invitedBy: string;
}

export interface SentInvite {
  id: string;
  email: string;
}

export interface Person {
  email: string;
  role: string;
  isMe: boolean;
}

export interface PullResult {
  rows: Record<Table, ServerRow[]>;
  /** The player's profile and settings as stored, or null if the row is missing. */
  profile: unknown | null;
  settings: unknown | null;
}

/** The server, as one signed-in person sees it. */
export interface Remote {
  /** Households this person belongs to, most recently joined first. */
  households(): Promise<Household[]>;
  invitesForMe(): Promise<Invite[]>;
  acceptInvite(inviteId: string): Promise<void>;
  createHousehold(name: string, profile: Profile, settings: Settings): Promise<Household>;
  /** Records changed since `since` (the server's clock); everything when it is empty. */
  pull(playerId: string, since: string): Promise<PullResult>;
  push(playerId: string, out: Outgoing): Promise<void>;
  people(householdId: string): Promise<Person[]>;
  sentInvites(householdId: string): Promise<SentInvite[]>;
  invite(householdId: string, email: string): Promise<void>;
  cancelInvite(inviteId: string): Promise<void>;
}

/** What a phone remembers between syncs. */
export interface SyncState {
  userId: string;
  householdId: string;
  playerId: string;
  /** The latest server stamp seen - the next pull asks for anything after it. */
  cursor: string;
  /** Fingerprint of the last version of each record the server confirmed. */
  confirmed: Record<string, string>;
}

export interface SyncHooks {
  remote: Remote;
  userId: string;
  getLocal(): AppData;
  /** Fold server records into the phone's data - atomically, against whatever is there now. */
  applyRemote(changes: RemoteChanges): void;
  replaceLocal(data: AppData): void;
  loadState(): SyncState | null;
  saveState(state: SyncState): void;
  /**
   * Asked once, when a phone that already has matches joins a household that
   * already has its own: keep both, or take the household's only.
   */
  askJoin(question: { householdName: string; localMatches: number }): Promise<'merge' | 'replace'>;
  /** Keeps a copy of whatever "take the household's only" is about to discard. */
  backup(data: AppData): void;
}

export interface SyncResult {
  household: Household;
  pulled: number;
  pushed: number;
  /** An invite was accepted on this sync. */
  joined: boolean;
  /** A new household was made on this sync. */
  created: boolean;
}

/**
 * Pulls start this far before the last stamp seen. A row stamped just before a
 * pull but committed just after it would otherwise be skipped for good; seeing
 * a few rows twice costs nothing, since merging is idempotent.
 */
const OVERLAP_MS = 10_000;

function householdName(profile: Profile): string {
  const name = profile.name.trim();
  return name ? `${name}'s family` : 'Our family';
}

function later(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

function countOf(out: Outgoing): number {
  return TABLES.reduce((n, t) => n + out.rows[t].length, 0) + (out.profile ? 1 : 0) + (out.settings ? 1 : 0);
}

export async function syncOnce(h: SyncHooks): Promise<SyncResult> {
  let state = h.loadState();
  if (state && state.userId !== h.userId) state = null;

  const households = await h.remote.households();
  // Removed from the household, or left it on another phone: start over.
  if (state && !households.some((x) => x.id === state?.householdId)) state = null;

  let household: Household;
  let joined = false;
  let created = false;
  const firstTime = !state;

  if (state) {
    household = households.find((x) => x.id === state?.householdId) as Household;
  } else {
    let pool = households;
    if (pool.length === 0) {
      // Not in a household yet. Someone who was invited joins that one;
      // anyone else gets their own, with this phone's data as its start.
      const invites = await h.remote.invitesForMe();
      if (invites.length > 0) {
        await h.remote.acceptInvite(invites[0].id);
        joined = true;
        pool = await h.remote.households();
      }
    }
    if (pool.length > 0) {
      household = pool[0];
    } else {
      const local = h.getLocal();
      household = await h.remote.createHousehold(householdName(local.profile), local.profile, local.settings);
      created = true;
    }
    state = { userId: h.userId, householdId: household.id, playerId: household.playerId, cursor: '', confirmed: {} };
  }

  // Pull: everything since the last stamp seen, by the server's clock.
  const since = state.cursor ? new Date(Date.parse(state.cursor) - OVERLAP_MS).toISOString() : '';
  const pulled = await h.remote.pull(state.playerId, since);

  const changes: RemoteChanges = {};
  const confirmed = { ...state.confirmed };
  let cursor = state.cursor;
  let pulledCount = 0;
  for (const table of TABLES) {
    const records = pulled.rows[table].map((row) => {
      cursor = later(cursor, row.syncedAt);
      const record = fromServer(table, row.data);
      confirmed[keyOf(table, record.id)] = fingerprint(record);
      return record;
    });
    if (records.length > 0) {
      (changes as Record<Table, unknown[]>)[table] = records;
      pulledCount += records.length;
    }
  }
  if (pulled.profile) {
    changes.profile = profileFromServer(pulled.profile);
    confirmed.profile = fingerprint(changes.profile);
  }
  if (pulled.settings) {
    changes.settings = settingsFromServer(pulled.settings);
    confirmed.settings = fingerprint(changes.settings);
  }

  // A phone joining a household that already has records, while holding its
  // own: the one moment this phone's data and the household's could be two
  // different seasons. Asked, never assumed.
  let local = h.getLocal();
  const householdHasRecords = TABLES.some((t) => pulled.rows[t].length > 0);
  if (firstTime && !created && householdHasRecords && hasContent(local)) {
    const choice = await h.askJoin({ householdName: household.name, localMatches: live(local.matches).length });
    if (choice === 'replace') {
      h.backup(local);
      const theirs: AppData = {
        version: local.version,
        profile: changes.profile ?? local.profile,
        settings: changes.settings ?? local.settings,
        matches: changes.matches ?? [],
        training: changes.training ?? [],
        teams: changes.teams ?? [],
        competitions: changes.competitions ?? [],
      };
      h.replaceLocal(theirs);
      local = theirs;
    } else {
      h.applyRemote(changes);
      local = mergeRemote(local, changes);
    }
  } else {
    h.applyRemote(changes);
    local = mergeRemote(local, changes);
  }

  // What the pull brought is kept even if sending then fails.
  state = { ...state, cursor, confirmed };
  h.saveState(state);

  // Push: whatever differs from the last version the server confirmed.
  const out = outgoing(local, confirmed);
  let pushedCount = 0;
  if (!isEmpty(out)) {
    await h.remote.push(state.playerId, out);
    for (const table of TABLES) {
      for (const record of out.rows[table] as { id: string }[]) confirmed[keyOf(table, record.id)] = fingerprint(record);
    }
    if (out.profile) confirmed.profile = fingerprint(out.profile);
    if (out.settings) confirmed.settings = fingerprint(out.settings);
    pushedCount = countOf(out);
    state = { ...state, confirmed };
    h.saveState(state);
  }

  return { household, pulled: pulledCount, pushed: pushedCount, joined, created };
}
