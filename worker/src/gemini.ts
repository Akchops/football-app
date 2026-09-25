import { rankModels, thinkingLight, thinkingOff, type ListedModel, type Purpose } from './models';

/**
 * Talking to Gemini: which model, what to do when it fails, and how to say why.
 *
 * The rules that matter, each learnt the hard way:
 *
 * - The model comes from models.ts, which can only pick stable models. The list
 *   it ranks is cached under a new key, because the old key could still be
 *   holding the preview the previous picker chose for up to a day.
 * - Google's list is not a promise. On 24 Sep it listed eight stable flash
 *   models for this key: two answered "no longer available to new users" and
 *   four "currently experiencing high demand". No fixed order finds the one
 *   that works, so the worker learns it: the model that last answered each job
 *   is tried first next time.
 * - A failure that means "not this model" - a server error, a model that has
 *   gone, a model out of quota - moves on to the next model, up to four, but
 *   only inside one time budget that ends before the app itself gives up.
 *   Retries that each got their own full timeout once stacked to eight minutes.
 * - A model that just failed sits out - two minutes when busy, a day when
 *   gone. Busy is kept short on purpose: the fast model's refusals come back
 *   in well under five seconds, so asking it again soon costs little, while
 *   every request it does take comes back in seconds instead of twenty.
 * - The models named in config are trusted, and a sit-out only ever reorders
 *   them among themselves. The first version of this pushed a busy trusted
 *   model behind every model it had discovered - which on 24 Sep meant behind
 *   four that had never once answered - so after a single "high demand" every
 *   import for two minutes spent all its attempts on dead models. A busy
 *   trusted model now gets a second go after a short pause, and models nobody
 *   vouched for are only tried once every trusted one has been withdrawn.
 * - Every failure carries the status, the model and Google's own words, because
 *   "(upstream)" alone is how this went unexplained for weeks.
 */

const API = 'https://generativelanguage.googleapis.com/v1beta';
const MODELS_KEY = 'models:v2';
const MODELS_TTL_SECONDS = 6 * 60 * 60;
const COOLDOWN_SECONDS = 2 * 60;
/** A model that answers 404 has been withdrawn for this key; it is not coming back soon. */
const GONE_SECONDS = 24 * 60 * 60;
/** How long a model that answered stays the first one tried. */
const GOOD_TTL_SECONDS = 6 * 60 * 60;
const MAX_ATTEMPTS = 4;
/** Not worth starting another model with less than this left. */
const MIN_RETRY_MS = 15_000;

/**
 * Only used when the model list itself cannot be fetched: the two that were
 * answering when this was written (24 Sep 2026). Harmless if either has since
 * been withdrawn - the request simply moves on.
 */
const WHEN_LIST_UNAVAILABLE: ListedModel[] = [
  { name: 'models/gemini-3.6-flash' },
  { name: 'models/gemini-3.5-flash-lite' },
];

const goodKey = (purpose: Purpose) => `good:v2:${purpose}`;

/** The two methods of Workers KV this uses. */
export interface Store {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface GeminiEnv {
  GEMINI_API_KEY: string;
  RATE_LIMIT: Store;
  /** Coach and clip models to try first, best first, comma-separated. */
  GEMINI_MODEL?: string;
  /** Schedule import models to try first, best first, comma-separated. */
  GEMINI_FAST_MODEL?: string;
}

export interface GenerateOptions {
  /** The whole request, every attempt included, has to finish inside this. */
  budgetMs: number;
  maxOutputTokens?: number;
  /** Tests shrink these; nothing else should. */
  minRetryMs?: number;
  pauseMs?: number;
}

/** One model asked during a request, and what came back. */
export interface Attempt {
  model: string;
  status?: number;
  code?: string;
  detail?: string;
}

/** What a failure carries, beyond its message. */
export interface Failure extends Error {
  status?: number;
  code?: string;
  model?: string;
  /** Google's own error text, when there is any. */
  detail?: string;
  /** Every model asked, in order, when there was more than one. */
  attempts?: Attempt[];
}

function failure(message: string, extra: Omit<Partial<Failure>, 'message'>): Failure {
  return Object.assign(new Error(message), extra);
}

/**
 * Reading a table off a picture needs no deliberation, and the deliberating is
 * most of the wait - so schedule import asks for an immediate answer, and the
 * Coach and clips for a short think rather than an open-ended one.
 */
function settingsFor(model: string, purpose: Purpose): Record<string, unknown> {
  return purpose === 'fast' ? thinkingOff(model) : thinkingLight(model);
}

/** "a, b" in config becomes ['a', 'b'], best first. */
function modelList(value: string | undefined): string[] {
  return (value ?? '').split(',').map((id) => id.trim()).filter(Boolean);
}

async function listModels(env: GeminiEnv): Promise<ListedModel[]> {
  const cached = await env.RATE_LIMIT.get(MODELS_KEY).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as ListedModel[];
    } catch {
      // Unreadable cache entry: fetch a fresh list below.
    }
  }

  const models: ListedModel[] = [];
  let token = '';
  do {
    const response = await fetch(`${API}/models?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`, {
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as {
      models?: ListedModel[];
      nextPageToken?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw failure(`Could not list models (${response.status}).`, {
        status: response.status,
        code: 'upstream',
        detail: body.error?.message ?? '',
      });
    }
    for (const m of body.models ?? []) {
      models.push({ name: m.name, supportedGenerationMethods: m.supportedGenerationMethods });
    }
    token = body.nextPageToken ?? '';
  } while (token);

  // A cache that cannot be written is a slower worker, not a broken one.
  await env.RATE_LIMIT.put(MODELS_KEY, JSON.stringify(models), { expirationTtl: MODELS_TTL_SECONDS }).catch(() => {});
  return models;
}

/** Why a model is sitting out. Entries written before this held '1': busy. */
type SitOut = 'busy' | 'gone';

async function sittingOut(env: GeminiEnv, models: string[]): Promise<Map<string, SitOut>> {
  const flags = await Promise.all(models.map((m) => env.RATE_LIMIT.get(`cooldown:${m}`).catch(() => null)));
  const out = new Map<string, SitOut>();
  models.forEach((m, i) => {
    const flag = flags[i];
    if (flag !== null) out.set(m, flag === 'gone' ? 'gone' : 'busy');
  });
  return out;
}

/** Available ones first, busy ones after; withdrawn ones not at all. */
function byReadiness(models: string[], sitting: Map<string, SitOut>): string[] {
  return [...models.filter((id) => !sitting.has(id)), ...models.filter((id) => sitting.get(id) === 'busy')];
}

const isBusy = (status: number | undefined) => status === 503 || status === 429;

/**
 * The failure to report once every attempt has failed. When the only problems
 * were busy models - and withdrawn ones, which are not what the person needs to
 * hear about - it is reported as busy, with Google's words from a busy one.
 */
function finalFailure(last: Failure, attempts: Attempt[]): Failure {
  const withList = Object.assign(last, { attempts });
  const busyOnly = attempts.some((a) => isBusy(a.status)) && attempts.every((a) => isBusy(a.status) || a.status === 404);
  if (!busyOnly) return withList;
  const telling = [...attempts].reverse().find((a) => isBusy(a.status));
  return Object.assign(withList, { code: 'busy', status: telling?.status ?? 503, model: telling?.model, detail: telling?.detail ?? '' });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function callOnce(
  env: GeminiEnv,
  model: string,
  parts: unknown[],
  system: string,
  schema: unknown,
  settings: Record<string, unknown>,
  timeoutMs: number,
  maxOutputTokens?: number,
): Promise<unknown> {
  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    responseJsonSchema: schema,
    ...settings,
  };
  if (maxOutputTokens) generationConfig.maxOutputTokens = maxOutputTokens;

  const response = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig,
    }),
    signal: AbortSignal.timeout(Math.max(1_000, timeoutMs)),
  });

  const body = (await response.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw failure(`Gemini returned ${response.status}.`, {
      status: response.status,
      code: 'upstream',
      model,
      detail: body.error?.message ?? '',
    });
  }

  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  const finish = candidate?.finishReason ?? '';

  // A long answer that runs out of room comes back as valid-looking but truncated
  // JSON, which then fails to parse for reasons the parse error cannot explain.
  if (finish === 'MAX_TOKENS') throw failure('Ran out of room before finishing.', { code: 'truncated', model });
  if (!text) {
    throw failure(`Empty response (finishReason ${finish || 'none'}).`, {
      code: finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' ? 'blocked' : 'empty',
      model,
    });
  }

  const trimmed = text.trim();
  const cleaned = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
    : trimmed;
  try {
    return JSON.parse(cleaned);
  } catch {
    throw failure('The reply was not usable JSON.', { code: 'badjson', model });
  }
}

/** The model that just answered goes first next time. Written only when it changes. */
async function remember(env: GeminiEnv, purpose: Purpose, model: string, previous: string | undefined): Promise<void> {
  if (model === previous) return;
  await env.RATE_LIMIT.put(goodKey(purpose), model, { expirationTtl: GOOD_TTL_SECONDS }).catch(() => {});
}

/** Failures that say "not this model" rather than "not this request". */
function worthAnotherModel(error: Failure): boolean {
  const status = error.status ?? 0;
  return status >= 500 || status === 404 || status === 429;
}

/**
 * Ask Gemini for one structured answer, on the best model for the job, with one
 * fallback. Resolves with the answer and the model that gave it.
 */
export async function generate(
  env: GeminiEnv,
  purpose: Purpose,
  parts: unknown[],
  system: string,
  schema: unknown,
  options: GenerateOptions,
): Promise<{ result: unknown; model: string }> {
  const deadline = Date.now() + options.budgetMs;
  const minRetry = options.minRetryMs ?? MIN_RETRY_MS;
  const configured = modelList(purpose === 'fast' ? env.GEMINI_FAST_MODEL : env.GEMINI_MODEL);

  let listed: ListedModel[];
  try {
    listed = await listModels(env);
  } catch {
    listed = WHEN_LIST_UNAVAILABLE;
  }

  const lastGood = (await env.RATE_LIMIT.get(goodKey(purpose)).catch(() => null)) ?? undefined;

  // Trusted: the models config names, then whatever answered last. Everything
  // else Google lists is only discovered, and gets asked last if at all.
  const trusted = [...new Set([...configured, lastGood].filter((id): id is string => Boolean(id)))];
  const discovered = rankModels(listed, purpose).filter((id) => !trusted.includes(id));
  const sitting = await sittingOut(env, [...trusted, ...discovered.slice(0, MAX_ATTEMPTS + 2)]);
  const trustedReady = byReadiness(trusted, sitting);
  const discoveredReady = byReadiness(discovered, sitting);

  // With models named in config, those are tried twice over before anything
  // discovered - which only comes in if every trusted model has been withdrawn.
  // Without, it is whatever answered last and then the discovered list, once.
  const strict = configured.length > 0 && trustedReady.length > 0;
  const queue = strict ? [...trustedReady, ...trustedReady] : [...trustedReady, ...discoveredReady];
  if (queue.length === 0) {
    throw failure('No usable Gemini model is available to this key.', { code: 'nomodel', status: 503 });
  }

  const asFailure = (error: unknown, model: string) =>
    Object.assign(error instanceof Error ? error : new Error(String(error)), { model }) as Failure;

  const attempts: Attempt[] = [];
  const goneNow = new Set<string>();
  const asked = new Set<string>();
  let fellBack = !strict;
  let last: Failure | undefined;

  while (attempts.length < MAX_ATTEMPTS) {
    const model = queue.shift();
    if (model === undefined) {
      if (!fellBack && trustedReady.every((id) => goneNow.has(id))) {
        fellBack = true;
        queue.push(...discoveredReady.filter((id) => !goneNow.has(id)));
        continue;
      }
      break;
    }
    if (goneNow.has(model)) continue;
    if (attempts.length > 0 && deadline - Date.now() < minRetry) break;

    // Asking a model that was busy a moment ago: give it that moment first.
    if (asked.has(model)) await sleep(options.pauseMs ?? 1_000);
    asked.add(model);

    const settings = settingsFor(model, purpose);
    try {
      const result = await callOnce(env, model, parts, system, schema, settings, deadline - Date.now(), options.maxOutputTokens);
      await remember(env, purpose, model, lastGood);
      return { result, model };
    } catch (error) {
      last = asFailure(error, model);

      // A model can turn down a setting it does not support - Gemini 3 refuses
      // a zero thinking budget with a bare 400, and nothing in the message says
      // which part was wrong. When this request carried such a setting, that is
      // the likeliest culprit, so the same model gets one go without it.
      if (last.status === 400 && Object.keys(settings).length > 0 && deadline - Date.now() >= minRetry) {
        try {
          const result = await callOnce(env, model, parts, system, schema, {}, deadline - Date.now(), options.maxOutputTokens);
          await remember(env, purpose, model, lastGood);
          return { result, model };
        } catch (retryError) {
          last = asFailure(retryError, model);
        }
      }

      attempts.push({ model, status: last.status, code: last.code, detail: last.detail });
      if (!worthAnotherModel(last)) throw finalFailure(last, attempts);

      const gone = last.status === 404;
      if (gone) goneNow.add(model);
      await env.RATE_LIMIT.put(`cooldown:${model}`, gone ? 'gone' : 'busy', {
        expirationTtl: gone ? GONE_SECONDS : COOLDOWN_SECONDS,
      }).catch(() => {});
    }
  }
  throw finalFailure(last ?? failure('The coach did not answer.', { code: 'unknown' }), attempts);
}

/** Anything in a message shaped like a Google API key. */
function redact(text: string): string {
  return text.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[key]');
}

/**
 * What the app is told when a request fails: a sentence for the person holding
 * the phone, then in brackets the tag, the status, the model and Google's words
 * - the part that makes a screenshot of the error enough to fix it from.
 */
export function describeFailure(error: unknown): { status: number; body: { error: string; code: string } } {
  const e = (error ?? {}) as Failure;
  const status = e.status ?? 500;
  const name = e.name ?? '';
  const code = e.code ?? '';

  let friendly: string;
  let tag: string;
  let httpStatus = status >= 400 && status < 600 ? status : 500;

  if (status === 429 || code === 'busy') {
    // Google out of quota is not this person's daily limit, and the app treats
    // any 429 as exactly that - so it goes back as "busy" with a 503.
    [friendly, tag, httpStatus] = ['The coach is busy right now. Try again in a minute.', 'busy', 503];
  } else if (name === 'TimeoutError' || name === 'AbortError') {
    [friendly, tag, httpStatus] = ['That took too long to read. Try a smaller picture, or one page at a time.', 'timeout', 504];
  } else if (code === 'truncated') {
    [friendly, tag] = ['That schedule was too long to read in one go. Try one page, or half of it.', 'truncated'];
  } else if (code === 'blocked') {
    [friendly, tag] = ['The coach would not read that image. Try a different photo.', 'blocked'];
  } else if (code === 'empty') {
    [friendly, tag] = ['The coach read that but sent nothing back. Try again, or a clearer picture.', 'empty'];
  } else if (code === 'badjson') {
    [friendly, tag] = ['The coach garbled its answer. Try again.', 'badjson'];
  } else if (code === 'nomodel') {
    [friendly, tag, httpStatus] = ['The coach is not available right now.', 'nomodel', 503];
  } else if (status >= 500) {
    // Only Google's own server errors are "upstream". A fault in this worker is
    // not, and blaming Google for it would send the next fix the wrong way.
    [friendly, tag] = ['The coach had a problem. Try again.', code === 'upstream' ? 'upstream' : 'unknown'];
  } else {
    [friendly, tag] = ['The coach could not take that request.', 'request'];
  }

  const detail = redact(e.detail ?? '');
  const attempts = e.attempts ?? [];
  // More than one model asked: name each with what it said, so the bracket
  // shows the whole story rather than whichever came last.
  const why =
    attempts.length > 1
      ? ` · ${attempts.map((a) => `${a.model} ${a.status ?? a.code ?? '?'}`).join(', ')}${detail ? ` · ${detail.slice(0, 100)}` : ''}`
      : (() => {
          const single = [e.status ? String(e.status) : '', e.model ?? '', detail.slice(0, 140)].filter(Boolean).join(' · ');
          return single ? ` ${single}` : '';
        })();
  return { status: httpStatus, body: { error: `${friendly} (${tag}${why})`, code: tag } };
}
