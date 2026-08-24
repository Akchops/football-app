import { DEFAULT_MATCH_LENGTH, type MatchResult, type MetricId, type PositionGroup } from '../types';

export interface ScorePart {
  label: string;
  points: number;
}

export interface MatchScore {
  /** 0-100 rating of how the player performed in this match. */
  score: number;
  /** The biggest contributions, so the number is always explainable. */
  breakdown: ScorePart[];
}

const BASE = 50;
/** Position work is capped so one huge stat line can't run away with the score. */
const POSITION_CAP = 40;
const POSITION_FLOOR = -30;

interface Weight {
  id: MetricId;
  points: number;
  label?: (n: number) => string;
}

const WEIGHTS: Record<PositionGroup, Weight[]> = {
  goalkeeper: [
    { id: 'saves', points: 2.5, label: (n) => `${n} save${n === 1 ? '' : 's'}` },
    { id: 'penaltiesSaved', points: 6, label: (n) => `${n} penalty save${n === 1 ? '' : 's'}` },
    { id: 'conceded', points: -4, label: (n) => `${n} conceded` },
    { id: 'claims', points: 0.6, label: (n) => `${n} claimed` },
    { id: 'sweeperActions', points: 1, label: (n) => `${n} sweeper clearance${n === 1 ? '' : 's'}` },
  ],
  defender: [
    { id: 'tackles', points: 1.5, label: (n) => `${n} tackle${n === 1 ? '' : 's'} won` },
    { id: 'interceptions', points: 1.5, label: (n) => `${n} interception${n === 1 ? '' : 's'}` },
    { id: 'clearances', points: 0.7, label: (n) => `${n} clearance${n === 1 ? '' : 's'}` },
    { id: 'blocks', points: 1.6, label: (n) => `${n} block${n === 1 ? '' : 's'}` },
    { id: 'duelsWon', points: 0.6, label: (n) => `${n} duel${n === 1 ? '' : 's'} won` },
    { id: 'goals', points: 8, label: (n) => `${n} goal${n === 1 ? '' : 's'}` },
    { id: 'assists', points: 6, label: (n) => `${n} assist${n === 1 ? '' : 's'}` },
  ],
  midfielder: [
    { id: 'goals', points: 9, label: (n) => `${n} goal${n === 1 ? '' : 's'}` },
    { id: 'assists', points: 7, label: (n) => `${n} assist${n === 1 ? '' : 's'}` },
    { id: 'chancesCreated', points: 2, label: (n) => `${n} chance${n === 1 ? '' : 's'} created` },
    { id: 'tackles', points: 1.2, label: (n) => `${n} tackle${n === 1 ? '' : 's'} won` },
    { id: 'interceptions', points: 1.2, label: (n) => `${n} interception${n === 1 ? '' : 's'}` },
    { id: 'duelsWon', points: 0.5, label: (n) => `${n} duel${n === 1 ? '' : 's'} won` },
    { id: 'shotsOnTarget', points: 0.8, label: (n) => `${n} on target` },
  ],
  forward: [
    { id: 'goals', points: 11, label: (n) => `${n} goal${n === 1 ? '' : 's'}` },
    { id: 'assists', points: 7, label: (n) => `${n} assist${n === 1 ? '' : 's'}` },
    { id: 'chancesCreated', points: 2, label: (n) => `${n} chance${n === 1 ? '' : 's'} created` },
    { id: 'shotsOnTarget', points: 1.5, label: (n) => `${n} on target` },
    { id: 'shots', points: 0.4, label: (n) => `${n} shot${n === 1 ? '' : 's'}` },
    { id: 'duelsWon', points: 0.5, label: (n) => `${n} duel${n === 1 ? '' : 's'} won` },
  ],
};

/** Keeping a clean sheet is the headline job for the players who defend. */
const CLEAN_SHEET_POINTS: Record<PositionGroup, number> = {
  goalkeeper: 18,
  defender: 12,
  midfielder: 4,
  forward: 0,
};

/**
 * Rates a performance out of 100 using the stats that matter for the position
 * played. A keeper's 4 saves and a clean sheet score like a striker's two goals.
 *
 * `durationMinutes` is the length of this particular match, so a full game in a
 * 60-minute youth fixture counts as a full game.
 */
export function matchScore(result: MatchResult, durationMinutes = DEFAULT_MATCH_LENGTH): MatchScore {
  if (!result.didPlay) return { score: 0, breakdown: [] };

  const group = result.positionGroup;
  const breakdown: ScorePart[] = [];

  // Position work.
  let positionPoints = 0;
  for (const weight of WEIGHTS[group]) {
    const count = result.metrics[weight.id] ?? 0;
    if (!count) continue;
    const points = count * weight.points;
    positionPoints += points;
    breakdown.push({ label: weight.label ? weight.label(count) : weight.id, points });
  }

  // A keeper with no per-match conceded entered still gets judged on what went in.
  if (group === 'goalkeeper' && !(result.metrics.conceded ?? 0) && result.goalsAgainst > 0) {
    const points = result.goalsAgainst * -4;
    positionPoints += points;
    breakdown.push({ label: `${result.goalsAgainst} conceded`, points });
  }

  const cleanSheet = result.goalsAgainst === 0;
  if (cleanSheet && CLEAN_SHEET_POINTS[group] > 0) {
    positionPoints += CLEAN_SHEET_POINTS[group];
    breakdown.push({ label: 'Clean sheet', points: CLEAN_SHEET_POINTS[group] });
  }

  positionPoints = Math.max(POSITION_FLOOR, Math.min(POSITION_CAP, positionPoints));

  // Team result - it counts, but a good display in a defeat still rates well.
  let resultPoints = 0;
  if (result.goalsFor > result.goalsAgainst) resultPoints = 12;
  else if (result.goalsFor === result.goalsAgainst) resultPoints = 4;
  else resultPoints = -4;
  breakdown.push({
    label: resultPoints > 4 ? 'Won the match' : resultPoints === 4 ? 'Drew the match' : 'Lost the match',
    points: resultPoints,
  });

  // Discipline.
  let discipline = 0;
  if (result.yellowCards) {
    discipline += result.yellowCards * -3;
    breakdown.push({ label: `${result.yellowCards} yellow`, points: result.yellowCards * -3 });
  }
  if (result.redCards) {
    discipline += result.redCards * -12;
    breakdown.push({ label: 'Sent off', points: result.redCards * -12 });
  }

  let motm = 0;
  if (result.motm) {
    motm = 5;
    breakdown.push({ label: 'Man of the match', points: 5 });
  }

  // A short cameo shouldn't swing as hard as a full game in either direction,
  // measured against how long this match actually was.
  const fullMatch = Math.max(1, durationMinutes || DEFAULT_MATCH_LENGTH);
  const substantial = fullMatch * (2 / 3);
  const minutes = Math.max(0, Math.min(fullMatch * 1.5, result.minutes));
  const weight = minutes >= substantial ? 1 : Math.max(0.45, minutes / substantial);
  let score = BASE + (positionPoints + resultPoints + discipline + motm) * weight;

  // Blend in a self rating when one was given - they watched the game, the app didn't.
  if (result.rating !== null) {
    score = score * 0.7 + result.rating * 10 * 0.3;
    breakdown.push({ label: `Your rating ${result.rating}/10`, points: 0 });
  }

  return {
    score: Math.max(1, Math.min(100, Math.round(score))),
    breakdown: breakdown.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
  };
}

export function scoreBand(score: number): 'great' | 'good' | 'ok' | 'poor' {
  if (score >= 80) return 'great';
  if (score >= 65) return 'good';
  if (score >= 50) return 'ok';
  return 'poor';
}

export function scoreVerdict(score: number): string {
  if (score >= 90) return 'Outstanding';
  if (score >= 80) return 'Excellent';
  if (score >= 70) return 'Very good';
  if (score >= 60) return 'Solid';
  if (score >= 50) return 'Steady';
  if (score >= 40) return 'Below par';
  return 'Tough day';
}
