/**
 * Matchday AI proxy.
 *
 * Holds the one Gemini key so players don't each need their own. It is
 * deliberately NOT a general Gemini proxy: it owns the system prompts and
 * response schemas and only accepts the three shapes the app needs, so a leaked
 * URL can waste quota but cannot be repurposed as a free LLM endpoint.
 */

export interface Env {
  GEMINI_API_KEY: string;
  /** Comma-separated origins allowed to call this worker. */
  ALLOWED_ORIGINS: string;
  /** Requests allowed per IP per day. */
  DAILY_LIMIT?: string;
  RATE_LIMIT: KVNamespace;
}

const API = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_DAILY_LIMIT = 40;
/** Clip requests carry base64 video; anything larger is refused outright. */
const MAX_BODY_BYTES = 22 * 1024 * 1024;

const DRILLS_SYSTEM =
  'You are an experienced football coach writing a training session for one player. ' +
  'Design drills that can be done realistically: a garden, a park, or a quiet corner of a training pitch, with everyday kit (cones, a ball, a wall, a friend to serve). ' +
  'Be specific and physical - what to set up, how many, what the player should feel. One coaching cue per drill, not a list. ' +
  'Match the intensity to the age group. Never suggest anything that risks injury for a young player. ' +
  'Write in plain British English a teenager would actually follow.';

function clipSystem(sawVideo: boolean): string {
  return (
    'You are a football coach reviewing a short clip with a young player. ' +
    (sawVideo
      ? 'You are watching the clip itself, so movement, timing and footwork are all visible. '
      : 'You are shown still frames sampled in order from the clip - not the full video. Movement between frames has to be inferred, so say plainly when something cannot be judged. ') +
    'Judge only what is visible: body shape, starting position, footwork, decision, angle to the ball, set position, handling. ' +
    'If you cannot confidently pick out the described player, say so in the caveat and set confidence to low rather than guessing. ' +
    'Rate this passage of play out of 100 - be fair and encouraging but honest; a routine, competent action is around 60-70. ' +
    'Give concrete, physical coaching, never vague advice like "concentrate more". Plain British English for a teenager.'
  );
}

const DRILL_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    focus: { type: 'string' },
    warmup: { type: 'array', items: { type: 'string' } },
    drills: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          setup: { type: 'string' },
          reps: { type: 'string' },
          coaching: { type: 'string' },
        },
        required: ['name', 'setup', 'reps', 'coaching'],
        additionalProperties: false,
      },
    },
    progression: { type: 'string' },
    kit: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'focus', 'warmup', 'drills', 'progression', 'kit'],
  additionalProperties: false,
};

const FIXTURES_SYSTEM =
  'You read football fixture lists off photos, screenshots and PDFs and turn them into structured data. ' +
  'These are usually shared in team chats: a club schedule, a league table of fixtures, a tournament order of play, or a photo of a printed sheet. ' +
  'Read every fixture row you can see. Do not invent rows, and do not skip rows because they are hard to read - mark those low confidence instead. ' +
  'Dates are often written without a year ("Sat 12 Sep"). Use the current date given to you and choose the nearest sensible upcoming date; a fixture list nearly always runs forwards from now. ' +
  'Times may be 12-hour ("4.30", "4:30pm", "kick off 2pm"). Always return 24-hour HH:mm. If a row genuinely has no time, return an empty string rather than guessing. ' +
  'H and A, or (H) and (A), mean home and away. So do "vs" for home and "@" or "at" for away. Neutral only when the sheet says so. ' +
  'The opponent is the other team, never the player\'s own. If the row reads "Riverside FC v Oakwood United" and the sheet belongs to Riverside, the opponent is Oakwood United. ' +
  'Only set durationMinutes when the sheet states a length. Otherwise return 0. ' +
  'If the image is not a fixture list at all, say so in the summary and return no fixtures.';

const FIXTURES_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One line on what this document is. Say so plainly if it is not a fixture list.' },
    fixtures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Match date as YYYY-MM-DD' },
          time: { type: 'string', description: 'Kickoff as 24-hour HH:mm, or empty string if the sheet does not give one' },
          opponent: { type: 'string', description: 'The other team, exactly as written' },
          venue: { type: 'string', enum: ['home', 'away', 'neutral'] },
          competition: { type: 'string', description: 'Competition or division as printed, or empty string' },
          location: { type: 'string', description: 'Ground or pitch if given, or empty string' },
          durationMinutes: { type: 'integer', description: 'Total minutes only if the sheet states it, otherwise 0' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['date', 'time', 'opponent', 'venue', 'competition', 'location', 'durationMinutes', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'fixtures'],
  additionalProperties: false,
} as const;

const CLIP_SCHEMA = {
  type: 'object',
  properties: {
    rating: { type: 'integer' },
    headline: { type: 'string' },
    whatHappened: { type: 'string' },
    didWell: { type: 'array', items: { type: 'string' } },
    improve: {
      type: 'array',
      items: {
        type: 'object',
        properties: { point: { type: 'string' }, why: { type: 'string' }, drill: { type: 'string' } },
        required: ['point', 'why', 'drill'],
        additionalProperties: false,
      },
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    caveat: { type: 'string' },
  },
  required: ['rating', 'headline', 'whatHappened', 'didWell', 'improve', 'confidence', 'caveat'],
  additionalProperties: false,
};

/** Never trust length or content of anything the client sends. */
function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  const ok = origin && (allowed.includes('*') || allowed.includes(origin));
  return {
    'Access-Control-Allow-Origin': ok ? (origin as string) : allowed[0] ?? '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'content-type': 'application/json' },
  });
}

/** One counter per IP per UTC day; the key expires on its own. */
async function checkRateLimit(request: Request, env: Env): Promise<{ ok: boolean; used: number; limit: number }> {
  const limit = Number(env.DAILY_LIMIT ?? DEFAULT_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT;
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  const key = `rl:${day}:${ip}`;

  const current = Number((await env.RATE_LIMIT.get(key)) ?? '0');
  if (current >= limit) return { ok: false, used: current, limit };

  // 48h TTL comfortably covers the day boundary in any timezone.
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 60 * 60 * 48 });
  return { ok: true, used: current + 1, limit };
}

async function callGemini(
  env: Env,
  model: string,
  parts: unknown[],
  system: string,
  schema: unknown,
  maxOutputTokens?: number,
) {
  const response = await postToGemini(env, model, parts, system, schema, maxOutputTokens);

  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw Object.assign(new Error(body.error?.message ?? `Gemini returned ${response.status}`), {
      status: response.status,
      code: 'upstream',
    });
  }

  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  const finish = candidate?.finishReason ?? '';

  // A long answer that runs out of room comes back as valid-looking but truncated
  // JSON, which then fails to parse for reasons the parse error cannot explain.
  if (finish === 'MAX_TOKENS') {
    throw Object.assign(new Error('Ran out of room before finishing.'), { code: 'truncated' });
  }
  if (!text) {
    throw Object.assign(new Error(`Empty response (finishReason ${finish || 'none'}).`), {
      code: finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' ? 'blocked' : 'empty',
    });
  }

  const cleaned = text.trim().startsWith('```')
    ? text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
    : text.trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw Object.assign(new Error('The reply was not usable JSON.'), { code: 'badjson' });
  }
}

function postToGemini(
  env: Env,
  model: string,
  parts: unknown[],
  system: string,
  schema: unknown,
  maxOutputTokens?: number,
): Promise<Response> {
  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    responseJsonSchema: schema,
  };
  if (maxOutputTokens) generationConfig.maxOutputTokens = maxOutputTokens;

  return fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig,
    }),
    // A backstop only. The app gives up at 90s and its message is the one worth
    // showing, so this must never fire first - a 75s limit here cut off reads
    // that were merely slow and reported them as a failure.
    signal: AbortSignal.timeout(120_000),
  });
}

/** The model to use, discovered once and cached so a rename doesn't break the app. */
async function pickModel(env: Env): Promise<string> {
  const cached = await env.RATE_LIMIT.get('model:gemini');
  if (cached) return cached;

  const response = await fetch(`${API}/models`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
  const body = (await response.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
  const usable = (body.models ?? [])
    .map((m) => (m.name ?? '').replace(/^models\//, ''))
    .filter((id) => id && !/embedding|aqa|imagen|veo|tts|audio|image-generation|learnlm|gemma/i.test(id))
    .filter((id) => /flash|lite/i.test(id))
    .sort((a, b) => {
      const version = (id: string) => {
        const m = id.match(/(\d+)\.?(\d+)?/);
        return m ? Number(m[1]) * 100 + Number(m[2] ?? 0) : 0;
      };
      return version(b) - version(a);
    });

  const pick = usable[0];
  if (!pick) throw new Error('No usable Gemini model is available to this key.');
  await env.RATE_LIMIT.put('model:gemini', pick, { expirationTtl: 60 * 60 * 24 });
  return pick;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin');
    const headers = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, headers);

    const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
    if (!allowed.includes('*') && (!origin || !allowed.includes(origin))) {
      return json({ error: 'This coach only serves the Matchday app.' }, 403, headers);
    }

    const length = Number(request.headers.get('content-length') ?? '0');
    if (length > MAX_BODY_BYTES) {
      return json({ error: 'That clip is too big. Trim it to the passage of play you want looked at.' }, 413, headers);
    }

    const limit = await checkRateLimit(request, env);
    if (!limit.ok) {
      return json(
        {
          error: `That's the ${limit.limit} free coach requests for today. It resets tomorrow, or add your own free Gemini key in Setup for unlimited use.`,
          rateLimited: true,
        },
        429,
        headers,
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: 'Bad request.' }, 400, headers);
    }

    try {
      const model = await pickModel(env);
      const url = new URL(request.url);

      if (url.pathname.endsWith('/drills')) {
        const player = clean(payload.player, 500);
        const ask = clean(payload.ask, 500);
        if (!ask) return json({ error: 'Say what you want to work on.' }, 400, headers);
        const result = await callGemini(
          env,
          model,
          [{ text: `${player}\n\nWhat they want to work on: ${ask}` }],
          DRILLS_SYSTEM,
          DRILL_SCHEMA,
        );
        return json({ result, used: limit.used, limit: limit.limit }, 200, headers);
      }

      if (url.pathname.endsWith('/clip')) {
        const prompt = clean(payload.prompt, 2000);
        const media = Array.isArray(payload.media) ? payload.media : [];
        if (media.length === 0) return json({ error: 'No clip was sent.' }, 400, headers);
        if (media.length > 20) return json({ error: 'Too many frames.' }, 400, headers);

        const parts: unknown[] = [];
        for (const item of media as { mimeType?: unknown; data?: unknown; label?: unknown }[]) {
          const mimeType = clean(item.mimeType, 60);
          const data = typeof item.data === 'string' ? item.data : '';
          if (!data || !/^(image|video)\//.test(mimeType)) {
            return json({ error: 'That file type is not supported.' }, 400, headers);
          }
          const label = clean(item.label, 40);
          if (label) parts.push({ text: label });
          parts.push({ inlineData: { mimeType, data } });
        }
        parts.push({ text: prompt });

        const sawVideo = (media as { mimeType?: string }[]).some((m) => String(m.mimeType).startsWith('video/'));
        const result = await callGemini(env, model, parts, clipSystem(sawVideo), CLIP_SCHEMA);
        return json({ result, used: limit.used, limit: limit.limit }, 200, headers);
      }

      if (url.pathname.endsWith('/fixtures')) {
        const prompt = clean(payload.prompt, 2000);
        const media = Array.isArray(payload.media) ? payload.media : [];
        if (media.length === 0) return json({ error: 'No schedule was sent.' }, 400, headers);
        if (media.length > 8) return json({ error: 'Too many pages at once.' }, 400, headers);

        const parts: unknown[] = [];
        for (const item of media as { mimeType?: unknown; data?: unknown }[]) {
          const mimeType = clean(item.mimeType, 60);
          const data = typeof item.data === 'string' ? item.data : '';
          if (!data || !(/^image\//.test(mimeType) || mimeType === 'application/pdf')) {
            return json({ error: 'Send a photo, a screenshot or a PDF of the schedule.' }, 400, headers);
          }
          parts.push({ inlineData: { mimeType, data } });
        }
        parts.push({ text: prompt });

        const result = await callGemini(env, model, parts, FIXTURES_SYSTEM, FIXTURES_SCHEMA, 16_384);
        return json({ result, used: limit.used, limit: limit.limit }, 200, headers);
      }

      return json({ error: 'Unknown endpoint.' }, 404, headers);
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500;
      const name = (error as { name?: string }).name ?? '';
      const code = (error as { code?: string }).code ?? '';
      const message = error instanceof Error ? error.message : 'The coach failed.';

      // Every non-HTTP failure used to collapse into one sentence, so a timeout,
      // a truncated reply and a genuine upstream fault were indistinguishable -
      // to the reader and to anyone trying to fix it. Each says which it is, and
      // carries a short code that names the cause without leaking any detail.
      const [safe, tag] =
        status === 429
          ? ['The coach is busy right now. Try again in a minute.', 'busy']
          : name === 'TimeoutError' || name === 'AbortError'
            ? ['That took too long to read. Try a smaller picture, or one page at a time.', 'timeout']
            : code === 'truncated'
              ? ['That schedule was too long to read in one go. Try one page, or half of it.', 'truncated']
              : code === 'blocked'
                ? ['The coach would not read that image. Try a different photo.', 'blocked']
                : code === 'empty'
                  ? ['The coach read that but sent nothing back. Try again, or a clearer picture.', 'empty']
                  : code === 'badjson'
                    ? ['The coach garbled its answer. Try again.', 'badjson']
                    : status >= 500
                      // Never let an upstream error leak the key or internal detail.
                      ? ['The coach had a problem. Try again.', code === 'upstream' ? 'upstream' : 'unknown']
                      : [message.slice(0, 200), 'request'];

      return json({ error: `${safe} (${tag})`, code: tag }, status >= 400 && status < 600 ? status : 500, headers);
    }
  },
};
