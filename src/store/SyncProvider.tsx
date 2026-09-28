import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { accountsAvailable, currentAccount, onAccountChange, signOut as endSession, type Account } from '../lib/auth';
import { supabaseRemote } from '../lib/remote';
import { supabase } from '../lib/supabase';
import { syncOnce, type Household, type Invite, type Person, type Remote, type SentInvite, type SyncState } from '../lib/syncEngine';
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
};

const SyncContext = createContext<SyncValue>(OFF);

export function SyncProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const available = accountsAvailable();

  const [account, setAccount] = useState<Account | null>(null);
  const [status, setStatus] = useState<SyncStatus>(available ? 'checking' : 'off');
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [household, setHousehold] = useState<Household | null>(null);
  const [joinQuestion, setJoinQuestion] = useState<JoinQuestion | null>(null);

  // A sync outlives the render that started it, so it reads and writes
  // through these rather than through whatever it closed over.
  const storeRef = useRef(store);
  storeRef.current = store;
  const accountRef = useRef<Account | null>(null);
  const remoteRef = useRef<Remote | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const joinAnswer = useRef<((choice: 'merge' | 'replace') => void) | null>(null);

  const run = useCallback(async function run(): Promise<void> {
    const remote = remoteRef.current;
    const signedIn = accountRef.current;
    if (!remote || !signedIn) return;
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
      setHousehold(result.household);
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
      setAccount(found);
      if (!found) {
        remoteRef.current = null;
        setHousehold(null);
        setStatus('signed-out');
        return;
      }
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

  const value = useMemo<SyncValue>(
    () => ({
      available,
      account,
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
    }),
    [available, account, status, lastSynced, error, household, joinQuestion, answerJoin, run, family, invite, cancelInvite, joinInvite, signOut],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncValue {
  return useContext(SyncContext);
}
