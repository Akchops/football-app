import type { Competition, Match, MatchResult, Settings, Venue } from '../types';
import { MONTH_NAMES, fromISODate, kickoffAt, toISODate } from './date';

export type Outcome = 'W' | 'D' | 'L';

export function outcomeOf(result: MatchResult): Outcome {
  if (result.goalsFor > result.goalsAgainst) return 'W';
  if (result.goalsFor < result.goalsAgainst) return 'L';
  return 'D';
}

/** A drawn match that was settled on penalties, and who won the shootout. */
export function shootoutWinner(result: MatchResult): 'us' | 'them' | null {
  const { penaltiesFor: f, penaltiesAgainst: a } = result;
  if (f === null || a === null || f === a) return null;
  return f > a ? 'us' : 'them';
}

export function scoreline(result: MatchResult): string {
  const base = `${result.goalsFor}-${result.goalsAgainst}`;
  if (result.penaltiesFor !== null && result.penaltiesAgainst !== null) {
    return `${base} (${result.penaltiesFor}-${result.penaltiesAgainst} pens)`;
  }
  return base;
}

export function isPlayed(match: Match): match is Match & { result: MatchResult } {
  return match.status === 'played' && match.result !== null;
}

/** Matches whose kickoff has passed but which still have no result logged. */
export function pendingResultMatches(matches: Match[], settings: Settings, now: Date = new Date()): Match[] {
  const delayMs = Math.max(0, settings.resultPromptDelayMinutes) * 60000;
  return matches
    .filter((m) => m.status === 'scheduled')
    .filter((m) => kickoffAt(m.date, m.time).getTime() + delayMs <= now.getTime())
    .filter((m) => !m.remindAfter || new Date(m.remindAfter).getTime() <= now.getTime())
    .sort((a, b) => kickoffAt(a.date, a.time).getTime() - kickoffAt(b.date, b.time).getTime());
}

/** Scheduled matches still in the future, soonest first. */
export function upcomingMatches(matches: Match[], now: Date = new Date()): Match[] {
  return matches
    .filter((m) => m.status === 'scheduled' && kickoffAt(m.date, m.time).getTime() > now.getTime())
    .sort((a, b) => kickoffAt(a.date, a.time).getTime() - kickoffAt(b.date, b.time).getTime());
}

export function playedMatches(matches: Match[]): (Match & { result: MatchResult })[] {
  return matches
    .filter(isPlayed)
    .sort((a, b) => kickoffAt(b.date, b.time).getTime() - kickoffAt(a.date, a.time).getTime());
}

export function matchesOnDate(matches: Match[], iso: string): Match[] {
  return matches
    .filter((m) => m.date === iso)
    .sort((a, b) => a.time.localeCompare(b.time));
}

export interface Record_ {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface Stats extends Record_ {
  goalDifference: number;
  points: number;
  pointsPerGame: number;
  winRate: number;
  cleanSheets: number;
  failedToScore: number;
  shootoutWins: number;
  biggestWin: (Match & { result: MatchResult }) | null;
  heaviestDefeat: (Match & { result: MatchResult }) | null;
  /** Personal totals for the tracked player. */
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  contributions: number;
  yellowCards: number;
  redCards: number;
  motm: number;
  averageRating: number | null;
  goalsPerMatch: number;
  minutesPerGoalContribution: number | null;
  /** Most recent first, max 5. */
  form: Outcome[];
  streak: { type: Outcome; count: number } | null;
}

function emptyRecord(): Record_ {
  return { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
}

function addToRecord(rec: Record_, result: MatchResult): void {
  rec.played += 1;
  rec.goalsFor += result.goalsFor;
  rec.goalsAgainst += result.goalsAgainst;
  const outcome = outcomeOf(result);
  if (outcome === 'W') rec.wins += 1;
  else if (outcome === 'D') rec.draws += 1;
  else rec.losses += 1;
}

export function recordSummary(rec: Record_): string {
  return `${rec.wins}W ${rec.draws}D ${rec.losses}L`;
}

export function computeStats(matches: Match[]): Stats {
  const played = playedMatches(matches); // newest first
  const base = emptyRecord();

  let cleanSheets = 0;
  let failedToScore = 0;
  let shootoutWins = 0;
  let appearances = 0;
  let minutes = 0;
  let goals = 0;
  let assists = 0;
  let yellowCards = 0;
  let redCards = 0;
  let motm = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let biggestWin: (Match & { result: MatchResult }) | null = null;
  let heaviestDefeat: (Match & { result: MatchResult }) | null = null;

  for (const match of played) {
    const r = match.result;
    addToRecord(base, r);
    if (r.goalsAgainst === 0) cleanSheets += 1;
    if (r.goalsFor === 0) failedToScore += 1;
    if (shootoutWinner(r) === 'us') shootoutWins += 1;

    if (r.didPlay) {
      appearances += 1;
      minutes += r.minutes;
      goals += r.goals;
      assists += r.assists;
      yellowCards += r.yellowCards;
      redCards += r.redCards;
      if (r.motm) motm += 1;
      if (r.rating !== null) {
        ratingSum += r.rating;
        ratingCount += 1;
      }
    }

    const margin = r.goalsFor - r.goalsAgainst;
    if (margin > 0 && (!biggestWin || margin > biggestWin.result.goalsFor - biggestWin.result.goalsAgainst)) {
      biggestWin = match;
    }
    if (margin < 0 && (!heaviestDefeat || margin < heaviestDefeat.result.goalsFor - heaviestDefeat.result.goalsAgainst)) {
      heaviestDefeat = match;
    }
  }

  const form = played.slice(0, 5).map((m) => outcomeOf(m.result));
  let streak: Stats['streak'] = null;
  if (played.length > 0) {
    const type = outcomeOf(played[0].result);
    let count = 0;
    for (const m of played) {
      if (outcomeOf(m.result) !== type) break;
      count += 1;
    }
    streak = { type, count };
  }

  const points = base.wins * 3 + base.draws;
  const contributions = goals + assists;

  return {
    ...base,
    goalDifference: base.goalsFor - base.goalsAgainst,
    points,
    pointsPerGame: base.played ? points / base.played : 0,
    winRate: base.played ? base.wins / base.played : 0,
    cleanSheets,
    failedToScore,
    shootoutWins,
    biggestWin,
    heaviestDefeat,
    appearances,
    minutes,
    goals,
    assists,
    contributions,
    yellowCards,
    redCards,
    motm,
    averageRating: ratingCount ? ratingSum / ratingCount : null,
    goalsPerMatch: appearances ? goals / appearances : 0,
    minutesPerGoalContribution: contributions ? minutes / contributions : null,
    form,
    streak,
  };
}

export interface CompetitionBreakdown extends Record_ {
  competition: Competition | null;
  goals: number;
  assists: number;
  points: number;
}

export function statsByCompetition(matches: Match[], competitions: Competition[]): CompetitionBreakdown[] {
  const byId = new Map<string, CompetitionBreakdown>();
  const keyFor = (id: string | null) => id ?? '__none__';

  for (const match of playedMatches(matches)) {
    const key = keyFor(match.competitionId);
    let entry = byId.get(key);
    if (!entry) {
      entry = {
        ...emptyRecord(),
        competition: competitions.find((c) => c.id === match.competitionId) ?? null,
        goals: 0,
        assists: 0,
        points: 0,
      };
      byId.set(key, entry);
    }
    addToRecord(entry, match.result);
    if (match.result.didPlay) {
      entry.goals += match.result.goals;
      entry.assists += match.result.assists;
    }
  }

  const out = [...byId.values()];
  for (const entry of out) entry.points = entry.wins * 3 + entry.draws;
  return out.sort((a, b) => b.played - a.played);
}

export interface VenueBreakdown extends Record_ {
  venue: Venue;
}

export function statsByVenue(matches: Match[]): VenueBreakdown[] {
  const venues: Venue[] = ['home', 'away', 'neutral'];
  return venues
    .map((venue) => {
      const rec = emptyRecord();
      for (const match of playedMatches(matches)) {
        if (match.venue === venue) addToRecord(rec, match.result);
      }
      return { venue, ...rec };
    })
    .filter((v) => v.played > 0);
}

export interface MonthBucket {
  key: string;
  label: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
}

/** Last `count` months up to and including the current month, oldest first. */
export function statsByMonth(matches: Match[], count = 6, now: Date = new Date()): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: MONTH_NAMES[d.getMonth()].slice(0, 3),
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals: 0,
      assists: 0,
    });
  }
  const index = new Map(buckets.map((b) => [b.key, b]));

  for (const match of playedMatches(matches)) {
    const bucket = index.get(match.date.slice(0, 7));
    if (!bucket) continue;
    bucket.played += 1;
    const outcome = outcomeOf(match.result);
    if (outcome === 'W') bucket.wins += 1;
    else if (outcome === 'D') bucket.draws += 1;
    else bucket.losses += 1;
    if (match.result.didPlay) {
      bucket.goals += match.result.goals;
      bucket.assists += match.result.assists;
    }
  }
  return buckets;
}

export interface OpponentBreakdown extends Record_ {
  opponent: string;
}

export function statsByOpponent(matches: Match[], limit = 5): OpponentBreakdown[] {
  const byName = new Map<string, OpponentBreakdown>();
  for (const match of playedMatches(matches)) {
    const name = match.opponent.trim() || 'Unknown';
    let entry = byName.get(name.toLowerCase());
    if (!entry) {
      entry = { opponent: name, ...emptyRecord() };
      byName.set(name.toLowerCase(), entry);
    }
    addToRecord(entry, match.result);
  }
  return [...byName.values()].sort((a, b) => b.played - a.played).slice(0, limit);
}

/** Total matches per month key, used for the calendar month summary. */
export function countMatchesInMonth(matches: Match[], year: number, month: number): number {
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  return matches.filter((m) => m.date.startsWith(key) && m.status !== 'cancelled').length;
}

/** Busiest upcoming stretch: how many matches in the next `days` days. */
export function matchesInNextDays(matches: Match[], days: number, now: Date = new Date()): Match[] {
  const start = now.getTime();
  const end = start + days * 86400000;
  return matches.filter((m) => {
    if (m.status === 'cancelled') return false;
    const t = kickoffAt(m.date, m.time).getTime();
    return t >= start && t <= end;
  });
}

/** Days since the most recent played match, or null if none. */
export function daysSinceLastMatch(matches: Match[], now: Date = new Date()): number | null {
  const last = playedMatches(matches)[0];
  if (!last) return null;
  const a = fromISODate(last.date).getTime();
  const b = fromISODate(toISODate(now)).getTime();
  return Math.round((b - a) / 86400000);
}
