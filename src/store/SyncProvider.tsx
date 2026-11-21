import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  accountsAvailable, currentAccount, onAccountChange, rememberedAccount, signOut as endSession, type Account,
} from '../lib/auth';
import { supabaseRemote, wasWiped } from '../lib/remote';
import { supabase } from '../lib/supabase';
import { syncOnce, type Household, type Invite, type Person, type Remote, type SentInvite, type SyncState } from '../lib/syncEngine';
import { clearWipedNotice, startOver, wipeThisDevice } from '../lib/wipe';
import { useStore } from './AppStore';

/**
 * Keeps this phone and the household's copy on the server in step, whenever
 * someone is signed in: on opening the app, on coming back to it, every minute
 * while it is on screen, and a few seconds after any change.
 *
 * Nothing waits on it. Every change is saved on the phone first, as it always
 * was; a sync that cannot happen just happens later.
 */

const STATE_KEY = 'matchday.sync.v1';
/** A copy of what "use the family's only" discarded, in case it was wanted after all. */
const BACKUP_KEY = 'matchday.backup.beforeJoin';
const EVERY_MS = 60_000;
const AFTER_CHANGE_MS = 4_000;

export type SyncStatus = 'off' | 'checking' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';

export interface JoinQuestion {
  householdName: string;
  localMatches: number;
}

export interface SyncValue {
  /** Whether this build has an account backend at all. */
  available: boolean;
  account: Account | null;
  /**
   * The first sync since this account opened on the phone has worked, so
   * whether it already has a player - and a family - is known. Stays true
   * through later syncs, so screens that wait on it don't flicker.
   */
  checked: boolean;
  status: SyncStatus;
  lastSynced: number | null;
  error: string;
  household: Household | null;
  joinQuestion: JoinQuestion | null;
  answerJoin(choice: 'merge' | 'replace'): void;
  syncNow(): void;
  /** Who is in the household, who has been invited to it, and invites addressed to me. */
  family(): Promise<{ people: Person[]; invites: SentInvite[]; mine: Invite[] }>;
  invite(email: string): Promise<void>;
  cancelInvite(inviteId: string): Promise<void>;
  /** Join a household I was invited to after already being in one. */
  joinInvite(inviteId: string): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Setup's "Delete everything", once it has been confirmed three times. The
   * account and what it is allowed to delete go from the server first; only
   * once the server has said yes is this phone cleared and the app started
   * over. With no signal it throws, and nothing anywhere has been touched.
   */
  deleteEverything(): Promise<void>;
}

function loadState(): SyncState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as SyncState) : null;
  } catch {
    return null;
  }
}

function saveState(state: SyncState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the next sync starts from the beginning, which is slower, not wrong.
  }
}

function isOffline(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (typeof navigator !== 'undefined' && navigator.onLine === false) || /failed to fetch|load failed|fetch failed|network/i.test(message);
}

const OFF: SyncValue = {
  available: false,
  account: null,
  checked: false,
  status: 'off',
  lastSynced: null,
  error: '',
  household: null,
  joinQuestion: null,
  answerJoin: () => {},
  syncNow: () => {},
  family: async () => ({ people: [], invites: [], mine: [] }),
  invite: async () => {},
  cancelInvite: async () => {},
  joinInvite: async () => {},
  signOut: async () => {},
  deleteEverything: async () => {
    await wipeThisDevice('here');
    startOver();
  },
};

const SyncContext = createContext<SyncValue>(OFF);

export function SyncProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const available = accountsAvailable();

  // Whoever signed in on this phone before, from storage, so the app opens on
  // the first frame - signal or not - rather than on a sign-in screen.
  const [account, setAccount] = useState<Account | null>(() => (available ? rememberedAccount() : null));
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus>(available ? 'checking' : 'off');
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [household, setHousehold] = useState<Household | null>(null);
  const [joinQuestion, setJoinQuestion] = useState<JoinQuestion | null>(null);

  // A sync outlives the render that started it, so it reads and writes
  // through these rather than through whatever it closed over.
  const storeRef = useRef(store);
  storeRef.current = store;
  const accountRef = useRef<Account | null>(account);
  const remoteRef = useRef<Remote | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  // Set while everything is being deleted: no sync may start, or one could
  // put back on the server what is being taken off it.
  const paused = useRef(false);
  const joinAnswer = useRef<((choice: 'merge' | 'replace') => void) | null>(null);

  const run = useCallback(async function run(): Promise<void> {
    const remote = remoteRef.current;
    const signedIn = accountRef.current;
    if (!remote || !signedIn || paused.current) return;
    // One at a time; anything asked for meanwhile happens straight after.
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setStatus('syncing');
    try {
      const result = await syncOnce({
        remote,
        userId: signedIn.id,
        getLocal: () => storeRef.current.data,
        applyRemote: (changes) => storeRef.current.applyRemote(changes),
        replaceLocal: (data) => storeRef.current.replaceData(data),
        loadState,
        saveState,
        askJoin: (question) =>
          new Promise((resolve) => {
            joinAnswer.current = resolve;
            setJoinQuestion(question);
          }),
        backup: (data) => {
          try {
            localStorage.setItem(BACKUP_KEY, JSON.stringify(data));
          } catch {
            // No room for the copy. The choice was still the person's own.
          }
        },
        // Signed in on the setup screens: join a family, never start one there.
        mayCreate: () => Boolean(storeRef.current.data.profile.onboardedAt),
      });
      if (accountRef.current?.id !== signedIn.id) return;
      if (result.wiped) {
        // Deleted on another phone: this phone's copy goes too.
        paused.current = true;
        await wipeThisDevice('elsewhere');
        startOver();
        return;
      }
      setHousehold(result.household);
      setCheckedFor(signedIn.id);
      setLastSynced(Date.now());
      setError('');
      setStatus('synced');
    } catch (e) {
      if (accountRef.current?.id !== signedIn.id) return;
      const offline = isOffline(e);
      setStatus(offline ? 'offline' : 'error');
      setError(offline ? '' : e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        void run();
      }
    }
  }, []);

  // Who is signed in - on opening, and whenever that changes.
  useEffect(() => {
    if (!available) return;
    let live = true;

    const settle = async (found: Account | null) => {
      if (!live) return;
      accountRef.current = found;
      // The same person as the copy from storage keeps the same object, so
      // nothing that depends on it starts over.
      setAccount((before) => (before && found && before.id === found.id && before.email === found.email ? before : found));
      if (!found) {
        remoteRef.current = null;
        setHousehold(null);
        setCheckedFor(null);
        setStatus('signed-out');
        void clearIfDeletedElsewhere();
        return;
      }
      clearWipedNotice();
      try {
        const client = await supabase();
        if (!live || accountRef.current?.id !== found.id) return;
        remoteRef.current = supabaseRemote(client, found.id);
        void run();
      } catch {
        // The sign-in library could not load - no signal on a first open.
        // Coming back online or to the app will try again.
        setStatus('offline');
      }
    };

    // Signed out without asking - which is what happens to every other phone
    // of an account deleted with "Delete everything", once its sign-in runs
    // out. Those phones are cleared too, rather than left holding the lot.
    const clearIfDeletedElsewhere = async () => {
      const remembered = loadState();
      if (!remembered || paused.current) return;
      try {
        const wiped = await wasWiped(await supabase(), remembered.householdId, remembered.userId);
        if (!wiped || !live || paused.current) return;
        paused.current = true;
        await wipeThisDevice('elsewhere');
        startOver();
      } catch {
        // No signal: asked again next time the app opens.
      }
    };

    void currentAccount().then(settle);
    const stop = onAccountChange((found) => {
      // Token refreshes arrive as account changes too; only a different person matters.
      if ((found?.id ?? null) !== (accountRef.current?.id ?? null)) void settle(found);
    });
    return () => {
      live = false;
      stop();
    };
  }, [available, run]);

  // A few seconds after any change on this phone.
  const data = store.data;
  useEffect(() => {
    if (!account) return;
    const timer = setTimeout(() => void run(), AFTER_CHANGE_MS);
    return () => clearTimeout(timer);
  }, [data, account, run]);

  // Every minute while on screen, on coming back to the app, and when signal returns.
  useEffect(() => {
    if (!account) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void run();
    };
    const timer = setInterval(tick, EVERY_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
    };
  }, [account, run]);

  const answerJoin = useCallback((choice: 'merge' | 'replace') => {
    setJoinQuestion(null);
    joinAnswer.current?.(choice);
    joinAnswer.current = null;
  }, []);

  const family = useCallback(async () => {
    const remote = remoteRef.current;
    if (!remote || !household) return { people: [], invites: [], mine: [] };
    const [people, invites, mine] = await Promise.all([
      remote.people(household.id),
      remote.sentInvites(household.id),
      remote.invitesForMe(),
    ]);
    return { people, invites, mine: mine.filter((i) => i.householdId !== household.id) };
  }, [household]);

  const joinInvite = useCallback(
    async (inviteId: string) => {
      if (!remoteRef.current) return;
      await remoteRef.current.acceptInvite(inviteId);
      // The next sync moves this phone to the newly joined household, and
      // asks about this phone's records first if there are any.
      await run();
    },
    [run],
  );

  const invite = useCallback(
    async (email: string) => {
      if (!remoteRef.current || !household) throw new Error('Not in a household yet - wait for the first sync.');
      await remoteRef.current.invite(household.id, email);
    },
    [household],
  );

  const cancelInvite = useCallback(async (inviteId: string) => {
    await remoteRef.current?.cancelInvite(inviteId);
  }, []);

  const signOut = useCallback(async () => {
    await endSession();
  }, []);

  const deleteEverything = useCallback(async () => {
    paused.current = true;
    try {
      // A sync already on its way finishes first. One stuck waiting on a
      // question is not waited for: once the account is gone it can neither
      // send anything nor start a family again.
      for (let i = 0; i < 50 && running.current; i++) await new Promise((r) => setTimeout(r, 100));
      const signedIn = accountRef.current;
      if (available && signedIn) {
        const remote = remoteRef.current ?? supabaseRemote(await supabase(), signedIn.id);
        await remote.deleteAccount();
      }
    } catch (e) {
      paused.current = false;
      throw new Error(
        isOffline(e)
          ? 'No signal. Deleting needs one, so the copy in your account goes too - nothing has been deleted yet.'
          : e instanceof Error
            ? e.message
            : String(e),
      );
    }
    await wipeThisDevice('here');
    startOver();
  }, [available]);

  const value = useMemo<SyncValue>(
    () => ({
      available,
      account,
      checked: account !== null && checkedFor === account.id,
      status,
      lastSynced,
      error,
      household,
      joinQuestion,
      answerJoin,
      syncNow: () => void run(),
      family,
      invite,
      cancelInvite,
      joinInvite,
      signOut,
      deleteEverything,
    }),
    [available, account, checkedFor, status, lastSynced, error, household, joinQuestion, answerJoin, run, family, invite, cancelInvite, joinInvite, signOut, deleteEverything],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncValue {
  return useContext(SyncContext);
}
