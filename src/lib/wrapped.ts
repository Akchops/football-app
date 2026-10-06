import type {
  Competition, Match, MatchResult, MetricId, PositionGroup, Profile, TrainingSession, TrainingType,
} from '../types';
import { MONTH_NAMES } from './date';
import { matchScore } from './score';
import { computeStats, mainPositionGroup, outcomeOf, playedMatches, scoreline, statsByOpponent } from './stats';

/**
 * A year on the pitch, told the way Spotify Wrapped tells a year of music: one
 * big number at a time. The season runs with the calendar year, so "2026" is
 * every result logged from 1 January to 31 December. Everything is worked out
 * from the matches and training already logged - nothing is stored for it.
 */
export interface Wrapped {
  year: number;
  /** Results logged in the year - the team's games, whether or not the player got on. */
  played: number;
  appearances: number;
  minutes: number;
  /** How many of the player's teams had a game in the year. */
  teams: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  /** In games the player was in. */
  cleanSheets: number;
  /** The position played most, which decides the numbers told. */
  group: PositionGroup;
  /** The numbers that matter for that position, the biggest story first. Empty when none were logged. */
  headline: { value: number; label: string; one: string }[];
  best: { match: Match & { result: MatchResult }; score: number; line: string } | null;
  averageScore: number | null;
  motm: number;
  longestUnbeaten: number;
  tournaments: { id: string; name: string; placing: string; color: string }[];
  trophies: number;
  /** The team played most often - only once it's been at least twice. */
  rival: { name: string; played: number; wins: number; draws: number; losses: number } | null;
  busiestMonth: { name: string; matches: number } | null;
  training: { sessions: number; hours: number; topType: TrainingType | null } | null;
  /** A name for the year, from the numbers - the "listening personality" bit. */
  type: { name: string; why: string };
}

export interface WrappedInput {
  matches: Match[];
  training: TrainingSession[];
  competitions: Competition[];
  profile: Pick<Profile, 'positionGroup'>;
}

/** What each position's year is told with, in the order it's told. */
const HEADLINE: Record<PositionGroup, { metric: MetricId | 'cleanSheets' | 'goalsAndAssists'; label: string; one: string }[]> = {
  goalkeeper: [
    { metric: 'saves', label: 'saves', one: 'save' },
    { metric: 'cleanSheets', label: 'clean sheets', one: 'clean sheet' },
    { metric: 'penaltiesSaved', label: 'penalties saved', one: 'penalty saved' },
  ],
  defender: [
    { metric: 'tackles', label: 'tackles won', one: 'tackle won' },
    { metric: 'interceptions', label: 'interceptions', one: 'interception' },
    { metric: 'cleanSheets', label: 'clean sheets', one: 'clean sheet' },
  ],
  midfielder: [
    { metric: 'goalsAndAssists', label: 'goals and assists', one: 'goal or assist' },
    { metric: 'chancesCreated', label: 'chances created', one: 'chance created' },
    { metric: 'tackles', label: 'tackles won', one: 'tackle won' },
  ],
  forward: [
    { metric: 'goals', label: 'goals', one: 'goal' },
    { metric: 'assists', label: 'assists', one: 'assist' },
    { metric: 'shotsOnTarget', label: 'shots on target', one: 'shot on target' },
  ],
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "4.8", but "11" rather than "11.0". */
const rate = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "Won 2–0 · 6 saves · clean sheet · man of the match" - what made a game the best one. */
function bestLine(match: Match & { result: MatchResult }, group: PositionGroup): string {
  const r = match.result;
  const outcome = outcomeOf(r);
  const parts = [`${outcome === 'W' ? 'Won' : outcome === 'L' ? 'Lost' : 'Drew'} ${scoreline(r)}`];
  for (const { metric, label, one } of HEADLINE[group]) {
    if (metric === 'cleanSheets' || metric === 'goalsAndAssists') continue;
    const value = r.metrics[metric] ?? 0;
    if (value > 0) parts.push(`${value} ${value === 1 ? one : label}`);
  }
  if (r.goalsAgainst === 0 && (group === 'goalkeeper' || group === 'defender')) parts.push('clean sheet');
  if (r.motm) parts.push('man of the match');
  return parts.slice(0, 4).join(' · ');
}

/** The name for the year. The first that fits, so the most striking thing about it wins. */
function playerType(group: PositionGroup, w: Omit<Wrapped, 'type'>, totals: Partial<Record<MetricId, number>>): Wrapped['type'] {
  const apps = Math.max(1, w.appearances);
  const get = (id: MetricId) => totals[id] ?? 0;
  const pct = (n: number) => Math.round((n / apps) * 100);
  if (group === 'goalkeeper') {
    if (get('penaltiesSaved') >= 3) return { name: 'Penalty Hero', why: `${plural(get('penaltiesSaved'), 'penalty', 'penalties')} saved. Shootouts were your stage.` };
    if (w.cleanSheets >= 3 && w.cleanSheets / apps >= 0.4) return { name: 'The Wall', why: `A clean sheet in ${pct(w.cleanSheets)}% of your games.` };
    if (get('saves') / apps >= 5) return { name: 'Shot Stopper', why: `${rate(get('saves') / apps)} saves a game. Nothing got past easily.` };
    return { name: 'Last Line', why: `${plural(get('saves'), 'save')} between the sticks.` };
  }
  if (group === 'defender') {
    const actions = get('tackles') + get('interceptions');
    if (actions / apps >= 5) return { name: 'The Rock', why: `${rate(actions / apps)} tackles and interceptions a game.` };
    if (w.cleanSheets >= 3 && w.cleanSheets / apps >= 0.4) return { name: 'Lockdown', why: `A clean sheet in ${pct(w.cleanSheets)}% of your games.` };
    if (get('goals') + get('assists') >= 5) return { name: 'Attacking Defender', why: `${get('goals') + get('assists')} goals and assists from the back.` };
    return { name: 'Ever Present', why: `${plural(w.appearances, 'game')} at the back.` };
  }
  if (group === 'midfielder') {
    if (get('assists') >= 4 && get('assists') >= get('goals')) return { name: 'The Playmaker', why: `${plural(get('assists'), 'assist')}. You made the goals happen.` };
    if (get('chancesCreated') / apps >= 2) return { name: 'The Creator', why: `${rate(get('chancesCreated') / apps)} chances created a game.` };
    if (get('goals') >= 5) return { name: 'Goalscoring Midfielder', why: `${plural(get('goals'), 'goal')} from midfield.` };
    return { name: 'The Engine', why: `${plural(w.minutes, 'minute')} running the middle.` };
  }
  if (get('goals') / apps >= 1) return { name: 'Goal Machine', why: `${rate(get('goals') / apps)} goals a game.` };
  if (get('goals') >= 10) return { name: 'Fox in the Box', why: `${plural(get('goals'), 'goal')}. Always in the right place.` };
  if (get('assists') > get('goals')) return { name: 'The Provider', why: `More assists than goals: ${get('assists')} set up.` };
  return { name: 'The Finisher', why: `${plural(get('goals'), 'goal')} up front.` };
}

/** The year's Wrapped, or null when no result was logged in it. */
export function wrappedFor(input: WrappedInput, year: number): Wrapped | null {
  const prefix = `${year}-`;
  const inYear = input.matches.filter((m) => m.date.startsWith(prefix));
  const stats = computeStats(inYear);
  if (stats.played === 0) return null;

  const played = playedMatches(inYear).reverse();
  const group = mainPositionGroup(inYear, input.profile.positionGroup);

  const totals = stats.totals;
  const headline = HEADLINE[group]
    .map(({ metric, label, one }) => ({
      label,
      one,
      value:
        metric === 'cleanSheets'
          ? stats.cleanSheetsPlayed
          : metric === 'goalsAndAssists'
            ? (totals.goals ?? 0) + (totals.assists ?? 0)
            : totals[metric] ?? 0,
    }))
    .filter((h) => h.value > 0);

  let best: Wrapped['best'] = null;
  for (const match of played) {
    if (!match.result.didPlay) continue;
    const score = matchScore(match.result, match.durationMinutes).score;
    // Ties go to the later game - the one fresher in the memory.
    if (!best || score >= best.score) best = { match, score, line: bestLine(match, group) };
  }

  let run = 0;
  let longestUnbeaten = 0;
  for (const match of played) {
    run = outcomeOf(match.result) === 'L' ? 0 : run + 1;
    longestUnbeaten = Math.max(longestUnbeaten, run);
  }

  const byMonth = new Map<number, number>();
  for (const match of played) {
    const month = Number(match.date.slice(5, 7)) - 1;
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }
  const [busiest] = [...byMonth.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);

  const tournaments = input.competitions
    .filter((c) => c.type === 'tournament' || c.type === 'cup')
    .map((c) => ({ c, first: played.find((m) => m.competitionId === c.id)?.date ?? null }))
    .filter((t): t is { c: Competition; first: string } => t.first !== null)
    .sort((a, b) => a.first.localeCompare(b.first))
    .map(({ c }) => ({ id: c.id, name: c.name, placing: c.placing, color: c.color }));

  const [top] = statsByOpponent(inYear, 1);
  const sessions = input.training.filter((t) => t.date.startsWith(prefix));
  const types = new Map<TrainingType, number>();
  for (const s of sessions) types.set(s.type, (types.get(s.type) ?? 0) + 1);

  const w: Omit<Wrapped, 'type'> = {
    year,
    played: stats.played,
    appearances: stats.appearances,
    minutes: stats.minutes,
    teams: new Set(played.map((m) => m.teamId).filter(Boolean)).size,
    wins: stats.wins,
    draws: stats.draws,
    losses: stats.losses,
    goalsFor: stats.goalsFor,
    goalsAgainst: stats.goalsAgainst,
    cleanSheets: stats.cleanSheetsPlayed,
    group,
    headline,
    best,
    averageScore: stats.averageScore,
    motm: stats.motm,
    longestUnbeaten,
    tournaments,
    trophies: tournaments.filter((t) => t.placing === 'Winners').length,
    rival: top && top.played >= 2 ? { name: top.opponent, played: top.played, wins: top.wins, draws: top.draws, losses: top.losses } : null,
    busiestMonth: busiest && busiest[1] >= 2 ? { name: MONTH_NAMES[busiest[0]], matches: busiest[1] } : null,
    training: sessions.length
      ? {
          sessions: sessions.length,
          hours: Math.round(sessions.reduce((sum, s) => sum + s.durationMinutes, 0) / 60),
          topType: [...types.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        }
      : null,
  };
  return { ...w, type: playerType(group, w, totals) };
}

/**
 * Which year the Stats page offers: in January, the one just finished; the
 * rest of the time, this one so far.
 */
export function wrappedYear(now: Date): { year: number; complete: boolean } {
  return now.getMonth() === 0 ? { year: now.getFullYear() - 1, complete: true } : { year: now.getFullYear(), complete: false };
}

/** The once-a-year invitation, in January, for a year that has a story to tell. */
export function wrappedInvite(now: Date, seenYear: number, input: WrappedInput): number | null {
  if (now.getMonth() !== 0) return null;
  const year = now.getFullYear() - 1;
  if (seenYear >= year) return null;
  const w = wrappedFor(input, year);
  return w && w.played >= 3 ? year : null;
}

/** The six numbers the year ends on - the same on the last slide and on the picture shared from it. */
export function wrappedTiles(w: Wrapped): { value: string; label: string }[] {
  const s = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
  return [
    { value: String(w.appearances), label: s(w.appearances, 'match', 'matches') },
    { value: String(w.wins), label: s(w.wins, 'win') },
    ...w.headline.slice(0, 2).map((h) => ({ value: String(h.value), label: h.value === 1 ? h.one : h.label })),
    ...(w.best ? [{ value: String(w.best.score), label: 'best game /100' }] : []),
    w.trophies > 0
      ? { value: String(w.trophies), label: s(w.trophies, 'trophy', 'trophies') }
      : w.tournaments.length > 0
        ? { value: String(w.tournaments.length), label: s(w.tournaments.length, 'tournament') }
        : { value: String(w.longestUnbeaten), label: 'unbeaten run' },
  ].slice(0, 6);
}
