import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import type { Profile } from '../types';
import {
  CLIP_SCHEMA, DRILLS_SYSTEM, DRILL_SCHEMA, clampRating, clipPrompt, clipSystem, playerLine,
  type ClipAnalysis, type DrillPlan,
} from './aiTypes';
import type { Frame } from './frames';
import { formatClock } from './frames';
import { getApiKey, getModel } from './apiKey';

export const CLAUDE_DEFAULT_MODEL = 'claude-opus-5';

function client(): Anthropic {
  const apiKey = getApiKey('claude').trim();
  if (!apiKey) throw new Error('No Claude key set. Add one in Setup to use the coach.');
  // The key lives on this device only; the SDK adds the direct-browser-access header.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

function model(): string {
  return getModel('claude') || CLAUDE_DEFAULT_MODEL;
}

export function describeClaudeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'That Claude key was rejected. Check it in Setup — it should start with "sk-ant-".';
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return 'That key does not have access to this model. Check its permissions in the Anthropic console.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Too many requests just now, or the account is out of credit. Wait a moment and try again.';
  }
  if (error instanceof Anthropic.BadRequestError) {
    return `The request was rejected: ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'Could not reach Claude. Check your internet — this is the one part of the app that needs signal.';
  }
  if (error instanceof Anthropic.APIError) {
    return `AI error ${error.status}: ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export async function claudeDrills(profile: Profile, ask: string): Promise<DrillPlan> {
  const message = await client().messages.parse({
    model: model(),
    max_tokens: 8000,
    // Opus 5 thinks adaptively by default - no thinking parameter needed.
    system: DRILLS_SYSTEM,
    messages: [{ role: 'user', content: `${playerLine(profile)}\n\nWhat they want to work on: ${ask}` }],
    output_config: { format: jsonSchemaOutputFormat(DRILL_SCHEMA) },
  });
  if (!message.parsed_output) throw new Error('The coach did not return a usable session. Try rewording it.');
  return message.parsed_output as DrillPlan;
}

export async function claudeClipFromFrames(
  profile: Profile,
  frames: Frame[],
  whichPlayer: string,
  context: string,
): Promise<ClipAnalysis> {
  const content: Anthropic.ContentBlockParam[] = [];
  for (const frame of frames) {
    content.push({ type: 'text', text: `Frame at ${formatClock(frame.at)}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frame.data } });
  }
  content.push({
    type: 'text',
    text: clipPrompt(
      profile,
      whichPlayer,
      context,
      `These ${frames.length} frames are stills taken in order from one short clip. Judge only this passage of play.`,
    ),
  });

  const message = await client().messages.parse({
    model: model(),
    max_tokens: 8000,
    system: clipSystem(false),
    messages: [{ role: 'user', content }],
    output_config: { format: jsonSchemaOutputFormat(CLIP_SCHEMA) },
  });
  if (!message.parsed_output) throw new Error('The coach could not read that clip. Try a shorter or clearer one.');
  return clampRating(message.parsed_output as ClipAnalysis);
}
