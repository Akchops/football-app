import type { Match, MatchResult, PositionGroup, TrainingSession } from '../types';
import { addDays, startOfMonth, startOfWeek, toISODate } from './date';
import { matchScore } from './score';
import { milestones } from './records';
import { outcomeOf, playedMatches } from './stats';

export interface MissionContext {
  matches: Match[];
  training: TrainingSession[];
  group: PositionGroup;
  weekStartsOn: 0 | 1;
  now: Date;
}

/** Everything that happened inside one period. */
interface Window {
  played: (Match & { result: MatchResult })[];
  training: TrainingSession[];
  /** Matches that kicked off in the window but still have no result. */
  unlogged: Match[];
}

interface MissionSpec {
  id: string;
  period: 'week' | 'month';
  stars: number;
  label: string;
  detail: string;
  target: number;
  /** Only offered to these positions; omitted means everyone. */
  groups?: PositionGroup[];
  measure: (w: Window) => number;
}

const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);

const SPECS: MissionSpec[] = [
  // --- Weekly: keep the habit going ---
  {
    id: 'train2',
    period: 'week',
    stars: 1,
    label: 'Train twice',
    detail: 'Two sessions logged this week',
    target: 2,
    measure: (w) => w.training.length,
  },
  {
    id: 'train4',
    period: 'week',
    stars: 2,
    label: 'Four sessions',
    detail: 'A proper week of work',
    target: 4,
    measure: (w) => w.training.length,
  },
  {
    id: 'playMatch',
    period: 'week',
    stars: 1,
    label: 'Play a match',
    detail: 'Get a game in',
    target: 1,
    measure: (w) => w.played.filter((m) => m.result.didPlay).length,
  },
  {
    id: 'logAll',
    period: 'week',
    stars: 1,
    label: 'Log every result',
    detail: 'No matches left waiting',
    target: 1,
    // Only counts once a match has actually been played this week.
    measure: (w) => (w.played.length > 0 && w.unlogged.length === 0 ? 1 : 0),
  },
  {
    id: 'saves5',
    period: 'week',
    stars: 2,
    label: 'Five saves',
    detail: 'Across this week’s matches',
    target: 5,
    groups: ['goalkeeper'],
    measure: (w) => sum(w.played.map((m) => m.result.metrics.saves ?? 0)),
  },
  {
    id: 'contribute',
    period: 'week',
    stars: 2,
    label: 'Score or assist',
    detail: 'Get on the scoresheet',
    target: 1,
    groups: ['defender', 'midfielder', 'forward'],
    measure: (w) => sum(w.played.map((m) => (m.result.metrics.goals ?? 0) + (m.result.metrics.assists ?? 0))),
  },

  // --- Monthly: the bigger targets ---
  {
    id: 'apps4',
    period: 'month',
    stars: 2,
    label: 'Four appearances',
    detail: 'Play four matches this month',
    target: 4,
    measure: (w) => w.played.filter((m) => m.result.didPlay).length,
  },
  {
    id: 'trainHours',
    period: 'month',
    stars: 3,
    label: 'Eight hours training',
    detail: 'Time on the grass adds up',
    target: 480,
    measure: (w) => sum(w.training.map((t) => t.durationMinutes)),
  },
  {
    id: 'cleanSheets2',
    period: 'month',
    stars: 3,
    label: 'Two clean sheets',
    detail: 'Keep them out',
    target: 2,
    groups: ['goalkeeper', 'defender'],
    measure: (w) => w.played.filter((m) => m.result.didPlay && m.result.goalsAgainst === 0).length,
  },
  {
    id: 'goals3',
    period: 'month',
    stars: 3,
    label: 'Three goals or assists',
    detail: 'Make things happen',
    target: 3,
    groups: ['midfielder', 'forward'],
    measure: (w) => sum(w.played.map((m) => (m.result.metrics.goals ?? 0) + (m.result.metrics.assists ?? 0))),
  },
  {
    id: 'defensiveWork',
    period: 'month',
    stars: 3,
    label: 'Twenty defensive actions',
    detail: 'Tackles and interceptions combined',
    target: 20,
    groups: ['defender'],
    measure: (w) =>
      sum(w.played.map((m) => (m.result.metrics.tackles ?? 0) + (m.result.metrics.interceptions ?? 0))),
  },
  {
    id: 'rated70',
    period: 'month',
    stars: 3,
    label: 'Average 70+',
    detail: 'Match score across the month',
    target: 70,
    measure: (w) => {
      const scores = w.played
        .filter((m) => m.result.didPlay)
        .map((m) => matchScore(m.result, m.durationMinutes).score);
      return scores.length ? Math.round(sum(scores) / scores.length) : 0;
    },
  },
  {
    id: 'unbeaten3',
    period: 'month',
    stars: 2,
    label: 'Three without losing',
    detail: 'Wins and draws both count',
    target: 3,
    measure: (w) => w.played.filter((m) => outcomeOf(m.result) !== 'L').length,
  },
];

function windowFor(ctx: MissionContext, startISO: string, endISO: string): Window {
  const inRange = (date: string) => date >= startISO && date < endISO;
  return {
    played: playedMatches(ctx.matches).filter((m) => inRange(m.date)),
    training: ctx.training.filter((t) => inRange(t.date)),
    unlogged: ctx.matches.filter((m) => m.status === 'scheduled' && inRange(m.date) && m.date <= toISODate(ctx.now)),
  };
}

export interface Mission {
  id: string;
  period: 'week' | 'month';
  label: string;
  detail: string;
  target: number;
  current: number;
  stars: number;
  complete: boolean;
}

function specsFor(group: PositionGroup): MissionSpec[] {
  return SPECS.filter((spec) => !spec.groups || spec.groups.includes(group));
}

function evaluate(spec: MissionSpec, w: Window): Mission {
  const current = spec.measure(w);
  return {
    id: spec.id,
    period: spec.period,
    label: spec.label,
    detail: spec.detail,
    target: spec.target,
    current: Math.min(current, spec.target),
    stars: spec.stars,
    complete: current >= spec.target,
  };
}

/** This week's and this month's missions, in progress order. */
export function currentMissions(ctx: MissionContext): Mission[] {
  const weekStart = startOfWeek(ctx.now, ctx.weekStartsOn);
  const weekWindow = windowFor(ctx, toISODate(weekStart), toISODate(addDays(weekStart, 7)));
  const monthStart = startOfMonth(ctx.now);
  const monthWindow = windowFor(
    ctx,
    toISODate(monthStart),
    toISODate(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)),
  );

  return specsFor(ctx.group)
    .map((spec) => evaluate(spec, spec.period === 'week' ? weekWindow : monthWindow))
    .sort((a, b) => {
      // Finished ones drop to the bottom; the closest to done floats up.
      if (a.complete !== b.complete) return a.complete ? 1 : -1;
      return b.current / b.target - a.current / a.target;
    });
}

/** How far back to look when totting up stars from finished periods. */
const WEEKS_BACK = 26;
const MONTHS_BACK = 12;

export interface StarTotals {
  /** Stars from milestone tiers already passed. */
  milestone: number;
  /** Stars from missions completed, this period and previous ones. */
  mission: number;
  total: number;
}

export function starTotals(ctx: MissionContext): StarTotals {
  const milestone = milestones(ctx.matches, ctx.group).reduce((sumStars, m) => sumStars + m.banked, 0);

  const specs = specsFor(ctx.group);
  const weekSpecs = specs.filter((s) => s.period === 'week');
  const monthSpecs = specs.filter((s) => s.period === 'month');
  let mission = 0;

  const thisWeek = startOfWeek(ctx.now, ctx.weekStartsOn);
  for (let i = 0; i <= WEEKS_BACK; i++) {
    const start = addDays(thisWeek, -7 * i);
    const w = windowFor(ctx, toISODate(start), toISODate(addDays(start, 7)));
    for (const spec of weekSpecs) if (spec.measure(w) >= spec.target) mission += spec.stars;
  }

  const thisMonth = startOfMonth(ctx.now);
  for (let i = 0; i <= MONTHS_BACK; i++) {
    const start = new Date(thisMonth.getFullYear(), thisMonth.getMonth() - i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const w = windowFor(ctx, toISODate(start), toISODate(end));
    for (const spec of monthSpecs) if (spec.measure(w) >= spec.target) mission += spec.stars;
  }

  return { milestone, mission, total: milestone + mission };
}

export interface Rank {
  name: string;
  /** Stars needed to reach this rank. */
  from: number;
  /** Stars needed for the next one, or null at the top. */
  next: number | null;
  nextName: string | null;
}

const RANKS: { name: string; from: number }[] = [
  { name: 'Rookie', from: 0 },
  { name: 'Squad Player', from: 5 },
  { name: 'Regular', from: 15 },
  { name: 'First Choice', from: 30 },
  { name: 'Key Player', from: 50 },
  { name: 'Star Man', from: 80 },
  { name: 'Club Legend', from: 120 },
];

export function rankFor(stars: number): Rank {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (stars >= RANKS[i].from) index = i;
  const next = RANKS[index + 1] ?? null;
  return {
    name: RANKS[index].name,
    from: RANKS[index].from,
    next: next ? next.from : null,
    nextName: next ? next.name : null,
  };
}
