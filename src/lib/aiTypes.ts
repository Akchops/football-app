import { POSITION_GROUP_LABEL, type Profile } from '../types';

export type Provider = 'gemini' | 'claude';

export const PROVIDER_LABEL: Record<Provider, string> = {
  gemini: 'Google Gemini',
  claude: 'Anthropic Claude',
};

export interface DrillPlan {
  title: string;
  focus: string;
  warmup: string[];
  drills: { name: string; setup: string; reps: string; coaching: string }[];
  progression: string;
  kit: string[];
}

export interface ClipAnalysis {
  rating: number;
  headline: string;
  whatHappened: string;
  didWell: string[];
  improve: { point: string; why: string; drill: string }[];
  confidence: 'high' | 'medium' | 'low';
  caveat: string;
}

export const DRILL_SCHEMA = {
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

export const CLIP_SCHEMA = {
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
    caveat: { type: 'string', description: 'What could not be judged from what was shown' },
  },
  required: ['rating', 'headline', 'whatHappened', 'didWell', 'improve', 'confidence', 'caveat'],
  additionalProperties: false,
} as const;

export const DRILLS_SYSTEM = [
  'You are an experienced football coach writing a training session for one player.',
  'Design drills that can be done realistically: a garden, a park, or a quiet corner of a training pitch, with everyday kit (cones, a ball, a wall, a friend to serve).',
  'Be specific and physical - what to set up, how many, what the player should feel. One coaching cue per drill, not a list.',
  'Match the intensity to the age group. Never suggest anything that risks injury for a young player.',
  'Write in plain British English a teenager would actually follow.',
].join(' ');

/** `medium` is what a still-frame reviewer should cap at; full video can be more certain. */
export function clipSystem(sawVideo: boolean): string {
  return [
    'You are a football coach reviewing a short clip with a young player.',
    sawVideo
      ? 'You are watching the clip itself, so movement, timing and footwork are all visible.'
      : 'You are shown still frames sampled in order from the clip - not the full video. Movement between frames has to be inferred, so say plainly when something cannot be judged.',
    'Judge only what is visible: body shape, starting position, footwork, decision, angle to the ball, set position, handling.',
    'If you cannot confidently pick out the described player, say so in the caveat and set confidence to low rather than guessing.',
    'Rate this passage of play out of 100 - be fair and encouraging but honest; a routine, competent action is around 60-70.',
    'Give concrete, physical coaching, never vague advice like "concentrate more". Plain British English for a teenager.',
  ].join(' ');
}

export function playerLine(profile: Profile): string {
  return [
    profile.name ? `Name: ${profile.name}` : null,
    `Position: ${profile.position} (${POSITION_GROUP_LABEL[profile.positionGroup]})`,
    profile.ageGroup ? `Age group: ${profile.ageGroup}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function clipPrompt(profile: Profile, whichPlayer: string, context: string, shown: string): string {
  return [
    playerLine(profile),
    '',
    `Which player they are: ${whichPlayer}`,
    context ? `Context for the clip: ${context}` : '',
    '',
    shown,
  ]
    .filter(Boolean)
    .join('\n');
}

export function clampRating(analysis: ClipAnalysis): ClipAnalysis {
  return { ...analysis, rating: Math.max(1, Math.min(100, Math.round(analysis.rating))) };
}
