import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';
import { PushStore, STALE_MS, cleanReminders } from './push';
import { b64url, fromB64url } from './webpush';

const ORIGIN = 'https://akchops.github.io';
const NOW = Date.UTC(2026, 9, 6, 12, 0);
const MIN = 60_000;

/** A Durable Object's storage, in memory - including its one alarm. */
function fakeState() {
  const data = new Map<string, unknown>();
  let alarm: number | null = null;
  const storage = {
    get: async (key: string) => structuredClone(data.get(key)),
    put: async (key: string | Record<string, unknown>, value?: unknown) => {
      if (typeof key === 'string') data.set(key, structuredClone(value));
      else for (const [k, v] of Object.entries(key)) data.set(k, structuredClone(v));
    },
    deleteAll: async () => data.clear(),
    setAlarm: async (at: number) => void (alarm = at),
    deleteAlarm: async () => void (alarm = null),
  };
  return { state: { storage } as unknown as DurableObjectState, data, alarm: () => alarm };
}

/** A namespace of PushStores, made on first use like the real thing. */
function fakeNamespace() {
  const objects = new Map<string, { store: PushStore; memory: ReturnType<typeof fakeState> }>();
  const namespace = {
    idFromName: (name: string) => name,
    get: (id: string) => {
      let entry = objects.get(id);
      if (!entry) {
        const memory = fakeState();
        entry = { store: new PushStore(memory.state), memory };
        objects.set(id, entry);
      }
      const found = entry;
      return { fetch: (url: string, init: RequestInit) => found.store.fetch(new Request(url, init)) };
    },
  };
  const devices = () => [...objects.entries()].filter(([name]) => name.startsWith('device:')).map(([, e]) => e);
  return { namespace: namespace as unknown as DurableObjectNamespace, objects, devices };
}

function makeEnv(push?: DurableObjectNamespace): Env {
  return {
    GEMINI_API_KEY: 'test-key',
    ALLOWED_ORIGINS: ORIGIN,
    RATE_LIMIT: { get: async () => null, put: async () => undefined } as unknown as KVNamespace,
    PUSH: push,
  };
}

async function phone() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-device',
    keys: {
      p256dh: b64url((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer),
      auth: b64url(crypto.getRandomValues(new Uint8Array(16))),
    },
  };
}

function post(path: string, payload: unknown, origin = ORIGIN) {
  return worker.fetch(
    new Request(`https://matchday-ai.example.workers.dev${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(payload),
    }),
    env,
  );
}

const reminder = (at: number, title: string) => ({ at, title, body: 'Kick-off 10:30 AM', url: './', tag: title });

let push: ReturnType<typeof fakeNamespace>;
let env: Env;
let sent: { url: string; headers: Record<string, string>; bytes: number }[];
let status: number;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  push = fakeNamespace();
  env = makeEnv(push.namespace);
  sent = [];
  status = 201;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url: String(url), headers: init.headers as Record<string, string>, bytes: (init.body as Uint8Array).length });
      return new Response(null, { status });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('push routes', () => {
  it('hands out one signing key, made once and kept', async () => {
    const first = (await (await post('/push/key', {})).json()) as { publicKey: string };
    const second = (await (await post('/push/key', {})).json()) as { publicKey: string };
    expect(fromB64url(first.publicKey)).toHaveLength(65);
    expect(second.publicKey).toBe(first.publicKey);
  });

  it("keeps a phone's reminders and sets its alarm for the first one", async () => {
    const subscription = await phone();
    const response = await post('/push/schedule', {
      subscription,
      reminders: [
        reminder(NOW + 90 * MIN, 'later'),
        reminder(NOW + 30 * MIN, 'sooner'),
        reminder(NOW - 4 * 60 * MIN, 'long gone'),
        reminder(NOW + 100 * 24 * 60 * MIN, 'too far off'),
        { at: 'soon', title: 'broken' },
      ],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 2, next: NOW + 30 * MIN });
    const [device] = push.devices();
    expect(device.memory.alarm()).toBe(NOW + 30 * MIN);
    // The device's name is a hash - the push address itself isn't used to find it.
    expect([...push.objects.keys()].some((name) => name.includes('fcm.googleapis.com'))).toBe(false);
  });

  it('sends what is due when the alarm goes off, then waits for the next', async () => {
    const subscription = await phone();
    await post('/push/schedule', { subscription, reminders: [reminder(NOW + 30 * MIN, 'first'), reminder(NOW + 90 * MIN, 'second')] });
    const [device] = push.devices();

    vi.setSystemTime(NOW + 30 * MIN);
    await device.store.alarm();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(subscription.endpoint);
    expect(sent[0].headers['Content-Encoding']).toBe('aes128gcm');
    expect(sent[0].headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);
    expect(Number(sent[0].headers.TTL)).toBe(STALE_MS / 1000);
    expect(device.memory.alarm()).toBe(NOW + 90 * MIN);

    vi.setSystemTime(NOW + 90 * MIN);
    await device.store.alarm();
    expect(sent).toHaveLength(2);
    expect(device.memory.alarm()).toBeNull();
  });

  it('drops a reminder that is hours late rather than sending it', async () => {
    const subscription = await phone();
    await post('/push/schedule', { subscription, reminders: [reminder(NOW + 30 * MIN, 'tomorrow')] });
    const [device] = push.devices();
    vi.setSystemTime(NOW + 30 * MIN + STALE_MS + MIN);
    await device.store.alarm();
    expect(sent).toHaveLength(0);
    expect(device.memory.alarm()).toBeNull();
  });

  it('tries again a few minutes later when the push service is busy - three times at most', async () => {
    const subscription = await phone();
    await post('/push/schedule', { subscription, reminders: [reminder(NOW + MIN, 'busy')] });
    const [device] = push.devices();
    status = 503;
    let at = NOW + MIN;
    for (let attempt = 0; attempt < 4; attempt++) {
      vi.setSystemTime(at);
      await device.store.alarm();
      at = device.memory.alarm() ?? 0;
    }
    expect(sent).toHaveLength(4);
    expect(device.memory.alarm()).toBeNull();
  });

  it('forgets a phone the push service says has gone', async () => {
    const subscription = await phone();
    await post('/push/schedule', { subscription, reminders: [reminder(NOW + MIN, 'a'), reminder(NOW + 60 * MIN, 'b')] });
    const [device] = push.devices();
    status = 410;
    vi.setSystemTime(NOW + MIN);
    await device.store.alarm();
    expect(device.memory.data.size).toBe(0);
    expect(device.memory.alarm()).toBeNull();
  });

  it('sends a test straight away, and forgets on request', async () => {
    const subscription = await phone();
    expect(await (await post('/push/test', { subscription })).json()).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
    await post('/push/schedule', { subscription, reminders: [reminder(NOW + 30 * MIN, 'x')] });
    expect(await (await post('/push/forget', { subscription })).json()).toEqual({ ok: true });
    const [device] = push.devices();
    expect(device.memory.data.size).toBe(0);
    expect(device.memory.alarm()).toBeNull();
  });

  it('only sends to real push services, and only for the app', async () => {
    const subscription = await phone();
    const elsewhere = await post('/push/schedule', { subscription: { ...subscription, endpoint: 'https://evil.example.com/x' }, reminders: [] });
    expect(elsewhere.status).toBe(400);
    const badKey = await post('/push/schedule', { subscription: { ...subscription, keys: { ...subscription.keys, auth: 'abc' } }, reminders: [] });
    expect(badKey.status).toBe(400);
    expect((await post('/push/key', {}, 'https://someone-else.example')).status).toBe(403);
  });

  it('says so when the server has no reminder store yet', async () => {
    env = makeEnv(undefined);
    expect((await post('/push/key', {})).status).toBe(501);
  });

  it("doesn't count against the coach's daily allowance", async () => {
    const counted = vi.fn(async () => null);
    env.RATE_LIMIT = { get: counted, put: counted } as unknown as KVNamespace;
    await post('/push/key', {});
    expect(counted).not.toHaveBeenCalled();
  });
});

describe('cleanReminders', () => {
  it('keeps only links inside the app, and trims what it is sent', () => {
    const [kept] = cleanReminders([{ at: NOW + MIN, title: ` ${'x'.repeat(200)}`, body: 'b', url: 'https://evil.example', tag: '' }], NOW)!;
    expect(kept.url).toBe('./');
    expect(kept.title.length).toBeLessThanOrEqual(80);
    expect(kept.tag).toBe(`r${NOW + MIN}`);
    expect(cleanReminders('nope', NOW)).toBeNull();
  });
});
