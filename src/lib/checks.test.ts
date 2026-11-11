import { describe, expect, it } from 'vitest';
import { emptyResult, type Match, type MatchResult } from '../types';
import type { MatchCheck, SquadMatch } from './academy';
import { BOARD_BY_ID, FLAG_PENALTY, NO_FILTER, leaderboard, ratingOf, type SquadPlayer } from './academyStats';
import {
  activeFlags, checkKey, checkState, checksByMatch, claimFor, claimsFor, finishCorrection, opponentKey, resultSignature,
  sameOpponent, startCorrection, toCheck, waitingForResult,
} from './checks';
import { formatLoad, matchLoad } from './load';
import { computeStats } from './stats';

let seq = 0;

function result(over: Partial<MatchResult> = {}): MatchResult {
  return { ...emptyResult('ST'), goalsFor: 2, goalsAgainst: 1, minutes: 60, metrics: { goals: 1 }, ...over };
}

function game(date: string, opponent = 'Vale', over: Partial<MatchResult> = {}): Match {
  seq += 1;
  return {
    id: `m${seq}`, competitionId: null, teamId: null, opponent, date, time: '10:30', venue: 'home', location: '',
    durationMinutes: 60, status: 'played', result: result(over), stage: null, stageDetail: '', notes: '', remindAfter: null,
    createdAt: '', updatedAt: '', deletedAt: null,
  };
}

function player(id: string, matches: Match[], over: Partial<SquadPlayer> = {}): SquadPlayer {
  return {
    id, name: id.toUpperCase(), position: 'ST', positionGroup: 'forward', ageGroup: 'U14', squadIds: ['elite'], matches,
    competitions: [], playerId: `p_${id}`, ...over,
  };
}

function check(playerId: string, matchId: string, over: Partial<MatchCheck> = {}): MatchCheck {
  return {
    id: `c_${matchId}`, academyId: 'acad', academyName: 'Riverside', playerId, matchId, squadMatchId: null, verdict: 'approved',
    claimed: result(), corrected: null, note: '', reviewedBy: 'coach', reviewedAt: '', flagActive: false, ...over,
  };
}

const coachResult = (over: Partial<SquadMatch> = {}): SquadMatch => ({
  id: 'sm1', squadId: 'elite', date: '2026-11-08', opponent: 'Vale', venue: 'home', goalsFor: 2, goalsAgainst: 1, notes: '',
  createdAt: '', updatedAt: '', ...over,
});

describe('match load', () => {
  it('is effort times minutes, and nothing without an effort rating', () => {
    expect(matchLoad(result({ rpe: 15, minutes: 60 }))).toBe(900);
    expect(matchLoad(result({ rpe: null }))).toBeNull();
    expect(matchLoad(result({ rpe: 15, didPlay: false }))).toBeNull();
    expect(formatLoad(1234)).toBe('1,234 AU');
  });

  it('adds up across the games that were rated', () => {
    const stats = computeStats([game('2026-11-01', 'A', { rpe: 14, minutes: 50 }), game('2026-11-02', 'B', { rpe: 16, minutes: 60 }), game('2026-11-03')]);
    expect(stats.load).toBe(14 * 50 + 16 * 60);
    expect(stats.rpeGames).toBe(2);
    expect(stats.averageRpe).toBe(15);
  });
});

describe('opponents', () => {
  it('are the same side however they were typed', () => {
    expect(opponentKey('Vale FC U14s')).toBe('vale');
    expect(sameOpponent('Vale', 'VALE fc')).toBe(true);
    expect(sameOpponent('Vale', 'Hilltop')).toBe(false);
    expect(sameOpponent('', 'Hilltop')).toBe(true);
  });
});

describe('a player beside the coach\'s result', () => {
  it('is matched to their game that day against that side', () => {
    const vale = game('2026-11-08', 'Vale FC');
    const other = game('2026-11-08', 'Moor');
    expect(claimFor(player('a', [other, vale]), coachResult())?.id).toBe(vale.id);
  });

  it('is matched to their only game that day, whatever they called the other side', () => {
    const only = game('2026-11-08', 'The Valley lot');
    expect(claimFor(player('a', [only]), coachResult())?.id).toBe(only.id);
    expect(claimFor(player('a', [game('2026-11-07')]), coachResult())).toBeNull();
  });

  it('lists the squad, those who logged the game first', () => {
    const claims = claimsFor(coachResult(), [
      player('zed', [game('2026-11-08')]),
      player('amy', []),
      player('out', [game('2026-11-08')], { squadIds: ['dev'] }),
    ]);
    expect(claims.map((c) => c.player.id)).toEqual(['zed', 'amy']);
  });
});

describe('a check', () => {
  it('stands while the player leaves their figures alone', () => {
    const m = game('2026-11-08');
    expect(checkState(check('p_a', m.id, { claimed: m.result }), m)).toBe('approved');
  });

  it('goes stale when the player changes their figures afterwards', () => {
    const m = game('2026-11-08');
    const c = check('p_a', m.id, { claimed: m.result });
    expect(checkState(c, { result: { ...m.result!, metrics: { goals: 3 } } })).toBe('changed');
  });

  it('is not upset by fields that say nothing, like a zero stat', () => {
    const m = game('2026-11-08');
    expect(resultSignature({ ...m.result!, metrics: { goals: 1, assists: 0 } })).toBe(resultSignature(m.result!));
  });

  it('after a correction, compares with the coach\'s figures', () => {
    const m = game('2026-11-08', 'Vale', { metrics: { goals: 1 } });
    const c = check('p_a', m.id, { verdict: 'denied', claimed: result({ metrics: { goals: 4 } }), corrected: m.result, flagActive: true });
    expect(checkState(c, m)).toBe('denied');
    expect(checkState(c, { result: result({ metrics: { goals: 4 } }) })).toBe('changed');
  });

  it('from this academy counts over another academy\'s on the same match', () => {
    const theirs = check('p_a', 'm1', { academyId: 'other', verdict: 'denied' });
    const ours = check('p_a', 'm1', { academyId: 'acad' });
    expect(checksByMatch([theirs, ours], 'acad').get(checkKey('p_a', 'm1'))).toBe(ours);
    expect(checksByMatch([ours, theirs], 'acad').get(checkKey('p_a', 'm1'))).toBe(ours);
  });

  it('is still to do for a logged game with none, or one changed since', () => {
    const done = game('2026-11-08');
    const changed = game('2026-11-08');
    const claims = [
      { player: player('a', [done]), match: { ...done, result: done.result! } },
      { player: player('b', [changed]), match: { ...changed, result: { ...changed.result!, minutes: 10 } } },
      { player: player('c', [game('2026-11-08')]), match: null },
    ];
    const checks = checksByMatch([check('p_a', done.id, { claimed: done.result }), check('p_b', changed.id, { claimed: changed.result })]);
    expect(toCheck(claims, checks).map((c) => c.player.id)).toEqual(['b']);
  });
});

describe('games waiting for a result', () => {
  const now = new Date(2026, 10, 10, 12);

  it('groups what players logged by day and opponent, with the squad most of them are in', () => {
    const waiting = waitingForResult(
      [
        player('a', [game('2026-11-08', 'Vale')]),
        player('b', [game('2026-11-08', 'vale fc')], { squadIds: ['elite', 'dubai'] }),
        player('c', [game('2026-11-01', 'Moor')]),
      ],
      [],
      new Map(),
      { now },
    );
    expect(waiting.map((w) => [w.date, w.claims.length, w.squadId])).toEqual([
      ['2026-11-08', 2, 'elite'],
      ['2026-11-01', 1, 'elite'],
    ]);
  });

  it('leaves out games the coach already has a result for, or has checked, or are old or not in a squad', () => {
    const covered = game('2026-11-08', 'Vale');
    const checked = game('2026-11-07', 'Moor');
    const waiting = waitingForResult(
      [
        player('a', [covered, checked, game('2026-05-01', 'Ancient')]),
        player('nosquad', [game('2026-11-06', 'Castle')], { squadIds: [] }),
        player('noapp', [game('2026-11-06', 'Castle')], { playerId: null }),
      ],
      [coachResult()],
      checksByMatch([check('p_a', checked.id)]),
      { now },
    );
    expect(waiting).toEqual([]);
  });
});

describe('a correction', () => {
  it('starts from the player\'s figures with the coach\'s score, conceded following it for a keeper', () => {
    const claim = result({ positionGroup: 'goalkeeper', position: 'GK', goalsFor: 3, goalsAgainst: 0, metrics: { saves: 12, conceded: 0 } });
    const start = startCorrection(claim, { goalsFor: 1, goalsAgainst: 2 });
    expect([start.goalsFor, start.goalsAgainst, start.metrics.conceded, start.metrics.saves]).toEqual([1, 2, 2, 12]);
  });

  it('sends nothing for a player who did not play', () => {
    const done = finishCorrection(result({ didPlay: false, minutes: 60, motm: true, rpe: 15 }));
    expect([done.minutes, done.motm, done.rpe, done.metrics]).toEqual([0, false, null, {}]);
  });
});

describe('a flag', () => {
  it('is any denial still counting, from any academy', () => {
    const checks = [check('p_a', 'm1', { verdict: 'denied', flagActive: true }), check('p_a', 'm2', { verdict: 'denied' }), check('p_b', 'm3')];
    expect(activeFlags(checks, 'p_a')).toHaveLength(1);
    expect(activeFlags(checks, 'p_b')).toHaveLength(0);
  });

  it('takes points off the match score the academy ranks by', () => {
    expect(ratingOf(70, true)).toBe(70 - FLAG_PENALTY);
    expect(ratingOf(5, true)).toBe(0);
    expect(ratingOf(70)).toBe(70);
    const honest = player('honest', [game('2026-11-08')]);
    const flagged = player('flagged', [game('2026-11-08')], { flagged: true });
    const rows = leaderboard([flagged, honest], NO_FILTER, BOARD_BY_ID.matchScore);
    expect(rows.map((r) => r.player.id)).toEqual(['honest', 'flagged']);
    expect(rows[0].value - rows[1].value).toBe(FLAG_PENALTY);
  });
});
