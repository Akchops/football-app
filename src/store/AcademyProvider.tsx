import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  academyApi, describeAcademyError, type AcademyApi, type JoinRequest, type Membership, type PlayerInvite, type StaffAcademy,
  type StaffInvite,
} from '../lib/academy';
import { ACADEMY } from '../lib/features';
import { supabase } from '../lib/supabase';
import { useSync } from './SyncProvider';

/**
 * Who the signed-in person is to academies: their username, the academies
 * they work at and staff invites waiting for them; for a family, the
 * academies their player is in, invites to join one and requests sent - plus
 * which half of the app this phone shows, the player's or the academy's.
 *
 * Unlike a player's matches, an academy lives on the server: everyone on its
 * staff works on the one copy. This keeps the last answer on the phone, so the
 * academy area still opens with no signal and says it is out of date rather
 * than showing nothing.
 */

/** Which half of the app this phone shows. Null until someone has said, on a new phone. */
export type AppMode = 'player' | 'academy';

export type AcademyStatus = 'off' | 'idle' | 'loading' | 'ready' | 'offline' | 'error';

interface Snapshot {
  userId: string;
  username: string | null;
  academies: StaffAcademy[];
  invites: StaffInvite[];
  playerInvites: PlayerInvite[];
  joinRequests: JoinRequest[];
  memberships: Membership[];
}

export interface AcademyValue {
  /** Academies exist in this build: the release is switched on and there is an account backend. */
  enabled: boolean;
  mode: AppMode | null;
  setMode(mode: AppMode | null): void;
  /** Ready once someone is signed in. */
  api: AcademyApi | null;
  status: AcademyStatus;
  error: string;
  /** Whether the fields below are known for whoever is signed in - from the server, or this phone's copy. */
  loaded: boolean;
  username: string | null;
  /** Academies this person works at. */
  academies: StaffAcademy[];
  /** Invites to work at one. */
  invites: StaffInvite[];
  /** Academies asking to add the family's player. */
  playerInvites: PlayerInvite[];
  /** Requests the family has sent with a join code. */
  joinRequests: JoinRequest[];
  /** Academies the family's player is linked to. */
  memberships: Membership[];
  /** The academy on screen: the one last chosen, or the first. */
  current: StaffAcademy | null;
  choose(academyId: string): void;
  refresh(): Promise<void>;
  /** After a username is claimed, so it shows at once. */
  setUsername(name: string): void;
  /** Whether the academy area is showing the form to set up another academy. */
  creating: boolean;
  setCreating(on: boolean): void;
}

const MODE_KEY = 'matchday.mode.v1';
const CACHE_KEY = 'matchday.academy.v1';

function readMode(): AppMode | null {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return value === 'player' || value === 'academy' ? value : null;
  } catch {
    return null;
  }
}

function writeMode(mode: AppMode | null): void {
  try {
    if (mode) localStorage.setItem(MODE_KEY, mode);
    else localStorage.removeItem(MODE_KEY);
  } catch {
    // Not remembered: the next open asks again, which is a nuisance, not a fault.
  }
}

function readCache(userId: string): (Snapshot & { currentId: string | null }) | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Snapshot> & { currentId?: string | null };
    if (parsed?.userId !== userId || !Array.isArray(parsed.academies)) return null;
    const list = <T,>(value: T[] | undefined): T[] => (Array.isArray(value) ? value : []);
    return {
      userId,
      username: typeof parsed.username === 'string' ? parsed.username : null,
      academies: parsed.academies,
      invites: list(parsed.invites),
      playerInvites: list(parsed.playerInvites),
      joinRequests: list(parsed.joinRequests),
      memberships: list(parsed.memberships),
      currentId: parsed.currentId ?? null,
    };
  } catch {
    return null;
  }
}

function writeCache(snapshot: Snapshot, currentId: string | null): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...snapshot, currentId }));
  } catch {
    // Logos are the big part. Without them it nearly always fits; if not, the
    // academy area just needs signal to open.
    try {
      const academies = snapshot.academies.map((a) => ({ ...a, logo: '' }));
      const memberships = snapshot.memberships.map((m) => ({ ...m, logo: '' }));
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...snapshot, academies, memberships, currentId }));
    } catch {
      // As above.
    }
  }
}

function forget(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Nothing to do.
  }
}

function isOffline(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (typeof navigator !== 'undefined' && navigator.onLine === false) || /failed to fetch|load failed|fetch failed|network/i.test(message);
}

const OFF: AcademyValue = {
  enabled: false,
  mode: null,
  setMode: () => {},
  api: null,
  status: 'off',
  error: '',
  loaded: false,
  username: null,
  academies: [],
  invites: [],
  playerInvites: [],
  joinRequests: [],
  memberships: [],
  current: null,
  choose: () => {},
  refresh: async () => {},
  setUsername: () => {},
  creating: false,
  setCreating: () => {},
};

const AcademyContext = createContext<AcademyValue>(OFF);

const NONE: StaffAcademy[] = [];
const NO_INVITES: StaffInvite[] = [];
const NO_PLAYER_INVITES: PlayerInvite[] = [];
const NO_REQUESTS: JoinRequest[] = [];
const NO_MEMBERSHIPS: Membership[] = [];

export function AcademyProvider({ children }: { children: ReactNode }) {
  const sync = useSync();
  if (ACADEMY && sync.available) return <AcademyOn>{children}</AcademyOn>;
  return <AcademyContext.Provider value={OFF}>{children}</AcademyContext.Provider>;
}

function AcademyOn({ children }: { children: ReactNode }) {
  const sync = useSync();
  const accountId = sync.account?.id ?? null;

  const [mode, setModeState] = useState<AppMode | null>(readMode);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [status, setStatus] = useState<AcademyStatus>('idle');
  const [error, setError] = useState('');
  const [api, setApi] = useState<AcademyApi | null>(null);
  const [creating, setCreating] = useState(false);

  // A refresh outlives the render that started it.
  const apiRef = useRef<AcademyApi | null>(null);
  const accountRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const client = apiRef.current;
    const who = accountRef.current;
    if (!client || !who) return;
    setStatus('loading');
    try {
      const [username, academies, invites, playerInvites, joinRequests, memberships] = await Promise.all([
        client.username(),
        client.staffAcademies(),
        client.staffInvitesForMe(),
        client.playerInvitesForMe(),
        client.joinRequests(),
        client.memberships(),
      ]);
      if (accountRef.current !== who) return;
      setSnapshot({ userId: who, username, academies, invites, playerInvites, joinRequests, memberships });
      setError('');
      setStatus('ready');
    } catch (e) {
      if (accountRef.current !== who) return;
      const offline = isOffline(e);
      setStatus(offline ? 'offline' : 'error');
      setError(offline ? '' : describeAcademyError(e));
    }
  }, []);

  // Whoever is signed in: this phone's copy at once, then the server's.
  useEffect(() => {
    accountRef.current = accountId;
    apiRef.current = null;
    setApi(null);
    setError('');
    if (!accountId) {
      setSnapshot(null);
      setCurrentId(null);
      setStatus('idle');
      return;
    }
    const cached = readCache(accountId);
    if (cached) {
      const { currentId: cachedCurrent, ...rest } = cached;
      setSnapshot(rest);
      setCurrentId(cachedCurrent);
    } else {
      setSnapshot(null);
      setCurrentId(null);
    }

    let live = true;
    supabase()
      .then((client) => {
        if (!live || accountRef.current !== accountId) return;
        const made = academyApi(client, accountId);
        apiRef.current = made;
        setApi(made);
        void refresh();
      })
      .catch(() => {
        // The sign-in library could not load: no signal on a first open.
        if (live) setStatus('offline');
      });
    return () => {
      live = false;
    };
  }, [accountId, refresh]);

  // Signing out takes the academy off this phone too.
  useEffect(() => {
    if (sync.status === 'signed-out') forget();
  }, [sync.status]);

  useEffect(() => {
    if (snapshot) writeCache(snapshot, currentId);
  }, [snapshot, currentId]);

  // Back to the app, or back in signal: an invite may have arrived meanwhile.
  useEffect(() => {
    if (!accountId) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => {
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
    };
  }, [accountId, refresh]);

  const setMode = useCallback((next: AppMode | null) => {
    writeMode(next);
    setModeState(next);
  }, []);

  const setUsername = useCallback((name: string) => {
    setSnapshot((s) => (s ? { ...s, username: name } : s));
  }, []);

  const loaded = snapshot !== null && snapshot.userId === accountId;
  const academies = loaded ? snapshot.academies : NONE;
  const invites = loaded ? snapshot.invites : NO_INVITES;
  const playerInvites = loaded ? snapshot.playerInvites : NO_PLAYER_INVITES;
  const joinRequests = loaded ? snapshot.joinRequests : NO_REQUESTS;
  const memberships = loaded ? snapshot.memberships : NO_MEMBERSHIPS;
  const username = loaded ? snapshot.username : null;
  const current = academies.find((a) => a.id === currentId) ?? academies[0] ?? null;

  const value = useMemo<AcademyValue>(
    () => ({
      enabled: true,
      mode,
      setMode,
      api,
      status,
      error,
      loaded,
      username,
      academies,
      invites,
      playerInvites,
      joinRequests,
      memberships,
      current,
      choose: setCurrentId,
      refresh,
      setUsername,
      creating,
      setCreating,
    }),
    [
      mode, setMode, api, status, error, loaded, username, academies, invites, playerInvites, joinRequests, memberships, current,
      refresh, setUsername, creating,
    ],
  );

  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>;
}

export function useAcademy(): AcademyValue {
  return useContext(AcademyContext);
}
