// What the AI features actually do, measured from somewhere that can reach them.
//
// It exists because every earlier fix to the AI features was a guess: the app
// only ever showed "(upstream)", and nowhere those fixes were made could reach
// Google or the worker to see the real error. GitHub's runners can reach both.
//
//   GEMINI_API_KEY  optional. Probes Google directly: which models exist, what
//                   the old and new pickers choose from that list, and how each
//                   candidate really answers - status, seconds, Google's words.
//   PROXY_URL       optional. Calls the deployed worker exactly the way the app
//                   does, for every AI feature.
//
// Run with: node --experimental-strip-types worker/scripts/check-ai.mjs
// The key is never printed, and anything shaped like one is redacted.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankModels, thinkingOff } from '../src/models.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES = join(HERE, 'samples');
const API = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const KEY = process.env.GEMINI_API_KEY ?? '';
const PROXY = (process.env.PROXY_URL ?? '').replace(/\/+$/, '');
const ORIGIN = process.env.ORIGIN || 'https://akchops.github.io';
const TODAY = new Date().toISOString().slice(0, 10);
/** Only the schedule import, sent several times - reliability, not one lucky pass. */
const IMPORT_ONLY = process.env.IMPORT_ONLY === 'true';
const REPEAT = Math.max(1, Number(process.env.REPEAT || (IMPORT_ONLY ? 3 : 1)));
/** Compare media resolutions for reading the schedule, on the models import uses. */
const SPEED = process.env.SPEED === 'true';
/** Which samples and resolutions the speed comparison reads - blank level = default. */
const SPEED_FILES = (process.env.SPEED_FILES || 'schedule.jpg,schedule.pdf').split(',').map((f) => f.trim()).filter(Boolean);
const SPEED_LEVELS = (process.env.SPEED_LEVELS ?? ',MEDIUM,LOW').split(',').map((l) => l.trim().toUpperCase());

/** The sample sheet has exactly these; a read that gets them is a correct read. */
const EXPECT_FIXTURES = 8;
const EXPECT_FIRST = /riverside/i;

const sample = (file) => readFileSync(join(SAMPLES, file)).toString('base64');
const redact = (text) => String(text ?? '').replace(/AIza[0-9A-Za-z_-]{20,}/g, '[key]');
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

const rows = [];
function report(area, name, ok, detail) {
  rows.push({ area, name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${area.padEnd(7)} ${name.padEnd(40)} ${redact(detail)}`);
}

function heading(text) {
  console.log(`\n=== ${text} ${'='.repeat(Math.max(0, 70 - text.length))}`);
}

// ---------------------------------------------------------------------------
// The picker the live worker runs today, copied exactly, so the log can say
// which model production is really on.
// ---------------------------------------------------------------------------
function oldPick(models, preferLite) {
  const usable = models
    .map((m) => (m.name ?? '').replace(/^models\//, ''))
    .filter((id) => id && !/embedding|aqa|imagen|veo|tts|audio|image-generation|learnlm|gemma/i.test(id))
    .filter((id) => /flash|lite/i.test(id))
    .sort((a, b) => {
      const version = (id) => {
        const m = id.match(/(\d+)\.?(\d+)?/);
        return m ? Number(m[1]) * 100 + Number(m[2] ?? 0) : 0;
      };
      return version(b) - version(a);
    });
  return (preferLite ? usable.find((id) => /lite/i.test(id)) : undefined) ?? usable[0];
}

async function listModels() {
  const models = [];
  let token = '';
  do {
    const url = `${API}/models?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
    const response = await fetch(url, { headers: { 'x-goog-api-key': KEY } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`models list ${response.status}: ${body.error?.message ?? ''}`);
    models.push(...(body.models ?? []));
    token = body.nextPageToken ?? '';
  } while (token);
  return models;
}

async function generate(model, parts, schema, extra = {}) {
  const started = performance.now();
  try {
    const response = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, ...extra },
      }),
      signal: AbortSignal.timeout(110_000),
    });
    const body = await response.json().catch(() => ({}));
    const candidate = body.candidates?.[0];
    return {
      status: response.status,
      ms: performance.now() - started,
      error: body.error?.message ?? '',
      text: candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '',
      finish: candidate?.finishReason ?? '',
      thoughts: body.usageMetadata?.thoughtsTokenCount ?? 0,
    };
  } catch (error) {
    return { status: 0, ms: performance.now() - started, error: `${error.name}: ${error.message}`, text: '', finish: '', thoughts: 0 };
  }
}

function describe(result) {
  const bits = [`${result.status || 'no reply'}`, secs(result.ms)];
  if (result.thoughts) bits.push(`thought ${result.thoughts} tokens`);
  if (result.finish && result.finish !== 'STOP') bits.push(`finish ${result.finish}`);
  if (result.error) bits.push(`"${result.error.slice(0, 220)}"`);
  return bits.join(' · ');
}

function readFixtures(text) {
  try {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed.fixtures) ? parsed.fixtures : [];
    return { count: list.length, first: String(list[0]?.opponent ?? '') };
  } catch {
    return { count: -1, first: '' };
  }
}

const TINY_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
const FIX_SCHEMA = {
  type: 'object',
  properties: {
    fixtures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          time: { type: 'string' },
          opponent: { type: 'string' },
          venue: { type: 'string', enum: ['home', 'away', 'neutral'] },
        },
        required: ['date', 'opponent'],
      },
    },
  },
  required: ['fixtures'],
};
const COACH_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    drills: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, minutes: { type: 'integer' }, how: { type: 'string' } },
        required: ['name', 'minutes', 'how'],
      },
    },
  },
  required: ['title', 'drills'],
};
const CLIP_SCHEMA = {
  type: 'object',
  properties: { rating: { type: 'integer' }, headline: { type: 'string' } },
  required: ['rating', 'headline'],
};
const CLIP_PROMPT = 'Rate the goalkeeper in yellow on positioning, 1 to 100, and give a one-line headline.';
const COACH_PROMPT =
  'Plan a 30-minute handling session for a U16 goalkeeper who spills crosses. Three drills, each with how to run it.';
const FIX_PROMPT = [
  `Today's date is ${TODAY}.`,
  'The player turns out for: Oakwood Rangers U16. The opponent is the other side.',
  'Read every fixture in this document. Dates as YYYY-MM-DD, kickoff as HH:mm or empty.',
].join('\n');

async function checkGoogle() {
  heading('Google: which models exist');
  let models;
  try {
    models = await listModels();
  } catch (error) {
    report('google', 'list models', false, error.message);
    return;
  }
  report('google', 'list models', true, `${models.length} models`);

  for (const m of models) {
    const id = (m.name ?? '').replace(/^models\//, '');
    if (!/flash|lite/i.test(id)) continue;
    const text = (m.supportedGenerationMethods ?? []).includes('generateContent') ? 'text' : '----';
    console.log(`        ${text}  ${id}${m.thinking ? '  (thinking)' : ''}`);
  }

  heading('Which model each picker chooses from that list');
  const before = { standard: oldPick(models, false), fast: oldPick(models, true) };
  const after = { standard: rankModels(models, 'standard'), fast: rankModels(models, 'fast') };
  console.log(`  live worker today : coach/clip = ${before.standard}   import = ${before.fast}`);
  console.log(`  new picker        : coach/clip = ${after.standard.slice(0, 3).join(' > ')}`);
  console.log(`                      import     = ${after.fast.slice(0, 3).join(' > ')}`);
  report('google', 'new picker finds a coach model', after.standard.length > 0, after.standard[0] ?? 'none');
  report('google', 'new picker finds an import model', after.fast.length > 0, after.fast[0] ?? 'none');

  heading('Google: does each stable model answer at all');
  const listed = new Set(models.map((m) => (m.name ?? '').replace(/^models\//, '')));
  const stable = [...new Set([...after.standard, ...after.fast])].filter((id) => /^gemini-\d/.test(id) && !/preview/.test(id));
  const healthy = [];
  for (const id of SPEED ? [] : stable.slice(0, 10)) {
    const result = await generate(id, [{ text: 'Reply with ok set to true.' }], TINY_SCHEMA);
    const tag = [id === before.standard || id === before.fast ? 'LIVE NOW' : '', after.standard[0] === id || after.fast[0] === id ? 'NEW PICK' : '']
      .filter(Boolean)
      .join('+');
    report('google', `${id}${tag ? ` [${tag}]` : ''}`, result.status === 200, describe(result));
    if (result.status === 200) healthy.push({ id, ms: result.ms });
  }

  // The full workload goes to whichever model is named in FOCUS, or else the
  // fastest one that just answered - so a future run tests the model that is
  // actually worth switching to, without anyone having to know its name.
  const focus = (process.env.FOCUS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id && listed.has(id));
  if (focus.length === 0 && healthy.length > 0 && !SPEED) focus.push(healthy.sort((a, b) => a.ms - b.ms)[0].id);
  for (const id of focus) await workload(id);
  if (SPEED) await mediaResolution(listed);
}

/**
 * Fewer tokens per picture is the one speed lever that costs nothing - but a
 * schedule is small print, so it only counts if every fixture still comes back.
 */
async function mediaResolution(listed) {
  const files = SPEED_FILES.map((file) => [
    file,
    [{ inlineData: { mimeType: file.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg', data: sample(file) } }, { text: FIX_PROMPT }],
  ]);
  for (const id of ['gemini-3.6-flash', 'gemini-3.5-flash-lite'].filter((m) => listed.has(m))) {
    heading(`Google: media resolution on ${id}`);
    for (const level of SPEED_LEVELS) {
      for (const [file, parts] of files) {
        const extra = { ...thinkingOff(id), ...(level ? { mediaResolution: `MEDIA_RESOLUTION_${level}` } : {}) };
        const result = await generate(id, parts, FIX_SCHEMA, extra);
        const read = readFixtures(result.text);
        const correct = result.status === 200 && read.count === EXPECT_FIXTURES && EXPECT_FIRST.test(read.first);
        report('google', `${id} ${file}, ${level ? level.toLowerCase() : 'default'}`, correct, `${describe(result)} · read ${read.count}/${EXPECT_FIXTURES}`);
      }
    }
  }
}

/** Every job the app gives a model, with each thinking setting worth comparing. */
async function workload(id) {
  heading(`Google: the full workload on ${id}`);
  const major = Number(/^gemini-(\d+)/.exec(id)?.[1] ?? 0);
  const variants =
    major >= 3
      ? [['as is', {}], ['thinking low', { thinkingConfig: { thinkingLevel: 'low' } }], ['thinking minimal', { thinkingConfig: { thinkingLevel: 'minimal' } }]]
      : [['as is', {}], ['thinking off', thinkingOff(id)]];

  const photo = [{ inlineData: { mimeType: 'image/jpeg', data: sample('schedule.jpg') } }, { text: FIX_PROMPT }];
  const pdf = [{ inlineData: { mimeType: 'application/pdf', data: sample('schedule.pdf') } }, { text: FIX_PROMPT }];

  let best = null;
  for (const [label, extra] of variants) {
    const result = await generate(id, photo, FIX_SCHEMA, extra);
    const read = readFixtures(result.text);
    const correct = result.status === 200 && read.count === EXPECT_FIXTURES && EXPECT_FIRST.test(read.first);
    report('google', `${id} photo, ${label}`, correct, `${describe(result)} · read ${read.count}/${EXPECT_FIXTURES}`);
    if (correct && (!best || result.ms < best.ms)) best = { label, extra, ms: result.ms };
  }

  const pdfSetting = best ?? { label: 'as is', extra: {} };
  {
    const result = await generate(id, pdf, FIX_SCHEMA, pdfSetting.extra);
    const read = readFixtures(result.text);
    const correct = result.status === 200 && read.count === EXPECT_FIXTURES && EXPECT_FIRST.test(read.first);
    report('google', `${id} PDF, ${pdfSetting.label}`, correct, `${describe(result)} · read ${read.count}/${EXPECT_FIXTURES}`);
  }

  for (const [label, extra] of variants.slice(0, 2)) {
    const result = await generate(id, [{ text: COACH_PROMPT }], COACH_SCHEMA, extra);
    let drills = 0;
    try {
      drills = JSON.parse(result.text).drills?.length ?? 0;
    } catch {
      // counted as no drills
    }
    report('google', `${id} coach, ${label}`, result.status === 200 && drills > 0, `${describe(result)} · ${drills} drills`);
  }

  const frames = ['frame-1.jpg', 'frame-2.jpg', 'frame-3.jpg'].flatMap((file, i) => [
    { text: `Frame at 0:0${i}` },
    { inlineData: { mimeType: 'image/jpeg', data: sample(file) } },
  ]);
  for (const [label, parts] of [
    ['clip frames', [...frames, { text: CLIP_PROMPT }]],
    ['clip video', [{ inlineData: { mimeType: 'video/webm', data: sample('clip.webm') } }, { text: CLIP_PROMPT }]],
  ]) {
    const result = await generate(id, parts, CLIP_SCHEMA);
    let rating = 0;
    try {
      rating = Number(JSON.parse(result.text).rating) || 0;
    } catch {
      // counted as no rating
    }
    report('google', `${id} ${label}`, result.status === 200 && rating > 0, `${describe(result)} · rating ${rating}`);
  }
}

// ---------------------------------------------------------------------------
// The live worker, called with the same payloads the app sends.
// ---------------------------------------------------------------------------
async function callWorker(path, payload) {
  const started = performance.now();
  try {
    const response = await fetch(`${PROXY}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(130_000),
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, ms: performance.now() - started, body };
  } catch (error) {
    return { status: 0, ms: performance.now() - started, body: { error: `${error.name}: ${error.message}` } };
  }
}

function workerDetail(result, extra = '') {
  const bits = [`${result.status || 'no reply'}`, secs(result.ms)];
  if (result.body.model) bits.push(result.body.model);
  if (extra) bits.push(extra);
  if (result.body.error) bits.push(`"${String(result.body.error).slice(0, 220)}"`);
  return bits.join(' · ');
}

async function checkWorker() {
  heading(`Live worker: ${PROXY}`);
  const player = 'Position: GK (Goalkeeper)\nAge group: U16';

  if (!IMPORT_ONLY) {
    const drills = await callWorker('/drills', { player, ask: 'one short warm-up for handling crosses' });
    report('worker', 'Coach (/drills)', drills.status === 200 && Boolean(drills.body.result), workerDetail(drills));
  }

  const fixturesPrompt = [
    `Today's date is ${TODAY}.`,
    'The player turns out for: Oakwood Rangers U16. Any of these appearing in a row is their own team, so the opponent is the other side.',
    '',
    'Read every fixture in this document.',
  ].join('\n');
  const imports = [
    ...Array.from({ length: REPEAT }, (_, i) => [`Import photo ${i + 1}/${REPEAT} (/fixtures)`, 'schedule.jpg', 'image/jpeg']),
    ['Import PDF (/fixtures)', 'schedule.pdf', 'application/pdf'],
  ];
  for (const [label, file, mimeType] of imports) {
    const result = await callWorker('/fixtures', { prompt: fixturesPrompt, media: [{ mimeType, data: sample(file) }] });
    const list = Array.isArray(result.body.result?.fixtures) ? result.body.result.fixtures : [];
    const correct = result.status === 200 && list.length === EXPECT_FIXTURES && EXPECT_FIRST.test(String(list[0]?.opponent ?? ''));
    report('worker', label, correct, workerDetail(result, `read ${list.length}/${EXPECT_FIXTURES}`));
  }

  if (IMPORT_ONLY) return;

  const clipPrompt = (shown) => [player, '', 'Which player they are: the goalkeeper in yellow', '', shown].join('\n');
  const frames = await callWorker('/clip', {
    prompt: clipPrompt('These 3 frames are stills taken in order from one short clip. Judge only this passage of play.'),
    media: ['frame-1.jpg', 'frame-2.jpg', 'frame-3.jpg'].map((file, i) => ({
      mimeType: 'image/jpeg',
      data: sample(file),
      label: `Frame at 0:0${i}`,
    })),
  });
  report('worker', 'Clip as frames (/clip)', frames.status === 200 && Boolean(frames.body.result), workerDetail(frames));

  const video = await callWorker('/clip', {
    prompt: clipPrompt('This is one short clip. Judge only this passage of play.'),
    media: [{ mimeType: 'video/webm', data: sample('clip.webm') }],
  });
  report('worker', 'Clip as video (/clip)', video.status === 200 && Boolean(video.body.result), workerDetail(video));
}

// ---------------------------------------------------------------------------

if (KEY) await checkGoogle();
else console.log('\n(no GEMINI_API_KEY: skipping the direct Google checks)');

if (PROXY) await checkWorker();
else console.log('\n(no PROXY_URL: skipping the live worker checks)');

heading('Summary');
const failed = rows.filter((r) => !r.ok);
console.log(`${rows.length - failed.length} passed, ${failed.length} failed`);
for (const r of failed) console.log(`  failed: ${r.area} ${r.name}`);
process.exitCode = failed.length > 0 ? 1 : 0;
