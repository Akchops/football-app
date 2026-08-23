import {
  METRIC_BY_ID, METRICS, type MatchResult, type MetricDef, type MetricId, type MetricTotals,
  type PositionGroup, metricsForGroup,
} from '../types';

export function metricValue(result: MatchResult, id: MetricId): number {
  return result.metrics[id] ?? 0;
}

export function addMetrics(into: MetricTotals, from: MetricTotals): MetricTotals {
  for (const key of Object.keys(from) as MetricId[]) {
    into[key] = (into[key] ?? 0) + (from[key] ?? 0);
  }
  return into;
}

/** Drop zero/undefined entries so results stay small and "did they record this?" stays answerable. */
export function pruneMetrics(metrics: MetricTotals): MetricTotals {
  const out: MetricTotals = {};
  for (const key of Object.keys(metrics) as MetricId[]) {
    const value = metrics[key];
    if (typeof value === 'number' && value !== 0) out[key] = value;
  }
  return out;
}

/**
 * Metrics to show in the result form for a position: its own set first, then
 * anything already recorded on this match (so switching position mid-season
 * never hides a number that was entered).
 */
export function formMetricsFor(group: PositionGroup, existing: MetricTotals): MetricDef[] {
  const own = metricsForGroup(group);
  const extra = METRICS.filter((m) => !own.includes(m) && (existing[m.id] ?? 0) !== 0);
  return [...own, ...extra];
}

export interface StatCard {
  label: string;
  value: string;
  sub?: string;
}

function per(value: number, games: number, digits = 1): string {
  return games ? (value / games).toFixed(digits) : '0';
}

function pct(numerator: number, denominator: number): string {
  return denominator ? `${Math.round((numerator / denominator) * 100)}%` : '–';
}

export interface PositionStatInput {
  /** Matches the player actually featured in. */
  appearances: number;
  /** Matches played by the team, whether or not the player featured. */
  played: number;
  minutes: number;
  /** Clean sheets in matches the player featured in. */
  cleanSheetsPlayed: number;
  goalsAgainst: number;
  totals: MetricTotals;
}

/**
 * The headline stats for a position. A keeper gets saves and goals conceded
 * where a striker gets shots and conversion - the reason this app exists.
 */
export function positionStatCards(group: PositionGroup, input: PositionStatInput): StatCard[] {
  const t = input.totals;
  const get = (id: MetricId) => t[id] ?? 0;
  const apps = input.appearances;

  if (group === 'goalkeeper') {
    const saves = get('saves');
    // Fall back to the team's goals against when per-match conceded was never entered.
    const conceded = get('conceded') || input.goalsAgainst;
    return [
      { label: 'Clean sheets', value: String(input.cleanSheetsPlayed), sub: `${pct(input.cleanSheetsPlayed, apps)} of games` },
      { label: 'Goals conceded', value: String(conceded), sub: `${per(conceded, apps)} per game` },
      { label: 'Saves', value: String(saves), sub: `${per(saves, apps)} per game` },
      { label: 'Save %', value: pct(saves, saves + conceded), sub: 'saves ÷ shots faced' },
      { label: 'Pens saved', value: String(get('penaltiesSaved')) },
      { label: 'Claims', value: String(get('claims')), sub: `${get('sweeperActions')} sweeper` },
    ];
  }

  if (group === 'defender') {
    const tackles = get('tackles');
    const interceptions = get('interceptions');
    return [
      { label: 'Clean sheets', value: String(input.cleanSheetsPlayed), sub: `${pct(input.cleanSheetsPlayed, apps)} of games` },
      { label: 'Tackles won', value: String(tackles), sub: `${per(tackles, apps)} per game` },
      { label: 'Interceptions', value: String(interceptions), sub: `${per(interceptions, apps)} per game` },
      { label: 'Clearances', value: String(get('clearances')), sub: `${get('blocks')} blocks` },
      { label: 'Duels won', value: String(get('duelsWon')), sub: `${per(get('duelsWon'), apps)} per game` },
      { label: 'Goals + assists', value: String(get('goals') + get('assists')) },
    ];
  }

  if (group === 'midfielder') {
    const goals = get('goals');
    const assists = get('assists');
    return [
      { label: 'Goals', value: String(goals), sub: `${per(goals, apps, 2)} per game` },
      { label: 'Assists', value: String(assists), sub: `${per(assists, apps, 2)} per game` },
      { label: 'Chances created', value: String(get('chancesCreated')), sub: `${per(get('chancesCreated'), apps)} per game` },
      { label: 'Tackles won', value: String(get('tackles')), sub: `${get('interceptions')} interceptions` },
      { label: 'Shots', value: String(get('shots')), sub: `${get('shotsOnTarget')} on target` },
      { label: 'Duels won', value: String(get('duelsWon')) },
    ];
  }

  const goals = get('goals');
  const shots = get('shots');
  return [
    { label: 'Goals', value: String(goals), sub: `${per(goals, apps, 2)} per game` },
    { label: 'Assists', value: String(get('assists')), sub: `${per(get('assists'), apps, 2)} per game` },
    { label: 'Shots', value: String(shots), sub: `${get('shotsOnTarget')} on target` },
    { label: 'Conversion', value: pct(goals, shots), sub: 'goals ÷ shots' },
    { label: 'Chances created', value: String(get('chancesCreated')) },
    { label: 'Mins per goal', value: goals ? String(Math.round(input.minutes / goals)) : '–' },
  ];
}

/** Whether the team's attacking numbers are worth showing for this position. */
export function showsTeamAttack(group: PositionGroup): boolean {
  return group !== 'goalkeeper';
}

export function metricLabel(id: MetricId): string {
  return METRIC_BY_ID[id]?.label ?? id;
}
