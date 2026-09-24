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
import { rankModels } from '../src/models.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES = join(HERE, 'samples');
const API = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const KEY = process.env.GEMINI_API_KEY ?? '';
const PROXY = (process.env.PROXY_URL ?? '').replace(/\/+$/, '');
const ORIGIN = process.env.ORIGIN || 'https://akchops.github.io';
const TODAY = new Date().toISOString().slice(0, 10);

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

  heading('Google: does each candidate answer at all');
  const probe = [...new Set([before.standard, before.fast, ...after.standard.slice(0, 2), ...after.fast.slice(0, 2)])]
    .filter(Boolean)
    .slice(0, 5);
  for (const id of probe) {
    const result = await generate(id, [{ text: 'Reply with ok set to true.' }], TINY_SCHEMA);
    const tag = [id === before.standard || id === before.fast ? 'LIVE NOW' : '', after.standard[0] === id || after.fast[0] === id ? 'NEW PICK' : '']
      .filter(Boolean)
      .join('+');
    report('google', `${id}${tag ? ` [${tag}]` : ''}`, result.status === 200, describe(result));
  }

  heading('Google: reading the sample schedule');
  const photo = [{ inlineData: { mimeType: 'image/jpeg', data: sample('schedule.jpg') } }, { text: FIX_PROMPT }];
  const importers = [...new Set([after.fast[0], before.fast])].filter(Boolean).slice(0, 2);
  for (const id of importers) {
    const variants = [['as is', {}], ['thinking budget 0', { thinkingConfig: { thinkingBudget: 0 } }]];
    if (Number((/gemini-(\d+)/.exec(id) ?? [])[1] ?? 0) >= 3) {
      variants.push(['thinking level minimal', { thinkingConfig: { thinkingLevel: 'minimal' } }]);
    }
    for (const [label, extra] of variants) {
      const result = await generate(id, photo, FIX_SCHEMA, extra);
      const read = readFixtures(result.text);
      const correct = result.status === 200 && read.count === EXPECT_FIXTURES && EXPECT_FIRST.test(read.first);
      report('google', `${id} photo, ${label}`, correct, `${describe(result)} · read ${read.count}/${EXPECT_FIXTURES}`);
    }
  }

  if (after.fast[0]) {
    const pdf = [{ inlineData: { mimeType: 'application/pdf', data: sample('schedule.pdf') } }, { text: FIX_PROMPT }];
    const result = await generate(after.fast[0], pdf, FIX_SCHEMA);
    const read = readFixtures(result.text);
    const correct = result.status === 200 && read.count === EXPECT_FIXTURES && EXPECT_FIRST.test(read.first);
    report('google', `${after.fast[0]} PDF, as is`, correct, `${describe(result)} · read ${read.count}/${EXPECT_FIXTURES}`);
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

  const drills = await callWorker('/drills', { player, ask: 'one short warm-up for handling crosses' });
  report('worker', 'Coach (/drills)', drills.status === 200 && Boolean(drills.body.result), workerDetail(drills));

  const fixturesPrompt = [
    `Today's date is ${TODAY}.`,
    'The player turns out for: Oakwood Rangers U16. Any of these appearing in a row is their own team, so the opponent is the other side.',
    '',
    'Read every fixture in this document.',
  ].join('\n');
  for (const [label, file, mimeType] of [
    ['Import photo (/fixtures)', 'schedule.jpg', 'image/jpeg'],
    ['Import PDF (/fixtures)', 'schedule.pdf', 'application/pdf'],
  ]) {
    const result = await callWorker('/fixtures', { prompt: fixturesPrompt, media: [{ mimeType, data: sample(file) }] });
    const list = Array.isArray(result.body.result?.fixtures) ? result.body.result.fixtures : [];
    const correct = result.status === 200 && list.length === EXPECT_FIXTURES && EXPECT_FIRST.test(String(list[0]?.opponent ?? ''));
    report('worker', label, correct, workerDetail(result, `read ${list.length}/${EXPECT_FIXTURES}`));
  }

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
