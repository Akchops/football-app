import type { Profile } from '../types';
import { clipPrompt, playerLine, clampRating, type ClipAnalysis, type DrillPlan } from './aiTypes';
import type { Frame } from './frames';
import { formatClock } from './frames';
import { fixturesPrompt, type FixtureRead } from './fixtures';

/**
 * The shared coach: a small server that holds one Gemini key so players don't
 * each need their own. Baked in at build time; empty means the app falls back
 * to asking for a personal key.
 */
const PROXY_URL = (import.meta.env.VITE_AI_PROXY_URL ?? '').replace(/\/+$/, '');

export function proxyAvailable(): boolean {
  return PROXY_URL.length > 0;
}

export class ProxyLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProxyLimitError';
  }
}

export interface ProxyUsage {
  used: number;
  limit: number;
}

let lastUsage: ProxyUsage | null = null;

/** How much of today's shared allowance is gone, once something has been asked. */
export function sharedUsage(): ProxyUsage | null {
  return lastUsage;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${PROXY_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the coach. Check your internet — this is the one part of the app that needs signal.');
  }

  const payload = (await response.json().catch(() => ({}))) as {
    result?: T;
    error?: string;
    rateLimited?: boolean;
    used?: number;
    limit?: number;
  };

  if (typeof payload.used === 'number' && typeof payload.limit === 'number') {
    lastUsage = { used: payload.used, limit: payload.limit };
  }

  if (!response.ok || !payload.result) {
    const message = payload.error ?? 'The coach could not answer that.';
    if (payload.rateLimited || response.status === 429) throw new ProxyLimitError(message);
    throw new Error(message);
  }
  return payload.result;
}

export async function proxyDrills(profile: Profile, ask: string): Promise<DrillPlan> {
  return post<DrillPlan>('/drills', { player: playerLine(profile), ask });
}

export async function proxyClipFromVideo(
  profile: Profile,
  video: Blob,
  whichPlayer: string,
  context: string,
): Promise<ClipAnalysis> {
  const data = await blobToBase64(video);
  const analysis = await post<ClipAnalysis>('/clip', {
    prompt: clipPrompt(profile, whichPlayer, context, 'This is one short clip. Judge only this passage of play.'),
    media: [{ mimeType: video.type || 'video/mp4', data }],
  });
  return clampRating(analysis);
}

export async function proxyClipFromFrames(
  profile: Profile,
  frames: Frame[],
  whichPlayer: string,
  context: string,
): Promise<ClipAnalysis> {
  const analysis = await post<ClipAnalysis>('/clip', {
    prompt: clipPrompt(
      profile,
      whichPlayer,
      context,
      `These ${frames.length} frames are stills taken in order from one short clip. Judge only this passage of play.`,
    ),
    media: frames.map((frame) => ({
      mimeType: 'image/jpeg',
      data: frame.data,
      label: `Frame at ${formatClock(frame.at)}`,
    })),
  });
  return clampRating(analysis);
}

export async function proxyFixtures(file: Blob, today: string, teamNames: string[]): Promise<FixtureRead> {
  return post<FixtureRead>('/fixtures', {
    prompt: fixturesPrompt(today, teamNames),
    media: [{ mimeType: file.type || 'image/jpeg', data: await blobToBase64(file) }],
  });
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
