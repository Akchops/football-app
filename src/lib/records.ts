import { METRIC_BY_ID, type Match, type MatchResult, type MetricId, type PositionGroup } from '../types';
import { formatDateShort, kickoffAt } from './date';
import { matchScore } from './score';
import { computeStats, outcomeOf, playedMatches, type Stats } from './stats';

export interface PersonalBest {
  id: string;
  label: string;
  value: string;
  /** Where it happened, e.g. "vs Riverside FC · Sun 5 Apr". */
  detail: string;
  matchId: string | null;
}

/** Best single-match figure for a metric, plus where it happened. */
function bestForMetric(
  played: (Match & { result: MatchResult })[],
  id: MetricId,
  label?: string,
): PersonalBest | null {
  let best: (Match & { result: MatchResult }) | null = null;
  let bestValue = 0;
  for (const match of played) {
    const value = match.result.metrics[id] ?? 0;
    if (value > bestValue) {
      bestValue = value;
      best = match;
    }
  }
  if (!best || bestValue === 0) return null;
  return {
    id,
    label: label ?? `Most ${(METRIC_BY_ID[id]?.label ?? id).toLowerCase()} in a match`,
    value: String(bestValue),
    detail: `${best.venue === 'away' ? '@' : 'vs'} ${best.opponent} · ${formatDateShort(best.date)}`,
    matchId: best.id,
  };
}

/** Longest run of matches (most recent run counts only if it is the longest). */
function longestRun(
  played: (Match & { result: MatchResult })[],
  predicate: (m: Match & { result: MatchResult }) => boolean,
): { length: number; endedAt: string | null } {
  // playedMatches is newest first; walk oldest to newest so runs read naturally.
  const chronological = [...played].reverse();
  let best = 0;
  let current = 0;
  let bestEnd: string | null = null;
  for (const match of chronological) {
    if (predicate(match)) {
      current += 1;
      if (current > best) {
        best = current;
        bestEnd = match.date;
      }
    } else {
      current = 0;
    }
  }
  return { length: best, endedAt: bestEnd };
}

export function personalBests(matches: Match[], group: PositionGroup): PersonalBest[] {
  const played = playedMatches(matches).filter((m) => m.result.didPlay);
  if (played.length === 0) return [];

  const bests: (PersonalBest | null)[] = [];

  // Best rated performance, whatever the position.
  let topScore = 0;
  let topMatch: (Match & { result: MatchResult }) | null = null;
  for (const match of played) {
    const score = matchScore(match.result, match.durationMinutes).score;
    if (score > topScore) {
      topScore = score;
      topMatch = match;
    }
  }
  if (topMatch) {
    bests.push({
      id: 'topScore',
      label: 'Best match score',
      value: `${topScore}`,
      detail: `${topMatch.venue === 'away' ? '@' : 'vs'} ${topMatch.opponent} · ${formatDateShort(topMatch.date)}`,
      matchId: topMatch.id,
    });
  }

  if (group === 'goalkeeper') {
    bests.push(bestForMetric(played, 'saves', 'Most saves in a match'));
    bests.push(bestForMetric(played, 'penaltiesSaved', 'Most penalties saved'));
    const run = longestRun(played, (m) => m.result.goalsAgainst === 0);
    if (run.length > 0) {
      bests.push({
        id: 'cleanSheetRun',
        label: 'Longest clean sheet run',
        value: `${run.length} game${run.length === 1 ? '' : 's'}`,
        detail: run.endedAt ? `up to ${formatDateShort(run.endedAt)}` : '',
        matchId: null,
      });
    }
  } else {
    bests.push(bestForMetric(played, 'goals', 'Most goals in a match'));
    bests.push(bestForMetric(played, 'assists', 'Most assists in a match'));
    if (group === 'defender') {
      bests.push(bestForMetric(played, 'tackles', 'Most tackles in a match'));
      bests.push(bestForMetric(played, 'interceptions', 'Most interceptions'));
    } else {
      bests.push(bestForMetric(played, 'chancesCreated', 'Most chances created'));
      bests.push(bestForMetric(played, 'shotsOnTarget', 'Most shots on target'));
    }
  }

  const unbeaten = longestRun(played, (m) => outcomeOf(m.result) !== 'L');
  if (unbeaten.length > 1) {
    bests.push({
      id: 'unbeaten',
      label: 'Longest unbeaten run',
      value: `${unbeaten.length} games`,
      detail: unbeaten.endedAt ? `up to ${formatDateShort(unbeaten.endedAt)}` : '',
      matchId: null,
    });
  }

  const winRun = longestRun(played, (m) => outcomeOf(m.result) === 'W');
  if (winRun.length > 1) {
    bests.push({
      id: 'winRun',
      label: 'Longest winning run',
      value: `${winRun.length} games`,
      detail: winRun.endedAt ? `up to ${formatDateShort(winRun.endedAt)}` : '',
      matchId: null,
    });
  }

  return bests.filter((b): b is PersonalBest => b !== null);
}

export interface Milestone {
  id: string;
  label: string;
  /** Where they are now. */
  current: number;
  /** The next round number to aim at, or the last one hit when all are done. */
  target: number;
  achieved: boolean;
  /** When the target was passed, if it has been. */
  achievedOn: string | null;
  /** How many of this milestone's tiers are already banked. */
  banked: number;
}

const TIERS = {
  appearances: [1, 5, 10, 25, 50, 100, 150, 200],
  cleanSheets: [1, 5, 10, 25, 50, 100],
  saves: [10, 25, 50, 100, 250, 500],
  goals: [1, 5, 10, 25, 50, 100],
  assists: [1, 5, 10, 25, 50],
  motm: [1, 3, 5, 10, 25],
  wins: [1, 5, 10, 25, 50, 100],
};

/** The date the nth of something was reached, walking matches oldest first. */
function dateOfNth(
  matches: Match[],
  n: number,
  count: (m: Match & { result: MatchResult }) => number,
): string | null {
  const chronological = [...playedMatches(matches)].reverse();
  let running = 0;
  for (const match of chronological) {
    running += count(match);
    if (running >= n) return match.date;
  }
  return null;
}

function build(
  id: string,
  label: string,
  current: number,
  tiers: number[],
  matches: Match[],
  count: (m: Match & { result: MatchResult }) => number,
): Milestone {
  const banked = tiers.filter((t) => current >= t).length;
  const next = tiers.find((t) => current < t);
  const target = next ?? tiers[tiers.length - 1];
  const achieved = next === undefined;
  const lastHit = banked > 0 ? tiers[banked - 1] : 0;
  return {
    id,
    label,
    current,
    target,
    achieved,
    achievedOn: lastHit > 0 ? dateOfNth(matches, lastHit, count) : null,
    banked,
  };
}

export function milestones(matches: Match[], group: PositionGroup, stats?: Stats): Milestone[] {
  const s = stats ?? computeStats(matches);
  const played = (m: Match & { result: MatchResult }) => (m.result.didPlay ? 1 : 0);

  const list: Milestone[] = [
    build('appearances', 'Appearances', s.appearances, TIERS.appearances, matches, played),
    build('wins', 'Wins', s.wins, TIERS.wins, matches, (m) => (outcomeOf(m.result) === 'W' ? 1 : 0)),
  ];

  if (group === 'goalkeeper') {
    list.push(
      build('cleanSheets', 'Clean sheets', s.cleanSheetsPlayed, TIERS.cleanSheets, matches, (m) =>
        m.result.didPlay && m.result.goalsAgainst === 0 ? 1 : 0,
      ),
      build('saves', 'Saves', s.totals.saves ?? 0, TIERS.saves, matches, (m) => m.result.metrics.saves ?? 0),
    );
  } else {
    list.push(
      build('goals', 'Goals', s.goals, TIERS.goals, matches, (m) => m.result.metrics.goals ?? 0),
      build('assists', 'Assists', s.assists, TIERS.assists, matches, (m) => m.result.metrics.assists ?? 0),
    );
    if (group === 'defender') {
      list.push(
        build('cleanSheets', 'Clean sheets', s.cleanSheetsPlayed, TIERS.cleanSheets, matches, (m) =>
          m.result.didPlay && m.result.goalsAgainst === 0 ? 1 : 0,
        ),
      );
    }
  }

  list.push(build('motm', 'Man of the match', s.motm, TIERS.motm, matches, (m) => (m.result.motm ? 1 : 0)));
  return list;
}

/** Milestones passed in the last `days` days, newest first - the "you just hit X" list. */
export function recentlyAchieved(matches: Match[], group: PositionGroup, days = 45, now: Date = new Date()): Milestone[] {
  const cutoff = now.getTime() - days * 86400000;
  return milestones(matches, group)
    .filter((m) => m.banked > 0 && m.achievedOn !== null)
    .filter((m) => kickoffAt(m.achievedOn as string, '12:00').getTime() >= cutoff)
    .sort((a, b) => (b.achievedOn ?? '').localeCompare(a.achievedOn ?? ''));
}
