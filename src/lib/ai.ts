import type { Profile } from '../types';
import type { ClipAnalysis, DrillPlan } from './aiTypes';
import type { FixtureRead } from './fixtures';
import { getProvider, hasApiKey } from './apiKey';
import { extractFrames, type Frame } from './frames';
import { proxyAvailable, sharedUsage as sharedUsageSnapshot } from './proxy';

export type { ClipAnalysis, DrillPlan, Provider } from './aiTypes';
export type { FixtureRead, ParsedFixture, ReviewRow } from './fixtures';
export { PROVIDER_LABEL } from './aiTypes';
export { ProxyLimitError, proxyAvailable, sharedUsage } from './proxy';

/**
 * Personal key wins when there is one - it has its own quota. Otherwise the
 * shared coach is used, so the app works with no setup at all.
 */
export function usingSharedCoach(): boolean {
  return proxyAvailable() && !hasApiKey();
}

/** Whether the coach can be used at all right now. */
export function coachReady(): boolean {
  return usingSharedCoach() || hasApiKey();
}

/** How the clip was actually read, so the UI can say so. */
export type ClipMode = 'video' | 'frames';

export interface ClipRun {
  analysis: ClipAnalysis;
  mode: ClipMode;
  frameCount: number;
}

export async function requestDrills(profile: Profile, ask: string): Promise<DrillPlan> {
  if (usingSharedCoach()) {
    const { proxyDrills } = await import('./proxy');
    return proxyDrills(profile, ask);
  }
  if (getProvider() === 'claude') {
    const { claudeDrills } = await import('./claude');
    return claudeDrills(profile, ask);
  }
  const { geminiDrills } = await import('./gemini');
  return geminiDrills(profile, ask);
}

/**
 * Gemini reads video directly, so a small clip goes over whole and the coach
 * sees the movement. Claude reads images, so the clip becomes stills first.
 */
export async function analyseClipBlob(
  profile: Profile,
  video: Blob,
  whichPlayer: string,
  context: string,
  onProgress?: (message: string) => void,
): Promise<ClipRun> {
  if (usingSharedCoach()) {
    const { proxyClipFromVideo, proxyClipFromFrames } = await import('./proxy');
    const { INLINE_VIDEO_LIMIT } = await import('./gemini');
    if (video.size <= INLINE_VIDEO_LIMIT) {
      onProgress?.('Sending the clip to the coach…');
      return { analysis: await proxyClipFromVideo(profile, video, whichPlayer, context), mode: 'video', frameCount: 0 };
    }
    const frames = await framesFor(video, onProgress);
    onProgress?.(`Watching ${frames.length} frames…`);
    return {
      analysis: await proxyClipFromFrames(profile, frames, whichPlayer, context),
      mode: 'frames',
      frameCount: frames.length,
    };
  }

  if (getProvider() === 'gemini') {
    const { geminiClipFromVideo, geminiClipFromFrames, INLINE_VIDEO_LIMIT } = await import('./gemini');
    if (video.size <= INLINE_VIDEO_LIMIT) {
      onProgress?.('Sending the clip to the coach…');
      return { analysis: await geminiClipFromVideo(profile, video, whichPlayer, context), mode: 'video', frameCount: 0 };
    }
    const frames = await framesFor(video, onProgress);
    onProgress?.(`Watching ${frames.length} frames…`);
    return {
      analysis: await geminiClipFromFrames(profile, frames, whichPlayer, context),
      mode: 'frames',
      frameCount: frames.length,
    };
  }

  const { claudeClipFromFrames } = await import('./claude');
  const frames = await framesFor(video, onProgress);
  onProgress?.(`Watching ${frames.length} frames…`);
  return {
    analysis: await claudeClipFromFrames(profile, frames, whichPlayer, context),
    mode: 'frames',
    frameCount: frames.length,
  };
}

async function framesFor(video: Blob, onProgress?: (message: string) => void): Promise<Frame[]> {
  onProgress?.('Reading the clip…');
  return extractFrames(video, (done, total) => onProgress?.(`Reading frame ${done} of ${total}…`));
}

/** Inline media has to stay small enough to send in one request. */
export const MAX_SCHEDULE_BYTES = 12 * 1024 * 1024;

/** Why this file cannot be read as a schedule, or empty if it can. */
export function scheduleProblem(file: File): string {
  const type = file.type || '';
  if (!type.startsWith('image/') && type !== 'application/pdf') {
    return 'Send a photo, a screenshot or a PDF of the schedule.';
  }
  if (file.size > MAX_SCHEDULE_BYTES) {
    return 'That file is too big. A screenshot or a photo of the sheet works better than a scan.';
  }
  return '';
}

/**
 * Read fixtures off a schedule someone was sent. Gemini takes a PDF directly;
 * so does Claude, as a document block - so every provider handles both.
 */
export async function readFixtures(file: File, today: string, teamNames: string[]): Promise<FixtureRead> {
  if (usingSharedCoach()) {
    const { proxyFixtures } = await import('./proxy');
    return proxyFixtures(file, today, teamNames);
  }
  if (getProvider() === 'claude') {
    const { claudeFixtures } = await import('./claude');
    return claudeFixtures(file, today, teamNames);
  }
  const { geminiFixtures } = await import('./gemini');
  return geminiFixtures(file, today, teamNames);
}

export async function describeError(error: unknown): Promise<string> {
  // Proxy errors are already written for a person to read.
  if (usingSharedCoach()) return error instanceof Error ? error.message : 'Something went wrong.';
  if (getProvider() === 'claude') {
    const { describeClaudeError } = await import('./claude');
    return describeClaudeError(error);
  }
  const { describeGeminiError } = await import('./gemini');
  return describeGeminiError(error);
}

/** Rough cost signal. Gemini's free tier costs nothing, so say so plainly. */
export function costNote(mode: ClipMode, frameCount: number): string {
  if (usingSharedCoach()) {
    const usage = sharedUsageSnapshot();
    const left = usage ? ` · ${Math.max(0, usage.limit - usage.used)} left today` : '';
    return (mode === 'video' ? 'Whole clip watched' : `${frameCount} frames`) + ` · free${left}`;
  }
  if (getProvider() === 'gemini') {
    return mode === 'video' ? 'Free on Gemini’s free tier' : `${frameCount} frames · free on Gemini’s free tier`;
  }
  const inputTokens = frameCount * 1100 + 1200;
  const cost = (inputTokens / 1_000_000) * 5 + (900 / 1_000_000) * 25;
  return `${frameCount} frames · about $${cost.toFixed(2)}`;
}
