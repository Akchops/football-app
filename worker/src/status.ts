/**
 * The message the app shows when something is wrong - "The account server is
 * down. Everything you log is safe; check back after 3pm."
 *
 * It lives here, in Cloudflare's KV store, and not with the accounts on
 * Supabase, because the whole point of it is to still be readable while
 * Supabase isn't. It is written by the "Status message" workflow
 * (worker/status-message.sh) and only ever read here.
 */

/** The KV key the message is kept under. Rate-limit counters in the same store start "rl:". */
export const NOTICE_KEY = 'status-notice';

export interface Notice {
  /** A few words for the banner. Empty lets the app use its own. */
  title: string;
  message: string;
  /** When it was posted, ISO 8601 - also how a phone tells one message from the next. */
  postedAt: string;
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** The stored message made safe to send, or null when there is none worth showing. */
export function cleanNotice(raw: unknown): Notice | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const message = text(r.message, 600);
  const title = text(r.title, 80);
  if (!message && !title) return null;
  const posted = text(r.postedAt, 40);
  return { title, message, postedAt: Number.isNaN(Date.parse(posted)) ? '' : posted };
}

/**
 * GET /status. Public and read-only: there is nothing in it that isn't meant
 * for everyone who opens the app. Cached for a little while at Cloudflare's
 * edge and in the browser, so a phone checking every 30 seconds during an
 * outage costs almost nothing.
 */
export async function handleStatus(kv: KVNamespace, headers: Record<string, string>): Promise<Response> {
  let notice: Notice | null = null;
  try {
    notice = cleanNotice(await kv.get(NOTICE_KEY, { cacheTtl: 30 }));
  } catch {
    // The store itself having a bad moment is no reason to fail the app's check.
  }
  return new Response(JSON.stringify({ notice }), {
    status: 200,
    headers: { ...headers, 'content-type': 'application/json', 'cache-control': 'public, max-age=15' },
  });
}
