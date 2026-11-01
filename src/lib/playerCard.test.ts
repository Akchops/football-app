import { describe, expect, it } from 'vitest';
import { emptyResult, type Match, type MatchResult } from '../types';
import { playerCard, tierFor } from './playerCard';

let seq = 0;
function played(result: Partial<MatchResult>, date = `2026-09-${String((seq % 27) + 1).padStart(2, '0')}`): Match {
  seq += 1;
  return {
    id: `m${seq}`, competitionId: null, teamId: null, opponent: `Team ${seq}`, date, time: '10:30', venue: 'home',
    location: '', durationMinutes: 70, status: 'played', stage: null, stageDetail: '', notes: '', remindAfter: null,
    createdAt: '', updatedAt: '', deletedAt: null,
    result: { ...emptyResult('GK', undefined, 70), ...result },
  };
}
const keeper = { position: 'GK', positionGroup: 'goalkeeper' as const };

describe('tierFor', () => {
  it('follows the game: bronze under 65, silver to 74, gold from 75', () => {
    expect([null, 40, 64, 65, 74, 75, 99].map(tierFor)).toEqual(['none', 'bronze', 'bronze', 'silver', 'silver', 'gold', 'gold']);
  });
});

describe('playerCard', () => {
  it('has no rating until a match is played', () => {
    const card = playerCard([], keeper);
    expect(card.rating).toBeNull();
    expect(card.tier).toBe('none');
    expect(card.stats.map((s) => s.value)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("builds a keeper's six from their own totals", () => {
    const card = playerCard(
      [
        played({ goalsAgainst: 0, metrics: { saves: 6, claims: 2 } }, '2026-09-05'),
        played({ goalsAgainst: 2, metrics: { saves: 3, penaltiesSaved: 1 } }, '2026-09-12'),
      ],
      keeper,
    );
    expect(Object.fromEntries(card.stats.map((s) => [s.code, s.value]))).toEqual({ SAV: 9, CS: 1, PEN: 1, CLM: 2, APP: 2, MOTM: 0 });
    expect(card.rating).not.toBeNull();
    expect(card.position).toBe('GK');
  });

  it('is in form after man of the match in one of the last three games', () => {
    const games = [
      played({ motm: true }, '2026-09-01'),
      played({}, '2026-09-08'),
      played({}, '2026-09-15'),
      played({}, '2026-09-22'),
    ];
    expect(playerCard(games, keeper).tier).not.toBe('inform');
    expect(playerCard([...games, played({ motm: true }, '2026-09-29')], keeper).tier).toBe('inform');
  });

  it('shows an outfield player goals, assists and chances', () => {
    const card = playerCard([played({ positionGroup: 'forward', position: 'ST', metrics: { goals: 2, assists: 1, shots: 5 } })], {
      position: 'ST',
      positionGroup: 'forward',
    });
    expect(card.stats.map((s) => `${s.code} ${s.value}`)).toEqual(['GOL 2', 'AST 1', 'SHT 5', 'CHN 0', 'APP 1', 'MOTM 0']);
  });
});
