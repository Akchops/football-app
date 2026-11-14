import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoachAllowance, allowanceKey } from './allowance';
import worker, { type Env } from './index';

const ORIGIN = 'https://akchops.github.io';

/**
 * A namespace of CoachAllowances in memory. Like the real thing, each object
 * takes one request at a time: Cloudflare holds the next one back while the
 * current one is reading or writing its storage.
 */
function fakeAllowances() {
  const objects = new Map<string, { fetch: (url: string, init: RequestInit) => Promise<Response> }>();
  const namespace = {
    idFromName: (name: string) => name,
    get: (id: string) => {
      let stub = objects.get(id);
      if (!stub) {
        const data = new Map<string, unknown>();
        const storage = {
          get: async (key: string) => data.get(key),
          put: async (key: string, value: unknown) => void data.set(key, value),
          setAlarm: async () => undefined,
          deleteAll: async () => data.clear(),
        };
        const object = new CoachAllowance({ storage } as unknown as DurableObjectState);
        let queue: Promise<unknown> = Promise.resolve();
        stub = {
          fetch: (url, init) => {
            const turn = queue.then(() => object.fetch(new Request(url, init)));
            queue = turn.catch(() => undefined);
            return turn;
          },
        };
        objects.set(id, stub);
      }
      return stub;
    },
  };
  return { namespace: namespace as unknown as DurableObjectNamespace, objects };
}

/** KV that, like the real one, can show a read an old value - here, always. */
const staleKv = { get: async () => null, put: async () => undefined } as unknown as KVNamespace;

function makeEnv(allowances?: DurableObjectNamespace): Env {
  return { GEMINI_API_KEY: 'test-key', ALLOWED_ORIGINS: ORIGIN, DAILY_LIMIT: '40', RATE_LIMIT: staleKv, COACH_ALLOWANCE: allowances };
}

function drills(ip: string) {
  return new Request('https://matchday-ai.example.workers.dev/drills', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': ip },
    body: JSON.stringify({ player: 'GK', ask: 'warm-up' }),
  });
}

function googleAnswers() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      if (String(input).includes('/models?')) {
        return new Response(JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }));
      }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'STOP' }] }));
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('the Coach allowance', () => {
  it('holds at the limit when a burst of requests arrives at once', async () => {
    googleAnswers();
    const env = makeEnv(fakeAllowances().namespace);
    const replies = await Promise.all(Array.from({ length: 60 }, () => worker.fetch(drills('203.0.113.7'), env)));
    const statuses = replies.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(40);
    expect(statuses.filter((s) => s === 429)).toHaveLength(20);
  });

  it('counts each person separately', async () => {
    googleAnswers();
    const env = makeEnv(fakeAllowances().namespace);
    for (let i = 0; i < 40; i++) await worker.fetch(drills('203.0.113.7'), env);
    expect((await worker.fetch(drills('203.0.113.7'), env)).status).toBe(429);
    expect((await worker.fetch(drills('198.51.100.2'), env)).status).toBe(200);
  });

  it('counts a whole IPv6 /64 as one person', async () => {
    googleAnswers();
    const env = makeEnv(fakeAllowances().namespace);
    for (let i = 0; i < 40; i++) await worker.fetch(drills(`2001:db8:1:2::${(i + 1).toString(16)}`), env);
    expect((await worker.fetch(drills('2001:db8:1:2:ffff:ffff:ffff:ffff'), env)).status).toBe(429);
    expect((await worker.fetch(drills('2001:db8:1:3::1'), env)).status).toBe(200);
  });
});

describe('allowanceKey', () => {
  it('keeps IPv4 addresses whole', () => {
    expect(allowanceKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('reduces IPv6 to its /64, however it is written', () => {
    expect(allowanceKey('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64');
    expect(allowanceKey('2001:0DB8:0001:0002:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(allowanceKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(allowanceKey('::1')).toBe('0:0:0:0::/64');
  });

  it('has a key for a request with no address', () => {
    expect(allowanceKey(null)).toBe('unknown');
  });
});
