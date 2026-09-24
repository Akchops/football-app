import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeFailure, generate, type GeminiEnv, type Store } from './gemini';

/** Workers KV, as far as this code uses it. */
function memoryStore(seed: Record<string, string> = {}): Store & { data: Map<string, string>; ttl: Map<string, number> } {
  const data = new Map(Object.entries(seed));
  const ttl = new Map<string, number>();
  return {
    data,
    ttl,
    async get(key) {
      return data.get(key) ?? null;
    },
    async put(key, value, options) {
      data.set(key, value);
      if (options?.expirationTtl) ttl.set(key, options.expirationTtl);
    },
  };
}

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-image-preview',
].map((id) => ({ name: `models/${id}`, supportedGenerationMethods: ['generateContent'] }));

type Reply = { status: number; body: unknown; delayMs?: number };

/**
 * Stands in for Google. `replies` maps a model id to what it answers, in order;
 * the model list is always served. Every call is recorded.
 */
function fakeGoogle(replies: Record<string, Reply[]>) {
  const calls: string[] = [];
  const handler = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/models?')) {
      calls.push('list');
      return new Response(JSON.stringify({ models: MODELS }), { status: 200 });
    }
    const model = decodeURIComponent(/models\/([^:]+):generateContent/.exec(url)?.[1] ?? '');
    calls.push(model);
    const reply = replies[model]?.shift() ?? { status: 500, body: { error: { message: `no scripted reply for ${model}` } } };
    if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  vi.stubGlobal('fetch', handler);
  return calls;
}

const ok = (value: unknown): Reply => ({
  status: 200,
  body: { candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] }, finishReason: 'STOP' }] },
});
const error = (status: number, message: string): Reply => ({ status, body: { error: { message } } });

function env(store = memoryStore(), extra: Partial<GeminiEnv> = {}): GeminiEnv {
  return { GEMINI_API_KEY: 'test-key', RATE_LIMIT: store, ...extra };
}

const ask = (e: GeminiEnv, purpose: 'standard' | 'fast' = 'standard', budgetMs = 50_000, minRetryMs?: number) =>
  generate(e, purpose, [{ text: 'hi' }], 'system', { type: 'object' }, { budgetMs, minRetryMs });

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('generate', () => {
  it('answers on the best stable model and says which one it was', async () => {
    const calls = fakeGoogle({ 'gemini-2.5-flash': [ok({ plan: 1 })] });
    await expect(ask(env())).resolves.toEqual({ result: { plan: 1 }, model: 'gemini-2.5-flash' });
    expect(calls).toEqual(['list', 'gemini-2.5-flash']);
  });

  it('never goes near a preview or image model while a stable one exists', async () => {
    const calls = fakeGoogle({ 'gemini-2.5-flash': [ok({})] });
    await ask(env());
    expect(calls.join(' ')).not.toMatch(/preview|image/);
  });

  it('uses the lite model for schedule import', async () => {
    const calls = fakeGoogle({ 'gemini-2.5-flash-lite': [ok({ fixtures: [] })] });
    await expect(ask(env(), 'fast')).resolves.toMatchObject({ model: 'gemini-2.5-flash-lite' });
    expect(calls.at(-1)).toBe('gemini-2.5-flash-lite');
  });

  it('moves to the next model when the first returns a server error', async () => {
    const store = memoryStore();
    const calls = fakeGoogle({
      'gemini-2.5-flash': [error(503, 'The model is overloaded.')],
      'gemini-2.5-flash-lite': [ok({ plan: 2 })],
    });
    await expect(ask(env(store))).resolves.toEqual({ result: { plan: 2 }, model: 'gemini-2.5-flash-lite' });
    expect(calls).toEqual(['list', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']);
    // And the model that failed sits out, so the next request skips it.
    expect(store.data.has('cooldown:gemini-2.5-flash')).toBe(true);
  });

  it('moves to the next model when the first is out of quota', async () => {
    fakeGoogle({
      'gemini-2.5-flash': [error(429, 'Resource has been exhausted.')],
      'gemini-2.5-flash-lite': [ok({})],
    });
    await expect(ask(env())).resolves.toMatchObject({ model: 'gemini-2.5-flash-lite' });
  });

  it('does not retry a request that was refused as a request', async () => {
    const calls = fakeGoogle({ 'gemini-2.5-flash': [error(400, 'Request contains an invalid argument.')] });
    await expect(ask(env())).rejects.toMatchObject({ status: 400, model: 'gemini-2.5-flash' });
    expect(calls).toEqual(['list', 'gemini-2.5-flash']);
  });

  it('keeps going while there is time, four models at most, and reports the last failure in full', async () => {
    const store = memoryStore();
    const busy = error(503, 'This model is currently experiencing high demand.');
    const calls = fakeGoogle({
      'gemini-2.5-flash': [busy],
      'gemini-2.5-flash-lite': [busy],
      'gemini-3-flash-preview': [busy],
    });
    // Only three usable models in this list, so three attempts, all failing.
    await expect(ask(env(store))).rejects.toMatchObject({
      status: 503,
      model: 'gemini-3-flash-preview',
      detail: 'This model is currently experiencing high demand.',
    });
    expect(calls.filter((c) => c !== 'list')).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview']);
    for (const model of calls.filter((c) => c !== 'list')) expect(store.data.has(`cooldown:${model}`)).toBe(true);
  });

  it('stops at four attempts even when more models are listed', async () => {
    const many = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
    const tried: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.includes('/models?')) {
          return new Response(JSON.stringify({ models: many.map((id) => ({ name: `models/${id}`, supportedGenerationMethods: ['generateContent'] })) }));
        }
        tried.push(decodeURIComponent(/models\/([^:]+):/.exec(url)?.[1] ?? ''));
        return new Response(JSON.stringify(error(503, 'high demand').body), { status: 503 });
      }),
    );
    await expect(ask(env())).rejects.toMatchObject({ status: 503 });
    expect(tried).toHaveLength(4);
  });

  it('remembers the model that answered and goes straight to it next time', async () => {
    // What 24 Sep looked like: the newest models overloaded, one older one fine.
    const store = memoryStore();
    const calls = fakeGoogle({
      'gemini-2.5-flash': [error(503, 'high demand')],
      'gemini-2.5-flash-lite': [ok({ first: true }), ok({ second: true })],
    });
    await expect(ask(env(store))).resolves.toMatchObject({ model: 'gemini-2.5-flash-lite' });
    expect(store.data.get('good:v2:standard')).toBe('gemini-2.5-flash-lite');

    // Even after the overloaded one's cooldown is gone, the one that worked leads.
    store.data.delete('cooldown:gemini-2.5-flash');
    calls.length = 0;
    await expect(ask(env(store))).resolves.toMatchObject({ result: { second: true } });
    expect(calls).toEqual(['gemini-2.5-flash-lite']);
  });

  it('lets a withdrawn model sit out for a day, and a busy one only briefly', async () => {
    const store = memoryStore();
    fakeGoogle({
      'gemini-2.5-flash': [error(404, 'This model models/gemini-2.5-flash is no longer available to new users.')],
      'gemini-2.5-flash-lite': [error(503, 'high demand')],
      'gemini-3-flash-preview': [ok({})],
    });
    await ask(env(store));
    expect(store.ttl.get('cooldown:gemini-2.5-flash')).toBe(24 * 60 * 60);
    expect(store.ttl.get('cooldown:gemini-2.5-flash-lite')).toBe(2 * 60);
  });

  it('does not start a second model once the budget is nearly spent', async () => {
    const calls = fakeGoogle({
      'gemini-2.5-flash': [{ ...error(503, 'slow then overloaded'), delayMs: 60 }],
      'gemini-2.5-flash-lite': [ok({})],
    });
    // 100ms budget, 60ms gone on the first try, and a second needs 50ms.
    await expect(ask(env(), 'standard', 100, 50)).rejects.toMatchObject({ status: 503 });
    expect(calls).not.toContain('gemini-2.5-flash-lite');
  });

  it('limits each attempt to what is left of the budget, not a separate longer limit', async () => {
    fakeGoogle({ 'gemini-2.5-flash': [ok({})] });
    const signalTimeout = vi.spyOn(AbortSignal, 'timeout');
    await ask(env(), 'standard', 2_000);
    // The model list gets its own short limit; the answer gets the budget.
    expect(signalTimeout.mock.calls.at(-1)?.[0]).toBeLessThanOrEqual(2_000);
  });

  it('caches the model list under the new key and reuses it', async () => {
    const store = memoryStore();
    const calls = fakeGoogle({ 'gemini-2.5-flash': [ok({}), ok({})] });
    await ask(env(store));
    await ask(env(store));
    expect(calls.filter((c) => c === 'list')).toHaveLength(1);
    expect(store.data.has('models:v2')).toBe(true);
  });

  it('ignores whatever the old picker left cached', async () => {
    // The previous worker cached its choice here for a day. The fix must not
    // read it, or the old preview would keep being used after the deploy.
    const store = memoryStore({ 'model:gemini': 'gemini-3.1-flash-image-preview', 'model:gemini:fast': 'gemini-3-flash-preview' });
    const calls = fakeGoogle({ 'gemini-2.5-flash': [ok({})] });
    await ask(env(store));
    expect(calls).not.toContain('gemini-3.1-flash-image-preview');
  });

  it('tries a model that failed recently only after the others', async () => {
    const store = memoryStore({ 'cooldown:gemini-2.5-flash': '1' });
    const calls = fakeGoogle({ 'gemini-2.5-flash-lite': [ok({})] });
    await expect(ask(env(store))).resolves.toMatchObject({ model: 'gemini-2.5-flash-lite' });
    expect(calls).not.toContain('gemini-2.5-flash');
  });

  it('uses a model forced in config first', async () => {
    const calls = fakeGoogle({ 'gemini-2.0-flash': [ok({})] });
    await expect(ask(env(memoryStore(), { GEMINI_MODEL: 'gemini-2.0-flash' }))).resolves.toMatchObject({
      model: 'gemini-2.0-flash',
    });
    expect(calls[1]).toBe('gemini-2.0-flash');
  });

  it('tries a configured list in order, then the rest', async () => {
    const calls = fakeGoogle({
      'gemini-2.0-flash': [error(503, 'high demand')],
      'gemini-2.5-flash-lite': [ok({})],
    });
    await expect(
      ask(env(memoryStore(), { GEMINI_MODEL: 'gemini-2.0-flash, gemini-2.5-flash-lite' })),
    ).resolves.toMatchObject({ model: 'gemini-2.5-flash-lite' });
    expect(calls.slice(1)).toEqual(['gemini-2.0-flash', 'gemini-2.5-flash-lite']);
  });

  it('comes back to the first configured model once it has sat out', async () => {
    // The configured order beats "whatever answered last", so the fast model is
    // used again as soon as its cooldown ends, not six hours later.
    const store = memoryStore({ 'good:v2:standard': 'gemini-2.5-flash-lite' });
    const calls = fakeGoogle({ 'gemini-2.0-flash': [ok({})] });
    await ask(env(store, { GEMINI_MODEL: 'gemini-2.0-flash,gemini-2.5-flash-lite' }));
    expect(calls.slice(1)).toEqual(['gemini-2.0-flash']);
  });

  it('treats an empty forced model as not forced', async () => {
    const calls = fakeGoogle({ 'gemini-2.5-flash': [ok({})] });
    await ask(env(memoryStore(), { GEMINI_MODEL: '  ' }));
    expect(calls[1]).toBe('gemini-2.5-flash');
  });

  it('still answers when the model list cannot be fetched', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.includes('/models?')) return new Response('{"error":{"message":"down"}}', { status: 503 });
        calls.push(url);
        return new Response(JSON.stringify(ok({ fine: true }).body), { status: 200 });
      }),
    );
    // The built-in list: the models that were answering when it was written.
    await expect(ask(env())).resolves.toMatchObject({ model: 'gemini-3.6-flash' });
  });

  it('asks the import model to answer without deliberating, in its own generation\'s terms', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        if (String(input).includes('/models?')) return new Response(JSON.stringify({ models: MODELS }), { status: 200 });
        sent.push(JSON.parse(String(init?.body)).generationConfig.thinkingConfig);
        return new Response(JSON.stringify(ok({}).body), { status: 200 });
      }),
    );
    await ask(env(), 'fast');
    expect(sent).toEqual([{ thinkingBudget: 0 }]);
  });

  it('gives the Coach its generation\'s light setting - none at all for 2.5', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        if (String(input).includes('/models?')) return new Response(JSON.stringify({ models: MODELS }), { status: 200 });
        sent.push(JSON.parse(String(init?.body)).generationConfig.thinkingConfig);
        return new Response(JSON.stringify(ok({}).body), { status: 200 });
      }),
    );
    await ask(env(), 'standard');
    expect(sent).toEqual([undefined]);
  });

  it('retries the same model without its thinking setting when that setting is refused', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        if (String(input).includes('/models?')) return new Response(JSON.stringify({ models: MODELS }), { status: 200 });
        const thinking = JSON.parse(String(init?.body)).generationConfig.thinkingConfig;
        sent.push(thinking);
        return thinking
          ? new Response(JSON.stringify(error(400, 'Request contains an invalid argument.').body), { status: 400 })
          : new Response(JSON.stringify(ok({ fixtures: [] }).body), { status: 200 });
      }),
    );
    await expect(ask(env(), 'fast')).resolves.toMatchObject({ model: 'gemini-2.5-flash-lite' });
    expect(sent).toEqual([{ thinkingBudget: 0 }, undefined]);
  });

  it('reports a truncated reply as truncated and does not retry it', async () => {
    const calls = fakeGoogle({
      'gemini-2.5-flash-lite': [{ status: 200, body: { candidates: [{ content: { parts: [{ text: '{"fix' }] }, finishReason: 'MAX_TOKENS' }] } }],
    });
    await expect(ask(env(), 'fast')).rejects.toMatchObject({ code: 'truncated', model: 'gemini-2.5-flash-lite' });
    expect(calls.filter((c) => c !== 'list')).toHaveLength(1);
  });
});

describe('describeFailure', () => {
  const fail = (extra: Record<string, unknown>) => Object.assign(new Error('x'), extra);

  it('names the status, the model and Google\'s reason', () => {
    const out = describeFailure(fail({ status: 503, code: 'upstream', model: 'gemini-2.5-flash', detail: 'The model is overloaded.' }));
    expect(out.status).toBe(503);
    expect(out.body.code).toBe('upstream');
    expect(out.body.error).toBe('The coach had a problem. Try again. (upstream 503 · gemini-2.5-flash · The model is overloaded.)');
  });

  it('sends Google running out of quota back as busy, never as a 429', () => {
    // The app reads any 429 as the person's own daily limit.
    const out = describeFailure(fail({ status: 429, code: 'upstream', model: 'gemini-2.5-flash', detail: 'Resource has been exhausted' }));
    expect(out.status).toBe(503);
    expect(out.body.code).toBe('busy');
  });

  it('never lets anything shaped like a key through', () => {
    const out = describeFailure(fail({ status: 400, detail: 'API key AIzaSyA1234567890abcdefghijklmnopqrstu is not valid' }));
    expect(out.body.error).not.toMatch(/AIza/);
    expect(out.body.error).toContain('[key]');
  });

  it('says a timeout is a timeout', () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError', model: 'gemini-2.5-flash-lite' });
    const out = describeFailure(timeout);
    expect(out.status).toBe(504);
    expect(out.body.error).toBe('That took too long to read. Try a smaller picture, or one page at a time. (timeout gemini-2.5-flash-lite)');
  });

  it('keeps the codes the app already knows', () => {
    for (const code of ['truncated', 'blocked', 'empty', 'badjson']) {
      expect(describeFailure(fail({ code, model: 'm' })).body.code).toBe(code);
    }
    expect(describeFailure(fail({ status: 400, code: 'upstream' })).body.code).toBe('request');
    expect(describeFailure(fail({ code: 'nomodel', status: 503 })).status).toBe(503);
  });

  it('does not blame Google for a fault in the worker itself', () => {
    const out = describeFailure(new TypeError('Cannot read properties of undefined'));
    expect(out.status).toBe(500);
    expect(out.body.code).toBe('unknown');
    expect(out.body.error).toBe('The coach had a problem. Try again. (unknown)');
  });
});
