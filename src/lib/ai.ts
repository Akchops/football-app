import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { POSITION_GROUP_LABEL, type Profile } from '../types';
import type { Frame } from './frames';
import { formatClock } from './frames';
import { getApiKey } from './apiKey';

/** Opus 5 - the strongest model for reading a sequence of frames and coaching from it. */
const MODEL = 'claude-opus-5';

function client(): Anthropic {
  const apiKey = getApiKey().trim();
  if (!apiKey) throw new Error('No API key set. Add one in Setup to use the coach.');
  // The key lives on this device only; the SDK adds the direct-browser-access header.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

function playerLine(profile: Profile): string {
  return [
    profile.name ? `Name: ${profile.name}` : null,
    `Position: ${profile.position} (${POSITION_GROUP_LABEL[profile.positionGroup]})`,
    profile.ageGroup ? `Age group: ${profile.ageGroup}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Turns an SDK error into something worth showing a teenager. */
export function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'That API key was rejected. Check it in Setup — it should start with "sk-ant-".';
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return 'That key does not have access to this model. Check the key’s permissions in the Anthropic console.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Too many requests just now, or the account is out of credit. Wait a moment and try again.';
  }
  if (error instanceof Anthropic.BadRequestError) {
    return `The request was rejected: ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'Could not reach the AI. Check your internet connection — this is the one part of the app that needs signal.';
  }
  if (error instanceof Anthropic.APIError) {
    return `AI error ${error.status}: ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

// ---------------------------------------------------------------- drills

export interface DrillPlan {
  title: string;
  focus: string;
  warmup: string[];
  drills: { name: string; setup: string; reps: string; coaching: string }[];
  progression: string;
  kit: string[];
}

const DRILL_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short name for the session' },
    focus: { type: 'string', description: 'One sentence on what this session develops' },
    warmup: { type: 'array', items: { type: 'string' }, description: '2-4 warm-up steps' },
    drills: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          setup: { type: 'string', description: 'What to lay out, in plain language' },
          reps: { type: 'string', description: 'Sets, reps or time' },
          coaching: { type: 'string', description: 'The one cue that matters most' },
        },
        required: ['name', 'setup', 'reps', 'coaching'],
        additionalProperties: false,
      },
      description: '3-5 drills',
    },
    progression: { type: 'string', description: 'How to make it harder next time' },
    kit: { type: 'array', items: { type: 'string' }, description: 'Equipment needed' },
  },
  required: ['title', 'focus', 'warmup', 'drills', 'progression', 'kit'],
  additionalProperties: false,
} as const;

export async function requestDrills(profile: Profile, ask: string): Promise<DrillPlan> {
  const message = await client().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    // Opus 5 thinks adaptively by default - no thinking parameter needed.
    system: [
      'You are an experienced football coach writing a training session for one player.',
      'Design drills that can be done realistically: a garden, a park, or a quiet corner of a training pitch, with everyday kit (cones, a ball, a wall, a friend to serve).',
      'Be specific and physical - what to set up, how many, what the player should feel. One coaching cue per drill, not a list.',
      'Match the intensity to the age group. Never suggest anything that risks injury for a young player.',
      'Write in plain British English a teenager would actually follow.',
    ].join(' '),
    messages: [
      {
        role: 'user',
        content: `${playerLine(profile)}\n\nWhat they want to work on: ${ask}`,
      },
    ],
    output_config: { format: jsonSchemaOutputFormat(DRILL_SCHEMA) },
  });

  if (!message.parsed_output) throw new Error('The coach did not return a usable session. Try rewording it.');
  return message.parsed_output as DrillPlan;
}

// ---------------------------------------------------------------- clip analysis

export interface ClipAnalysis {
  rating: number;
  headline: string;
  whatHappened: string;
  didWell: string[];
  improve: { point: string; why: string; drill: string }[];
  confidence: 'high' | 'medium' | 'low';
  caveat: string;
}

const CLIP_SCHEMA = {
  type: 'object',
  properties: {
    rating: { type: 'integer', description: 'Performance in this clip out of 100' },
    headline: { type: 'string', description: 'A few words summing the clip up' },
    whatHappened: { type: 'string', description: 'What you can actually see happening, in 2-3 sentences' },
    didWell: { type: 'array', items: { type: 'string' }, description: '1-3 things done well' },
    improve: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          point: { type: 'string', description: 'What to change' },
          why: { type: 'string', description: 'Why it matters' },
          drill: { type: 'string', description: 'One drill that fixes it' },
        },
        required: ['point', 'why', 'drill'],
        additionalProperties: false,
      },
      description: '1-3 improvements',
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'How clearly the player and action could be seen' },
    caveat: { type: 'string', description: 'What could not be judged from these frames' },
  },
  required: ['rating', 'headline', 'whatHappened', 'didWell', 'improve', 'confidence', 'caveat'],
  additionalProperties: false,
} as const;

export async function analyseClip(
  profile: Profile,
  frames: Frame[],
  whichPlayer: string,
  context: string,
): Promise<ClipAnalysis> {
  const content: Anthropic.ContentBlockParam[] = [];

  for (const frame of frames) {
    content.push({ type: 'text', text: `Frame at ${formatClock(frame.at)}` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: frame.data },
    });
  }

  content.push({
    type: 'text',
    text: [
      `${playerLine(profile)}`,
      ``,
      `Which player they are: ${whichPlayer}`,
      context ? `Context for the clip: ${context}` : '',
      ``,
      `These ${frames.length} frames are stills taken in order from one short clip. Judge only this passage of play.`,
    ]
      .filter(Boolean)
      .join('\n'),
  });

  const message = await client().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: [
      'You are a football coach reviewing a short clip with a young player.',
      'You are shown still frames sampled in order from the clip - not the full video. Movement between frames has to be inferred, so say plainly when something cannot be judged.',
      'Judge only what is visible: body shape, starting position, footwork, decision, angle to the ball, set position, handling.',
      'If you cannot confidently pick out the described player, say so in the caveat and set confidence to low rather than guessing.',
      'Rate this passage of play out of 100 - be fair and encouraging but honest; a routine, competent action is around 60-70.',
      'Give concrete, physical coaching, never vague advice like "concentrate more". Plain British English for a teenager.',
    ].join(' '),
    messages: [{ role: 'user', content }],
    output_config: { format: jsonSchemaOutputFormat(CLIP_SCHEMA) },
  });

  if (!message.parsed_output) throw new Error('The coach could not read that clip. Try a shorter or clearer one.');
  const parsed = message.parsed_output as ClipAnalysis;
  return { ...parsed, rating: Math.max(1, Math.min(100, Math.round(parsed.rating))) };
}

/** Rough cost signal so nobody is surprised by the bill. */
export function estimateClipCost(frameCount: number): string {
  // ~1.1k tokens per 768px frame, plus prompt and output, at Opus 5 rates.
  const inputTokens = frameCount * 1100 + 1200;
  const cost = (inputTokens / 1_000_000) * 5 + (900 / 1_000_000) * 25;
  return `about $${cost.toFixed(2)}`;
}
