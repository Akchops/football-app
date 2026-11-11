import { describe, expect, it } from 'vitest';
import worker, { type Env } from './index';
import { NOTICE_KEY, cleanNotice } from './status';

const ORIGIN = 'https://akchops.github.io';

function env(seed: Record<string, string> = {}, broken = false): Env {
  const data = new Map(Object.entries(seed));
  const store = {
    get: async (key: string) => {
      if (broken) throw new Error('KV is having a moment');
      return data.get(key) ?? null;
    },
    put: async (key: string, value: string) => void data.set(key, value),
  };
  return { GEMINI_API_KEY: 'k', ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT: store as unknown as KVNamespace } as Env;
}

const get = (origin: string | null = ORIGIN) =>
  new Request('https://matchday-ai.example.workers.dev/status', { headers: origin ? { origin } : {} });

describe('cleanNotice', () => {
  it('keeps a message as written, trimmed', () => {
    expect(cleanNotice(JSON.stringify({ title: ' Server down ', message: 'Back by 3pm.', postedAt: '2026-11-11T12:00:00Z' }))).toEqual({
      title: 'Server down',
      message: 'Back by 3pm.',
      postedAt: '2026-11-11T12:00:00Z',
    });
  });

  it('is nothing when there is nothing to say', () => {
    expect(cleanNotice(null)).toBeNull();
    expect(cleanNotice('')).toBeNull();
    expect(cleanNotice('not json')).toBeNull();
    expect(cleanNotice(JSON.stringify({ title: '  ', message: '' }))).toBeNull();
    expect(cleanNotice(JSON.stringify([1, 2]))).toBeNull();
  });

  it('caps the length and drops a posted time that is not a time', () => {
    const notice = cleanNotice({ message: 'x'.repeat(5000), postedAt: 'yesterday' });
    expect(notice?.message).toHaveLength(600);
    expect(notice?.postedAt).toBe('');
  });
});

describe('GET /status', () => {
  it('sends the stored message to the app', async () => {
    const stored = JSON.stringify({ title: '', message: 'Accounts are down.', postedAt: '2026-11-11T12:00:00Z' });
    const reply = await worker.fetch(get(), env({ [NOTICE_KEY]: stored }));
    expect(reply.status).toBe(200);
    expect(reply.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(reply.headers.get('cache-control')).toContain('max-age');
    expect(await reply.json()).toEqual({ notice: { title: '', message: 'Accounts are down.', postedAt: '2026-11-11T12:00:00Z' } });
  });

  it('says there is none when none is posted', async () => {
    const reply = await worker.fetch(get(), env());
    expect(await reply.json()).toEqual({ notice: null });
  });

  it('answers even when the store does not', async () => {
    const reply = await worker.fetch(get(), env({}, true));
    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({ notice: null });
  });

  it('needs no origin - there is nothing in it that is not for everyone', async () => {
    const reply = await worker.fetch(get(null), env());
    expect(reply.status).toBe(200);
  });

  it('still turns down other GETs', async () => {
    const reply = await worker.fetch(new Request('https://matchday-ai.example.workers.dev/drills', { headers: { origin: ORIGIN } }), env());
    expect(reply.status).toBe(405);
  });
});
