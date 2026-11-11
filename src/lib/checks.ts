import type { Match, MatchResult } from '../types';
import type { MatchCheck, SquadMatch } from './academy';
import type { SquadPlayer } from './academyStats';
import { addDays, todayISO, fromISODate, toISODate } from './date';
import { pruneMetrics } from './metrics';
import { playedMatches } from './stats';
import { canonical } from './sync';

/**
 * Checking players' own figures against the coach's result. Pure, so the
 * rules about which game is which and when a check has gone stale can be
 * tested without a server.
 */

/** The parts of a result a check is about, as one string to compare. */
export function resultSignature(r: MatchResult): string {
  const played = r.didPlay && !r.walkover;
  return canonical({
    goalsFor: r.goalsFor,
    goalsAgainst: r.goalsAgainst,
    penaltiesFor: r.penaltiesFor ?? null,
    penaltiesAgainst: r.penaltiesAgainst ?? null,
    walkover: r.walkover ?? null,
    didPlay: played,
    minutes: played ? r.minutes : 0,
    motm: played ? r.motm : false,
    yellowCards: played ? r.yellowCards : 0,
    redCards: played ? r.redCards : 0,
    positionGroup: r.positionGroup,
    metrics: played ? pruneMetrics(r.metrics) : {},
    rpe: played ? r.rpe ?? null : null,
  });
}

/** Where a player's match stands with a coach: approved, denied, or changed by them since it was checked. */
export type CheckState = 'approved' | 'denied' | 'changed';

export function checkState(check: MatchCheck, match: Pick<Match, 'result'> | undefined | null): CheckState {
  const reference = check.verdict === 'denied' ? check.corrected ?? check.claimed : check.claimed;
  if (!match?.result || !reference) return check.verdict;
  return resultSignature(match.result) === resultSignature(reference) ? check.verdict : 'changed';
}

export const checkKey = (playerId: string, matchId: string) => `${playerId}:${matchId}`;

/**
 * Each player's match to its verdict. Where two academies have checked the
 * same match, this academy's own verdict is the one that counts here.
 */
export function checksByMatch(checks: MatchCheck[], academyId?: string): Map<string, MatchCheck> {
  const map = new Map<string, MatchCheck>();
  for (const c of checks) {
    const key = checkKey(c.playerId, c.matchId);
    const there = map.get(key);
    if (!there || (c.academyId === academyId && there.academyId !== academyId)) map.set(key, c);
  }
  return map;
}

/** Denials still counting against a player, from any academy that checked them. */
export function activeFlags(checks: MatchCheck[], playerId: string | null | undefined): MatchCheck[] {
  if (!playerId) return [];
  return checks.filter((c) => c.playerId === playerId && c.flagActive);
}

/** "Vale FC", "vale" and "VALE U14s" are one opponent. */
export function opponentKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !['fc', 'afc', 'cf', 'the', 'jfc', 'yfc'].includes(w) && !/^u\d{1,2}s?$/.test(w))
    .join(' ');
}

/** Loosely the same side - or one of the two names left blank, which says nothing either way. */
export function sameOpponent(a: string, b: string): boolean {
  const x = opponentKey(a);
  const y = opponentKey(b);
  if (!x || !y) return true;
  return x === y || x.includes(y) || y.includes(x);
}

export type PlayedMatch = Match & { result: MatchResult };

/** One squad player beside a coach's result: the game they logged that day, if any. */
export interface Claim {
  player: SquadPlayer;
  match: PlayedMatch | null;
}

/**
 * The game a player logged for a coach's result: on the same day, against the
 * same side. With a single game logged that day it is that one, whatever they
 * called the other team - names get typed differently.
 */
export function claimFor(player: SquadPlayer, result: Pick<SquadMatch, 'date' | 'opponent'>): PlayedMatch | null {
  const day = playedMatches(player.matches).filter((m) => m.date === result.date);
  return day.find((m) => sameOpponent(m.opponent, result.opponent)) ?? (day.length === 1 ? day[0] : null);
}

/** Everyone in the result's squad, each with their own game for it; those who logged one first. */
export function claimsFor(result: Pick<SquadMatch, 'date' | 'opponent' | 'squadId'>, players: SquadPlayer[]): Claim[] {
  if (!result.squadId) return [];
  return players
    .filter((p) => p.squadIds.includes(result.squadId!))
    .map((player) => ({ player, match: claimFor(player, result) }))
    .sort((a, b) => Number(Boolean(b.match)) - Number(Boolean(a.match)) || a.player.name.localeCompare(b.player.name));
}

/** Logged games in a coach's result still waiting for a verdict - or changed since they had one. */
export function toCheck(claims: Claim[], checks: Map<string, MatchCheck>): Claim[] {
  return claims.filter((c) => {
    if (!c.match || !c.player.playerId) return false;
    const check = checks.get(checkKey(c.player.playerId, c.match.id));
    return !check || checkState(check, c.match) === 'changed';
  });
}

/** Games players have logged that no result of the coach's covers yet, grouped as one game. */
export interface WaitingGame {
  key: string;
  date: string;
  opponent: string;
  /** The squad most of them are in, to start the coach's result with. */
  squadId: string | null;
  claims: { player: SquadPlayer; match: PlayedMatch }[];
}

/**
 * What players have logged lately that the coach hasn't put a result in for:
 * the "all those results pop up" list. A game already under a result of the
 * coach's, or already checked, isn't here - it's there.
 */
export function waitingForResult(
  players: SquadPlayer[],
  results: SquadMatch[],
  checks: Map<string, MatchCheck>,
  options: { now?: Date; days?: number; squadIds?: string[] } = {},
): WaitingGame[] {
  const now = options.now ?? new Date();
  const from = toISODate(addDays(fromISODate(todayISO(now)), -(options.days ?? 60)));
  const today = todayISO(now);
  const groups = new Map<string, WaitingGame>();
  for (const player of players) {
    if (!player.playerId) continue;
    const squads = options.squadIds ? player.squadIds.filter((id) => options.squadIds!.includes(id)) : player.squadIds;
    if (squads.length === 0) continue;
    for (const match of playedMatches(player.matches)) {
      if (match.date < from || match.date > today) continue;
      if (checks.has(checkKey(player.playerId, match.id))) continue;
      const covered = results.some(
        (r) => r.date === match.date && r.squadId && squads.includes(r.squadId) && sameOpponent(r.opponent, match.opponent),
      );
      if (covered) continue;
      const key = `${match.date}|${opponentKey(match.opponent)}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, date: match.date, opponent: match.opponent.trim(), squadId: null, claims: [] };
        groups.set(key, group);
      }
      group.claims.push({ player, match });
    }
  }
  for (const group of groups.values()) {
    const counts = new Map<string, number>();
    for (const { player } of group.claims) {
      for (const id of player.squadIds) if (!options.squadIds || options.squadIds.includes(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    group.squadId = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
    group.claims.sort((a, b) => a.player.name.localeCompare(b.player.name));
  }
  return [...groups.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.opponent.localeCompare(b.opponent)));
}

/** Whether the player's scoreline is the coach's. */
export function sameScore(claim: MatchResult, result: Pick<SquadMatch, 'goalsFor' | 'goalsAgainst'>): boolean {
  return claim.goalsFor === result.goalsFor && claim.goalsAgainst === result.goalsAgainst;
}

/**
 * Where a coach's correction starts: the player's own figures with the coach's
 * score. A keeper's goals conceded follows the score, as it does when they log
 * it themselves.
 */
export function startCorrection(claim: MatchResult, result: Pick<SquadMatch, 'goalsFor' | 'goalsAgainst'>): MatchResult {
  const metrics = { ...claim.metrics };
  if (claim.positionGroup === 'goalkeeper' && claim.didPlay) metrics.conceded = result.goalsAgainst;
  return {
    ...claim,
    goalsFor: result.goalsFor,
    goalsAgainst: result.goalsAgainst,
    // A different score is no longer the draw a shootout followed.
    penaltiesFor: result.goalsFor === result.goalsAgainst ? claim.penaltiesFor : null,
    penaltiesAgainst: result.goalsFor === result.goalsAgainst ? claim.penaltiesAgainst : null,
    walkover: null,
    metrics,
  };
}

/** The correction as it is sent: no zero stats, nothing set for a player who didn't play. */
export function finishCorrection(result: MatchResult): MatchResult {
  return result.didPlay
    ? { ...result, metrics: pruneMetrics(result.metrics) }
    : { ...result, minutes: 0, motm: false, yellowCards: 0, redCards: 0, metrics: {}, rpe: null };
}
