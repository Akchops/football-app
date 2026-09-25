import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

/**
 * The worker's real request handler end to end - origin check, rate limit,
 * routing, model choice, fallback and error wording together - with only
 * Google replaced. The unit tests prove the pieces; this proves the wiring.
 */

const ORIGIN = 'https://akchops.github.io';

function kv(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    get: async (key: string) => data.get(key) ?? null,
    put: async (key: string, value: string) => void data.set(key, value),
  };
}

function makeEnv(store = kv()): Env {
  return {
    GEMINI_API_KEY: 'test-key',
    ALLOWED_ORIGINS: ORIGIN,
    DAILY_LIMIT: '40',
    RATE_LIMIT: store as unknown as KVNamespace,
  };
}

const LIST = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview', 'gemini-3.1-flash-image-preview'].map((id) => ({
  name: `models/${id}`,
  supportedGenerationMethods: ['generateContent'],
}));

function google(answer: (model: string, body: { generationConfig?: Record<string, unknown> }) => { status: number; body: unknown }) {
  const seen: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/models?')) return new Response(JSON.stringify({ models: LIST }), { status: 200 });
      const model = decodeURIComponent(/models\/([^:]+):generateContent/.exec(url)?.[1] ?? '');
      seen.push(model);
      const reply = answer(model, JSON.parse(String(init?.body ?? '{}')));
      return new Response(JSON.stringify(reply.body), { status: reply.status });
    }),
  );
  return seen;
}

const answerWith = (value: unknown) => ({
  status: 200,
  body: { candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] }, finishReason: 'STOP' }] },
});

function post(path: string, payload: unknown, origin = ORIGIN) {
  return new Request(`https://matchday-ai.example.workers.dev${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(payload),
  });
}

const schedule = { prompt: 'Read every fixture.', media: [{ mimeType: 'image/jpeg', data: 'AAAA' }] };

afterEach(() => vi.unstubAllGlobals());

describe('worker', () => {
  it('answers the Coach on a stable model and names it', async () => {
    const seen = google(() => answerWith({ title: 'Handling warm-up' }));
    const response = await worker.fetch(post('/drills', { player: 'GK', ask: 'warm-up' }), makeEnv());
    const body = (await response.json()) as { result: unknown; model: string };

    expect(response.status).toBe(200);
    expect(body.model).toBe('gemini-2.5-flash');
    expect(body.result).toEqual({ title: 'Handling warm-up' });
    expect(seen).toEqual(['gemini-2.5-flash']);
  });

  it('reads a schedule on the lite model', async () => {
    const seen = google(() => answerWith({ fixtures: [] }));
    const response = await worker.fetch(post('/fixtures', schedule), makeEnv());

    expect(response.status).toBe(200);
    expect(seen).toEqual(['gemini-2.5-flash-lite']);
  });

  it('recovers from a model that is overloaded without the app ever seeing it', async () => {
    const seen = google((model) =>
      model === 'gemini-2.5-flash'
        ? { status: 503, body: { error: { message: 'The model is overloaded. Please try again later.' } } }
        : answerWith({ rating: 70 }),
    );
    const response = await worker.fetch(
      post('/clip', { prompt: 'Judge this.', media: [{ mimeType: 'video/webm', data: 'AAAA' }] }),
      makeEnv(),
    );
    const body = (await response.json()) as { model: string };

    expect(response.status).toBe(200);
    expect(body.model).toBe('gemini-2.5-flash-lite');
    expect(seen).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });

  it('says exactly what failed when nothing can answer', async () => {
    google(() => ({ status: 500, body: { error: { message: 'An internal error has occurred.' } } }));
    const response = await worker.fetch(post('/drills', { player: 'GK', ask: 'warm-up' }), makeEnv());
    const body = (await response.json()) as { error: string; code: string };

    expect(response.status).toBe(500);
    expect(body.code).toBe('upstream');
    expect(body.error).toBe(
      'The coach had a problem. Try again. (upstream · gemini-2.5-flash 500, gemini-2.5-flash-lite 500, gemini-3-flash-preview 500 · An internal error has occurred.)',
    );
  });

  it('never tells the app Google\'s quota is the person\'s daily limit', async () => {
    google(() => ({ status: 429, body: { error: { message: 'Resource has been exhausted (e.g. check quota).' } } }));
    const response = await worker.fetch(post('/drills', { player: 'GK', ask: 'warm-up' }), makeEnv());
    const body = (await response.json()) as { rateLimited?: boolean; code: string };

    // The app treats any 429 as "you have used your 40 for today".
    expect(response.status).not.toBe(429);
    expect(body.rateLimited).toBeUndefined();
    expect(body.code).toBe('busy');
  });

  it('still gives the real daily limit as a 429', async () => {
    google(() => answerWith({}));
    const day = new Date().toISOString().slice(0, 10);
    const store = kv({ [`rl:${day}:unknown`]: '40' });
    const response = await worker.fetch(post('/drills', { player: 'GK', ask: 'warm-up' }), makeEnv(store));
    const body = (await response.json()) as { rateLimited?: boolean };

    expect(response.status).toBe(429);
    expect(body.rateLimited).toBe(true);
  });

  it('ignores the model the old worker left cached', async () => {
    const seen = google(() => answerWith({}));
    const store = kv({ 'model:gemini': 'gemini-3.1-flash-image-preview', 'model:gemini:fast': 'gemini-3-flash-preview' });
    await worker.fetch(post('/drills', { player: 'GK', ask: 'warm-up' }), makeEnv(store));
    await worker.fetch(post('/fixtures', schedule), makeEnv(store));

    expect(seen).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });

  it('still only serves the app', async () => {
    google(() => answerWith({}));
    const response = await worker.fetch(post('/drills', { ask: 'x' }, 'https://example.com'), makeEnv());
    expect(response.status).toBe(403);
  });
});
