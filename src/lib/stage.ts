import type { Competition, Match, MatchStage } from '../types';

/**
 * Group games and knockout rounds. A stage is optional on every match - league
 * games and friendlies have none - and says nothing about the result; it only
 * tells a group game from a semi-final wherever a match is shown or counted.
 */

/** Every stage, in the order a competition runs through them. */
export const STAGES: MatchStage[] = ['group', 'round', 'last16', 'quarter', 'semi', 'third', 'final'];

/** The rounds a tournament can be set up with, in the order they are played. */
export const KNOCKOUT_ROUNDS: MatchStage[] = ['last16', 'quarter', 'semi', 'third', 'final'];

export const STAGE_LABEL: Record<MatchStage, string> = {
  group: 'Group stage',
  round: 'Early round',
  last16: 'Round of 16',
  quarter: 'Quarter-final',
  semi: 'Semi-final',
  third: '3rd place play-off',
  final: 'Final',
};

/** Short enough for a row of chips. */
export const STAGE_SHORT: Record<MatchStage, string> = {
  group: 'Group',
  round: 'Round',
  last16: 'Last 16',
  quarter: 'QF',
  semi: 'SF',
  third: '3rd place',
  final: 'Final',
};

export function isKnockout(stage: MatchStage | null | undefined): boolean {
  return Boolean(stage) && stage !== 'group';
}

/** A stage from anywhere untrusted - an AI reply, an old backup - or null. */
export function toStage(raw: unknown): MatchStage | null {
  return typeof raw === 'string' && (STAGES as string[]).includes(raw) ? (raw as MatchStage) : null;
}

/**
 * What to call it: "Group B", "Round 2", "Plate semi-final", "Final". Empty
 * when there is no stage. The detail is typed by people and read off sheets,
 * so "Group B" and "B" both come out as "Group B".
 */
export function stageName(stage: MatchStage | null | undefined, detail = ''): string {
  if (!stage) return '';
  let extra = detail.trim();
  if (stage === 'group') {
    if (/^pool\b/i.test(extra)) return extra.charAt(0).toUpperCase() + extra.slice(1);
    extra = extra.replace(/^(group|grp)\.?\s*/i, '');
    return extra ? `Group ${extra}` : STAGE_LABEL.group;
  }
  if (stage === 'round') {
    extra = extra.replace(/^(round|rd|r)\.?\s*/i, '');
    return extra ? `Round ${extra}` : STAGE_LABEL.round;
  }
  return extra ? `${extra} ${STAGE_LABEL[stage].toLowerCase()}` : STAGE_LABEL[stage];
}

/** "Easter 7s · Semi-final" - the competition and the stage, whichever there are. */
export function fixtureContext(
  competition: Pick<Competition, 'name'> | null,
  match: Pick<Match, 'stage' | 'stageDetail'>,
): string {
  return [competition?.name ?? '', stageName(match.stage, match.stageDetail)].filter(Boolean).join(' · ');
}

/** What the optional detail means for a stage, for the field that asks for it. */
export function detailPrompt(stage: MatchStage): { label: string; placeholder: string } {
  if (stage === 'group') return { label: 'Which group?', placeholder: 'e.g. B' };
  if (stage === 'round') return { label: 'Which round?', placeholder: 'e.g. 2' };
  return { label: 'Cup, Plate…', placeholder: 'e.g. Plate' };
}
