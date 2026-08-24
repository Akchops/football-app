import { describe, expect, it } from 'vitest';
import { emptyResult, type MatchResult } from '../types';
import { matchScore, scoreBand, scoreVerdict } from './score';

function keeper(over: Partial<MatchResult> = {}): MatchResult {
  return { ...emptyResult('GK'), ...over };
}
function striker(over: Partial<MatchResult> = {}): MatchResult {
  return { ...emptyResult('ST'), ...over };
}

describe('matchScore', () => {
  it('scores a keeper on saves and clean sheets, not on goals', () => {
    const shutout = matchScore(keeper({ goalsFor: 1, goalsAgainst: 0, metrics: { saves: 5 } }));
    const leaky = matchScore(keeper({ goalsFor: 1, goalsAgainst: 3, metrics: { saves: 1, conceded: 3 } }));
    expect(shutout.score).toBeGreaterThan(leaky.score);
    expect(shutout.breakdown.some((p) => p.label === 'Clean sheet')).toBe(true);
  });

  it('rewards a keeper for saves even in a defeat', () => {
    const busy = matchScore(keeper({ goalsFor: 0, goalsAgainst: 1, metrics: { saves: 9, conceded: 1 } }));
    const quiet = matchScore(keeper({ goalsFor: 0, goalsAgainst: 1, metrics: { saves: 0, conceded: 1 } }));
    expect(busy.score).toBeGreaterThan(quiet.score);
    expect(busy.score).toBeGreaterThan(60);
  });

  it('counts penalties saved', () => {
    const withPen = matchScore(keeper({ goalsAgainst: 0, metrics: { saves: 3, penaltiesSaved: 1 } }));
    const withoutPen = matchScore(keeper({ goalsAgainst: 0, metrics: { saves: 3 } }));
    expect(withPen.score).toBeGreaterThan(withoutPen.score);
  });

  it('falls back to the team goals against when per-match conceded was left blank', () => {
    const score = matchScore(keeper({ goalsFor: 0, goalsAgainst: 2, metrics: { saves: 2 } }));
    expect(score.breakdown.some((p) => p.label === '2 conceded')).toBe(true);
  });

  it('scores a striker on goals', () => {
    const brace = matchScore(striker({ goalsFor: 2, goalsAgainst: 0, metrics: { goals: 2, shots: 4, shotsOnTarget: 3 } }));
    const anonymous = matchScore(striker({ goalsFor: 2, goalsAgainst: 0, metrics: { shots: 1 } }));
    expect(brace.score).toBeGreaterThan(anonymous.score);
  });

  it('gives the same stat line a different score by position', () => {
    const metrics = { goals: 0, saves: 6 };
    const asKeeper = matchScore(keeper({ goalsAgainst: 0, metrics }));
    const asStriker = matchScore(striker({ goalsAgainst: 0, metrics }));
    expect(asKeeper.score).toBeGreaterThan(asStriker.score);
  });

  it('penalises a red card', () => {
    const clean = matchScore(striker({ goalsFor: 1, goalsAgainst: 0, metrics: { goals: 1 } }));
    const sentOff = matchScore(striker({ goalsFor: 1, goalsAgainst: 0, metrics: { goals: 1 }, redCards: 1 }));
    expect(sentOff.score).toBeLessThan(clean.score);
  });

  it('keeps a short cameo close to the middle of the range', () => {
    const cameo = matchScore(striker({ goalsFor: 3, goalsAgainst: 0, minutes: 10, metrics: {} }));
    expect(cameo.score).toBeGreaterThan(40);
    expect(cameo.score).toBeLessThan(75);
  });

  it('treats a full game as a full game however long the match is', () => {
    // 60 minutes in a 60-minute youth match is a full shift, not two thirds of one.
    const shortGame = matchScore(keeper({ goalsAgainst: 0, minutes: 60, metrics: { saves: 4 } }), 60);
    const fullNinety = matchScore(keeper({ goalsAgainst: 0, minutes: 90, metrics: { saves: 4 } }), 90);
    expect(shortGame.score).toBe(fullNinety.score);
  });

  it('still discounts a cameo measured against the real match length', () => {
    const cameo = matchScore(keeper({ goalsAgainst: 0, minutes: 10, metrics: { saves: 4 } }), 60);
    const wholeGame = matchScore(keeper({ goalsAgainst: 0, minutes: 60, metrics: { saves: 4 } }), 60);
    expect(cameo.score).toBeLessThan(wholeGame.score);
  });

  it('does not punish a 40-minute tournament game for not being 90 minutes', () => {
    const tournamentGame = matchScore(keeper({ goalsAgainst: 0, minutes: 40, metrics: { saves: 3 } }), 40);
    const judgedAsNinety = matchScore(keeper({ goalsAgainst: 0, minutes: 40, metrics: { saves: 3 } }), 90);
    expect(tournamentGame.score).toBeGreaterThan(judgedAsNinety.score);
  });

  it('falls back to 90 minutes when no length is given', () => {
    const result = keeper({ goalsAgainst: 0, minutes: 90, metrics: { saves: 4 } });
    expect(matchScore(result).score).toBe(matchScore(result, 90).score);
  });

  it('stays inside 1-100 however extreme the stat line', () => {
    const huge = matchScore(keeper({ goalsAgainst: 0, metrics: { saves: 40, penaltiesSaved: 10 }, motm: true }));
    const awful = matchScore(keeper({ goalsFor: 0, goalsAgainst: 12, metrics: { conceded: 12 }, redCards: 1 }));
    expect(huge.score).toBeLessThanOrEqual(100);
    expect(awful.score).toBeGreaterThanOrEqual(1);
  });

  it('scores a match the player sat out as zero with no breakdown', () => {
    const benched = matchScore(keeper({ didPlay: false }));
    expect(benched.score).toBe(0);
    expect(benched.breakdown).toEqual([]);
  });

  it('blends in a self rating when one was given', () => {
    const base = keeper({ goalsAgainst: 0, metrics: { saves: 4 } });
    const harsh = matchScore({ ...base, rating: 4 });
    const generous = matchScore({ ...base, rating: 10 });
    expect(generous.score).toBeGreaterThan(harsh.score);
  });

  it('bands and describes scores', () => {
    expect(scoreBand(85)).toBe('great');
    expect(scoreBand(70)).toBe('good');
    expect(scoreBand(55)).toBe('ok');
    expect(scoreBand(30)).toBe('poor');
    expect(scoreVerdict(95)).toBe('Outstanding');
  });
});
