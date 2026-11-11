import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { drillOn, onDrillChange, setDrill as storeDrill } from '../lib/drill';
import { RECHECK_MS, assess, fetchNotice, noticeAvailable, type Health, type Notice } from '../lib/status';
import { pingAccountServer } from '../lib/supabase';
import { useAcademy } from './AcademyProvider';
import { useSync } from './SyncProvider';

/**
 * Whether anything is down, so the app can say so - a banner at the top, and
 * behind it what still works, that nothing is lost, and when it looks again.
 *
 * Nothing here is polled while all is well. Syncing already talks to the
 * account server on opening and every minute; only when that fails does this
 * look closer - is it the server, or just no signal? - and then every 30
 * seconds until the server answers, when everything catches up by itself.
 * The message from Matchday is read on opening and now and then after.
 */

/** A message posted while the app is open turns up within this long. */
const NOTICE_EVERY_MS = 5 * 60_000;
/** Failures arrive in bursts (sync and the academy together); one check covers them all. */
const MIN_GAP_MS = 10_000;
const SEEN_KEY = 'matchday.noticeSeen';

export interface StatusValue {
  health: Health;
  notice: Notice | null;
  /** The message has been read and put away with "Got it" - until a new one is posted. */
  noticeSeen: boolean;
  drill: boolean;
  checking: boolean;
  lastChecked: number | null;
  /** While something is down: when the next check is due. */
  nextCheckAt: number | null;
  checkNow(): void;
  setDrill(on: boolean): void;
  dismissNotice(): void;
}

const NONE: StatusValue = {
  health: 'ok',
  notice: null,
  noticeSeen: false,
  drill: false,
  checking: false,
  lastChecked: null,
  nextCheckAt: null,
  checkNow: () => {},
  setDrill: () => {},
  dismissNotice: () => {},
};

const StatusContext = createContext<StatusValue>(NONE);

function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

export function StatusProvider({ children }: { children: ReactNode }) {
  const sync = useSync();
  const academy = useAcademy();

  const [drill, setDrillState] = useState(drillOn);
  const [online, setOnline] = useState(isOnline);
  const [accounts, setAccounts] = useState<boolean | null>(null);
  const [worker, setWorker] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [seen, setSeen] = useState(readSeen);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<number | null>(null);

  const health = assess({ drill, online, accounts, worker });

  // A check outlives the render that started it.
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const academyRef = useRef(academy);
  academyRef.current = academy;
  const healthRef = useRef(health);
  healthRef.current = health;
  const busy = useRef(false);
  const lastRun = useRef(0);
  const lastNotice = useRef(0);

  const readNotice = useCallback(async () => {
    if (!noticeAvailable()) return;
    lastNotice.current = Date.now();
    const found = await fetchNotice();
    if (found.reached) setNotice(found.notice);
    setWorker(found.reached);
  }, []);

  /** Is the account server answering? Asked alongside the worker, so the answers can be compared. */
  const check = useCallback(async (force = false) => {
    if (busy.current) return;
    if (!force && Date.now() - lastRun.current < MIN_GAP_MS) return;
    busy.current = true;
    lastRun.current = Date.now();
    lastNotice.current = Date.now();
    setChecking(true);
    const wasDown = healthRef.current === 'outage';
    try {
      const [up, found] = await Promise.all([
        syncRef.current.available ? pingAccountServer() : Promise.resolve(null),
        fetchNotice(),
      ]);
      if (found.reached) setNotice(found.notice);
      setWorker(found.reached);
      setAccounts(up);
      setOnline(isOnline());
      // Back: catch up now rather than at the next minute's sync.
      if (up && wasDown) {
        syncRef.current.syncNow();
        void academyRef.current.refresh();
      }
    } finally {
      busy.current = false;
      setChecking(false);
      setLastChecked(Date.now());
    }
  }, []);

  // The message, on opening.
  useEffect(() => {
    void readNotice();
  }, [readNotice]);

  // A sync or academy load that fails is the cue to look closer; one that works settles it.
  const failed =
    sync.status === 'error' || sync.status === 'offline' || academy.status === 'error' || academy.status === 'offline';
  const worked = sync.status === 'synced' || academy.status === 'ready';
  useEffect(() => {
    if (failed && isOnline()) void check();
  }, [failed, sync.status, academy.status, check]);
  useEffect(() => {
    if (worked && !drillOn()) setAccounts(true);
  }, [worked]);

  // While something is down: again every 30 seconds, while the app is on screen.
  const nextCheckAt = health === 'outage' && lastChecked !== null ? lastChecked + RECHECK_MS : null;
  useEffect(() => {
    if (nextCheckAt === null) return;
    const timer = setTimeout(() => {
      if (document.visibilityState === 'visible') void check(true);
    }, Math.max(0, nextCheckAt - Date.now()));
    return () => clearTimeout(timer);
  }, [nextCheckAt, check]);
  // An outage spotted some other way than a check (the drill) still gets its first one.
  useEffect(() => {
    if (health === 'outage' && lastChecked === null) void check(true);
  }, [health, lastChecked, check]);

  // Over - often noticed by a sync working rather than by a check, so the
  // message about it may be stale. Matchday has usually taken it down by now.
  const wasOutage = useRef(false);
  useEffect(() => {
    if (wasOutage.current && health !== 'outage') void readNotice();
    wasOutage.current = health === 'outage';
  }, [health, readNotice]);

  // Coming back to the app, and the phone's own connection coming and going.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (healthRef.current === 'outage') void check(true);
      else if (Date.now() - lastNotice.current > NOTICE_EVERY_MS) void readNotice();
    };
    const onOnline = () => {
      setOnline(true);
      if (healthRef.current !== 'ok') void check(true);
    };
    const onOffline = () => setOnline(false);
    const every = setInterval(() => {
      if (document.visibilityState === 'visible' && healthRef.current !== 'outage') void readNotice();
    }, NOTICE_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      clearInterval(every);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [check, readNotice]);

  // The drill, switched here or in another tab.
  useEffect(
    () =>
      onDrillChange(() => {
        const on = drillOn();
        setDrillState(on);
        // What the drill's own checks found says nothing about the real server.
        if (!on) setAccounts(null);
        // Either way, sync straight away: into the drill's failure, or out of it to catch up.
        syncRef.current.syncNow();
        if (!on) void check(true);
      }),
    [check],
  );

  const setDrill = useCallback((on: boolean) => storeDrill(on), []);

  const dismissNotice = useCallback(() => {
    if (!notice) return;
    setSeen(notice.postedAt);
    try {
      localStorage.setItem(SEEN_KEY, notice.postedAt);
    } catch {
      // It just shows again next time.
    }
  }, [notice]);

  const value = useMemo<StatusValue>(
    () => ({
      health,
      notice,
      noticeSeen: notice !== null && notice.postedAt !== '' && notice.postedAt === seen,
      drill,
      checking,
      lastChecked,
      nextCheckAt,
      checkNow: () => void check(true),
      setDrill,
      dismissNotice,
    }),
    [health, notice, seen, drill, checking, lastChecked, nextCheckAt, check, setDrill, dismissNotice],
  );

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export function useStatus(): StatusValue {
  return useContext(StatusContext);
}
