/**
 * The Coach's free daily allowance, counted so it can't be talked past.
 *
 * It used to be a KV counter: read the count, then write count + 1. Two
 * requests at once both read the same number, and KV can take up to a minute
 * to show a write to the next read, so a burst of requests sent together each
 * saw the old count and all got through - a script could spend the whole
 * Gemini quota in seconds. A Durable Object is one place, with one queue: each
 * request's read and write finish before the next one's start, so the count is
 * exact.
 *
 * One object per person per UTC day, which deletes its own count two days on.
 */

/** Long enough to outlast the day in every timezone, then the count goes. */
const KEEP_MS = 48 * 60 * 60 * 1000;

export interface Allowance {
  ok: boolean;
  used: number;
  limit: number;
}

export class CoachAllowance {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const { limit } = (await request.json()) as { limit: number };
    const storage = this.state.storage;
    const used = (await storage.get<number>('used')) ?? 0;
    if (used >= limit) return Response.json({ ok: false, used, limit } satisfies Allowance);
    await storage.put('used', used + 1);
    if (used === 0) await storage.setAlarm(Date.now() + KEEP_MS);
    return Response.json({ ok: true, used: used + 1, limit } satisfies Allowance);
  }

  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }
}

/**
 * Who a request is from, for counting. An IPv4 address as it is. An IPv6
 * address by its first 64 bits: that is what one home or phone is given, and
 * it can pick any address inside it, so counting whole addresses would hand
 * out an allowance per address - billions of them.
 */
export function allowanceKey(ip: string | null): string {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, '') || '0')
    .join(':')}::/64`;
}
