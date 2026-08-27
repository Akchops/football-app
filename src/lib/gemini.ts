import { GoogleGenAI } from '@google/genai';
import type { Profile } from '../types';
import {
  CLIP_SCHEMA, DRILLS_SYSTEM, DRILL_SCHEMA, clampRating, clipPrompt, clipSystem, playerLine,
  type ClipAnalysis, type DrillPlan,
} from './aiTypes';
import type { Frame } from './frames';
import { formatClock } from './frames';
import { getApiKey, getModel, setModel } from './apiKey';
import { FIXTURES_SCHEMA, FIXTURES_SYSTEM, fixturesPrompt, type FixtureRead } from './fixtures';

/**
 * Gemini can read video directly, so a short clip is sent as-is rather than as
 * sampled stills. Anything bigger than this goes to frames instead, since the
 * inline request limit is around 20MB.
 */
export const INLINE_VIDEO_LIMIT = 15 * 1024 * 1024;

function client(): GoogleGenAI {
  const apiKey = getApiKey('gemini').trim();
  if (!apiKey) throw new Error('No Gemini key set. Add one in Setup to use the coach.');
  return new GoogleGenAI({ apiKey });
}

/** Models that can't hold a coaching conversation, whatever their name. */
const EXCLUDE = /embedding|aqa|imagen|veo|tts|audio|image-generation|learnlm|gemma/i;

export interface ModelChoice {
  id: string;
  label: string;
  /** Free-tier Flash models are the ones that cost nothing. */
  free: boolean;
}

function versionOf(id: string): number {
  const match = id.match(/(\d+)\.?(\d+)?/);
  if (!match) return 0;
  return Number(match[1]) * 100 + Number(match[2] ?? 0);
}

/**
 * Asks the API which models this key can actually use, rather than hardcoding
 * an id that may have been renamed or retired.
 */
export async function listModels(): Promise<ModelChoice[]> {
  const pager = await client().models.list();
  const out: ModelChoice[] = [];

  for await (const model of pager) {
    const id = (model.name ?? '').replace(/^models\//, '');
    if (!id || EXCLUDE.test(id)) continue;
    const actions = model.supportedActions ?? [];
    // Some responses omit supportedActions entirely; don't drop those.
    if (actions.length > 0 && !actions.includes('generateContent')) continue;
    out.push({ id, label: model.displayName || id, free: /flash|lite/i.test(id) });
  }

  return out.sort((a, b) => {
    if (a.free !== b.free) return a.free ? -1 : 1;
    const byVersion = versionOf(b.id) - versionOf(a.id);
    if (byVersion !== 0) return byVersion;
    return a.id.localeCompare(b.id);
  });
}

/** The stored model, or the best free one this key can reach. */
async function resolveModel(): Promise<string> {
  const stored = getModel('gemini');
  if (stored) return stored;
  const models = await listModels();
  const pick = models.find((m) => m.free) ?? models[0];
  if (!pick) throw new Error('That key cannot reach any usable Gemini model.');
  setModel('gemini', pick.id);
  return pick.id;
}

function parseJson<T>(text: string | undefined): T {
  if (!text) throw new Error('The coach returned an empty response. Try again.');
  const trimmed = text.trim();
  // Models occasionally wrap JSON in a code fence even when asked not to.
  const cleaned = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
    : trimmed;
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error('The coach returned something unreadable. Try again.');
  }
}

export function describeGeminiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/API_KEY_INVALID|API key not valid/i.test(message)) {
    return 'That Gemini key was rejected. Check it in Setup — get one free at aistudio.google.com/apikey.';
  }
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(message)) {
    return 'You have hit the free tier limit for now. It resets on its own — wait a minute and try again.';
  }
  if (/PERMISSION_DENIED|403/i.test(message)) {
    return 'That key does not have permission for this model. Pick a different model in Setup.';
  }
  if (/NOT_FOUND|404/i.test(message)) {
    return 'That model is not available to this key. Pick a different one in Setup.';
  }
  if (/SAFETY|blocked/i.test(message)) {
    return 'Gemini declined to answer that one. Try rewording it.';
  }
  if (/fetch|network|Failed to fetch/i.test(message)) {
    return 'Could not reach Gemini. Check your internet — this is the one part of the app that needs signal.';
  }
  return message;
}

export async function geminiDrills(profile: Profile, ask: string): Promise<DrillPlan> {
  const response = await client().models.generateContent({
    model: await resolveModel(),
    contents: [{ role: 'user', parts: [{ text: `${playerLine(profile)}\n\nWhat they want to work on: ${ask}` }] }],
    config: {
      systemInstruction: DRILLS_SYSTEM,
      responseMimeType: 'application/json',
      responseJsonSchema: DRILL_SCHEMA,
    },
  });
  return parseJson<DrillPlan>(response.text);
}

export async function geminiClipFromVideo(
  profile: Profile,
  video: Blob,
  whichPlayer: string,
  context: string,
): Promise<ClipAnalysis> {
  const base64 = await blobToBase64(video);
  const prompt = clipPrompt(
    profile,
    whichPlayer,
    context,
    'This is one short clip. Judge only this passage of play.',
  );

  const response = await client().models.generateContent({
    model: await resolveModel(),
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: video.type || 'video/mp4', data: base64 } },
          { text: prompt },
        ],
      },
    ],
    config: {
      systemInstruction: clipSystem(true),
      responseMimeType: 'application/json',
      responseJsonSchema: CLIP_SCHEMA,
    },
  });
  return clampRating(parseJson<ClipAnalysis>(response.text));
}

export async function geminiClipFromFrames(
  profile: Profile,
  frames: Frame[],
  whichPlayer: string,
  context: string,
): Promise<ClipAnalysis> {
  const parts = frames.flatMap((frame) => [
    { text: `Frame at ${formatClock(frame.at)}` },
    { inlineData: { mimeType: 'image/jpeg', data: frame.data } },
  ]);
  parts.push({
    text: clipPrompt(
      profile,
      whichPlayer,
      context,
      `These ${frames.length} frames are stills taken in order from one short clip. Judge only this passage of play.`,
    ),
  });

  const response = await client().models.generateContent({
    model: await resolveModel(),
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: clipSystem(false),
      responseMimeType: 'application/json',
      responseJsonSchema: CLIP_SCHEMA,
    },
  });
  return clampRating(parseJson<ClipAnalysis>(response.text));
}

export async function geminiFixtures(file: Blob, today: string, teamNames: string[]): Promise<FixtureRead> {
  const response = await client().models.generateContent({
    model: await resolveModel(),
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: file.type || 'image/jpeg', data: await blobToBase64(file) } },
          { text: fixturesPrompt(today, teamNames) },
        ],
      },
    ],
    config: {
      systemInstruction: FIXTURES_SYSTEM,
      responseMimeType: 'application/json',
      responseJsonSchema: FIXTURES_SCHEMA,
    },
  });
  return parseJson<FixtureRead>(response.text);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Could not read that video file.'));
    reader.readAsDataURL(blob);
  });
}
