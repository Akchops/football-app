import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoachAllowance } from './allowance';
import { CHECK_HEADER, checkToken } from './auth';
import worker, { type Env } from './index';

const ORIGIN = 'https://akchops.github.io';
const SUPABASE = 'https://abcd.supabase.co';

/** Valid tokens and whose account each is; anything else Supabase turns down. */
const ACCOUNTS: Record<string, string> = { 'token-ana': 'user-ana', 'token-ben': 'user-ben' };

/** Supabase's auth API and Google, both stood in for. Records what reached Google. */
function backends() {
  const gemini: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      if (url === `${SUPABASE}/auth/v1/user`) {
        const headers = new Headers(init?.headers);
        if (headers.get('apikey') !== 'anon-key') return new Response('{}', { status: 401 });
        const token = /^Bearer (.+)$/.exec(headers.get('authorization') ?? '')?.[1] ?? '';
        const id = ACCOUNTS[token];
        return id ? Response.json({ id }) : Response.json({ msg: 'invalid JWT' }, { status: 401 });
      }
      if (url.includes('/models?')) {
        return Response.json({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] });
      }
      gemini.push(url);
      return Response.json({ candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'STOP' }] });
    }),
  );
  return gemini;
}

function allowances() {
  const objects = new Map<string, { fetch: (url: string, init: RequestInit) => Promise<Response> }>();
  return {
    idFromName: (name: string) => name,
    get: (id: string) => {
      let stub = objects.get(id);
      if (!stub) {
        const data = new Map<string, unknown>();
        const storage = { get: async (k: string) => data.get(k), put: async (k: string, v: unknown) => void data.set(k, v), setAlarm: async () => {} };
        const object = new CoachAllowance({ storage } as unknown as DurableObjectState);
        stub = { fetch: (url, init) => object.fetch(new Request(url, init)) };
        objects.set(id, stub);
      }
      return stub;
    },
  } as unknown as DurableObjectNamespace;
}

function makeEnv(): Env {
  return {
    GEMINI_API_KEY: 'gemini-secret',
    ALLOWED_ORIGINS: ORIGIN,
    DAILY_LIMIT: '3',
    RATE_LIMIT: { get: async () => null, put: async () => undefined } as unknown as KVNamespace,
    COACH_ALLOWANCE: allowances(),
    SUPABASE_URL: SUPABASE,
    SUPABASE_ANON_KEY: 'anon-key',
  };
}

function drills(headers: Record<string, string> = {}, ip = '203.0.113.7') {
  return new Request('https://matchday-ai.example.workers.dev/drills', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': ip, ...headers },
    body: JSON.stringify({ player: 'GK', ask: 'warm-up' }),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('the Coach needs a Matchday sign-in', () => {
  it('turns away a request with no sign-in, before spending anything', async () => {
    const gemini = backends();
    const response = await worker.fetch(drills(), makeEnv());
    const body = (await response.json()) as { error: string; signIn: boolean };
    expect(response.status).toBe(401);
    expect(body.signIn).toBe(true);
    expect(body.error).toMatch(/sign in/i);
    expect(gemini).toHaveLength(0);
  });

  it('turns away a sign-in Supabase does not recognise', async () => {
    const gemini = backends();
    const response = await worker.fetch(drills({ authorization: 'Bearer forged.jwt.token' }), makeEnv());
    expect(response.status).toBe(401);
    expect(gemini).toHaveLength(0);
  });

  it('answers someone signed in', async () => {
    const gemini = backends();
    const response = await worker.fetch(drills({ authorization: 'Bearer token-ana' }), makeEnv());
    expect(response.status).toBe(200);
    expect(gemini).toHaveLength(1);
  });

  it('counts the allowance per account, wherever the requests come from', async () => {
    backends();
    const env = makeEnv();
    for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
      expect((await worker.fetch(drills({ authorization: 'Bearer token-ana' }, ip), env)).status).toBe(200);
    }
    // A fourth address doesn't buy Ana more...
    expect((await worker.fetch(drills({ authorization: 'Bearer token-ana' }, '203.0.113.4'), env)).status).toBe(429);
    // ...and Ana using hers up leaves Ben's alone, even on the same wifi.
    expect((await worker.fetch(drills({ authorization: 'Bearer token-ben' }, '203.0.113.1'), env)).status).toBe(200);
  });

  it('lets the check workflow in with a hash of the Gemini key, and nothing else', async () => {
    const gemini = backends();
    const ok = await worker.fetch(drills({ [CHECK_HEADER]: await checkToken('gemini-secret') }), makeEnv());
    expect(ok.status).toBe(200);
    const wrong = await worker.fetch(drills({ [CHECK_HEADER]: await checkToken('a-guess') }), makeEnv());
    expect(wrong.status).toBe(401);
    expect(gemini).toHaveLength(1);
  });

  it('lets the browser send the sign-in across origins', async () => {
    const preflight = await worker.fetch(new Request('https://matchday-ai.example.workers.dev/drills', { method: 'OPTIONS', headers: { origin: ORIGIN } }), makeEnv());
    expect(preflight.headers.get('access-control-allow-headers')).toMatch(/authorization/);
  });

  it('leaves match reminders alone', async () => {
    backends();
    const response = await worker.fetch(
      new Request('https://matchday-ai.example.workers.dev/push/key', { method: 'POST', headers: { origin: ORIGIN }, body: '{}' }),
      makeEnv(),
    );
    expect(response.status).not.toBe(401);
  });
});
