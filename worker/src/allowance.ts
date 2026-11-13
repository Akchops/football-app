/**
 * The hard cap on what the shared key can spend.
 *
 * The per-person limit in index.ts counts requests by IP address, which
 * someone with many addresses gets round - and the origin check only stops
 * browsers, since anything else can send whatever Origin it likes. So every
 * call that Google bills - each try at each model - also takes one from a
 * single allowance for the whole day, kept in one Durable Object. A Durable
 * Object handles one request at a time, so the count is exact: when it is
 * gone, nothing more reaches Google until tomorrow (UTC), whoever is asking.
 *
 * With no allowance bound at all, nothing is spent: fail closed, never open.
 */

export const DEFAULT_GLOBAL_LIMIT = 500;

/** The part of Durable Object storage this needs - small enough to fake in a test. */
export interface CountStore {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  list<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
  delete(key: string): Promise<boolean>;
}

export interface Taken {
  ok: boolean;
  used: number;
  limit: number;
}

/** Takes one from today's allowance if there is one left. Earlier days are cleared as it goes. */
export async function takeOne(storage: CountStore, day: string, limit: number): Promise<Taken> {
  const key = `day:${day}`;
  const used = (await storage.get<number>(key)) ?? 0;
  if (used >= limit) return { ok: false, used, limit };
  await storage.put(key, used + 1);
  if (used === 0) {
    for (const old of (await storage.list<number>({ prefix: 'day:' })).keys()) {
      if (old !== key) await storage.delete(old);
    }
  }
  return { ok: true, used: used + 1, limit };
}

export class Allowance {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const { day, limit } = (await request.json()) as { day: string; limit: number };
    return Response.json(await takeOne(this.state.storage as unknown as CountStore, day, limit));
  }
}

export interface AllowanceEnv {
  /** The Allowance namespace. Without it, the shared key spends nothing. */
  ALLOWANCE?: DurableObjectNamespace;
  /** Calls to Google allowed per UTC day, across everyone using the shared key. */
  GLOBAL_DAILY_LIMIT?: string;
}

export function globalLimit(env: AllowanceEnv): number {
  const n = Math.floor(Number(env.GLOBAL_DAILY_LIMIT));
  return Number.isFinite(n) && n >= 0 && env.GLOBAL_DAILY_LIMIT !== undefined && env.GLOBAL_DAILY_LIMIT !== ''
    ? n
    : DEFAULT_GLOBAL_LIMIT;
}

/** One billable call's worth, or false when today's is used up (or there is no allowance to take from). */
export async function spendOne(env: AllowanceEnv, now = new Date()): Promise<boolean> {
  if (!env.ALLOWANCE) return false;
  const stub = env.ALLOWANCE.get(env.ALLOWANCE.idFromName('google'));
  const response = await stub.fetch('https://allowance.internal/', {
    method: 'POST',
    body: JSON.stringify({ day: now.toISOString().slice(0, 10), limit: globalLimit(env) }),
  });
  return ((await response.json()) as Taken).ok;
}

/**
 * Who is asking, as far as the per-person limit needs to know: the IP address,
 * hashed with the day and the worker's own secret, so the store never holds an
 * address, and someone's key today cannot be matched to theirs yesterday.
 */
export async function requesterKey(ip: string, day: string, secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${day}|${ip}|${secret}`));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
