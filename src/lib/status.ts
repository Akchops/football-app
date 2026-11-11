/**
 * Whether Matchday's servers are answering, and the message to show if not.
 *
 * The app never waits on any of this - everything is saved on the phone first
 * and syncs later - so this is only about telling people what's going on, so
 * they aren't left refreshing, reinstalling or emailing to ask.
 *
 * The message comes from the Matchday worker on Cloudflare (worker/src/status.ts),
 * deliberately not from Supabase: it has to be readable when Supabase isn't.
 */

const SERVER = (import.meta.env.VITE_AI_PROXY_URL ?? '').replace(/\/+$/, '');

/** How often to look again while something is down. */
export const RECHECK_MS = 30_000;

export interface Notice {
  title: string;
  message: string;
  /** ISO 8601; also tells one message from the next, for "Got it". */
  postedAt: string;
}

/**
 * - ok: nothing wrong that anyone needs telling about.
 * - offline: this phone has no connection. Normal at a pitch, so no fuss.
 * - outage: the phone is online, but the account server isn't answering.
 */
export type Health = 'ok' | 'offline' | 'outage';

export interface Readings {
  /** The outage drill is on (src/lib/drill.ts). */
  drill: boolean;
  /** What the phone says about its own connection. */
  online: boolean;
  /** Whether the account server answered the last check; null before any check, or with none in this build. */
  accounts: boolean | null;
  /** Whether the Matchday worker answered at the same moment; null with none in this build. */
  worker: boolean | null;
}

/**
 * What the readings add up to. The worker is the control: it's on Cloudflare,
 * nowhere near Supabase, so it answering while the account server doesn't
 * points at the server - and neither answering points at this phone's own
 * connection (a captive wifi page, one bar of signal), which is not an outage
 * and not worth a banner.
 */
export function assess(r: Readings): Health {
  if (r.drill) return 'outage';
  if (r.accounts !== false) return 'ok';
  if (!r.online) return 'offline';
  if (r.worker === false) return 'offline';
  return 'outage';
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** The worker's reply made safe to show, or null for no message. */
export function cleanNotice(raw: unknown): Notice | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const message = text(r.message, 600);
  const title = text(r.title, 80);
  if (!message && !title) return null;
  const postedAt = text(r.postedAt, 40);
  return { title, message, postedAt: Number.isNaN(Date.parse(postedAt)) ? '' : postedAt };
}

/** Whether this build has anywhere to read a message from. */
export function noticeAvailable(): boolean {
  return SERVER.length > 0;
}

/**
 * The current message. `reached` says whether the worker answered at all,
 * which `assess` uses to tell a server outage from this phone being offline.
 */
export async function fetchNotice(timeoutMs = 8_000): Promise<{ reached: boolean | null; notice: Notice | null }> {
  if (!SERVER) return { reached: null, notice: null };
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), timeoutMs);
  try {
    const response = await fetch(`${SERVER}/status`, { cache: 'no-store', signal: stop.signal });
    if (!response.ok) return { reached: response.status < 500, notice: null };
    const body = (await response.json().catch(() => ({}))) as { notice?: unknown };
    return { reached: true, notice: cleanNotice(body.notice) };
  } catch {
    return { reached: false, notice: null };
  } finally {
    clearTimeout(timer);
  }
}

/** "0:23" - how long until the next check. */
export function countdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
