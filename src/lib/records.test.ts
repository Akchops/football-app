import { beforeEach, describe, expect, it } from 'vitest';
import { emptyResult, type Match, type MatchResult } from '../types';
import { milestones, personalBests } from './records';

let seq = 0;
beforeEach(() => {
  seq = 0;
});

/** Sequential match days from 1 Apr 2026, rolling into May rather than hitting 32 April. */
function nthDate(n: number): string {
  const d = new Date(2026, 3, n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type PlayedOver = Omit<Partial<Match>, 'result'> & { result?: Partial<MatchResult> };

function played(over: PlayedOver = {}): Match {
  seq += 1;
  const { result, ...matchOver } = over;
  return {
    id: `m${seq}`,
    competitionId: null,
    teamId: null,
    opponent: `Team ${seq}`,
    date: nthDate(seq),
    time: '16:30',
    venue: 'home',
    location: '',
    durationMinutes: 90,
    status: 'played',
    notes: '',
    remindAfter: null,
    createdAt: '',
    updatedAt: '',
    result: { ...emptyResult('GK'), ...result },
    ...matchOver,
  };
}

describe('personalBests', () => {
  it('is empty until something has been played', () => {
    expect(personalBests([], 'goalkeeper')).toEqual([]);
  });

  it('finds a keeper\'s best save haul and says where it happened', () => {
    const list = personalBests(
      [
        played({ opponent: 'Riverside', result: { metrics: { saves: 3 } } }),
        played({ opponent: 'Kingsway', result: { metrics: { saves: 9 } } }),
      ],
      'goalkeeper',
    );
    const saves = list.find((b) => b.id === 'saves');
    expect(saves?.value).toBe('9');
    expect(saves?.detail).toContain('Kingsway');
  });

  it('measures the longest clean sheet run, not just the latest one', () => {
    const list = personalBests(
      [
        played({ result: { goalsAgainst: 0 } }),
        played({ result: { goalsAgainst: 0 } }),
        played({ result: { goalsAgainst: 0 } }),
        played({ result: { goalsAgainst: 2 } }),
        played({ result: { goalsAgainst: 0 } }),
      ],
      'goalkeeper',
    );
    expect(list.find((b) => b.id === 'cleanSheetRun')?.value).toBe('3 games');
  });

  it('tracks an unbeaten run through draws', () => {
    const list = personalBests(
      [
        played({ result: { goalsFor: 1, goalsAgainst: 0 } }),
        played({ result: { goalsFor: 1, goalsAgainst: 1 } }),
        played({ result: { goalsFor: 2, goalsAgainst: 0 } }),
        played({ result: { goalsFor: 0, goalsAgainst: 3 } }),
      ],
      'goalkeeper',
    );
    expect(list.find((b) => b.id === 'unbeaten')?.value).toBe('3 games');
  });

  it('shows goals for outfielders and never for keepers', () => {
    const matches = [played({ result: { positionGroup: 'forward', position: 'ST', metrics: { goals: 3 } } })];
    expect(personalBests(matches, 'forward').some((b) => b.id === 'goals')).toBe(true);
    expect(personalBests(matches, 'goalkeeper').some((b) => b.id === 'goals')).toBe(false);
  });

  it('ignores matches the player sat out', () => {
    const list = personalBests([played({ result: { didPlay: false, metrics: { saves: 20 } } })], 'goalkeeper');
    expect(list).toEqual([]);
  });
});

describe('milestones', () => {
  it('reports progress towards the next tier', () => {
    const matches = Array.from({ length: 3 }, () => played({ result: { metrics: { saves: 2 } } }));
    const apps = milestones(matches, 'goalkeeper').find((m) => m.id === 'appearances');
    expect(apps?.current).toBe(3);
    expect(apps?.target).toBe(5);
    expect(apps?.achieved).toBe(false);
    expect(apps?.banked).toBe(1); // only the "1 appearance" tier is behind them
  });

  it('banks each tier that has been passed', () => {
    const matches = Array.from({ length: 12 }, () => played());
    const apps = milestones(matches, 'goalkeeper').find((m) => m.id === 'appearances');
    expect(apps?.banked).toBe(3); // 1, 5 and 10
    expect(apps?.target).toBe(25);
  });

  it('records the date a tier was reached', () => {
    const matches = Array.from({ length: 5 }, () => played());
    const apps = milestones(matches, 'goalkeeper').find((m) => m.id === 'appearances');
    expect(apps?.achievedOn).toBe('2026-04-05');
  });

  it('gives keepers saves and clean sheets, outfielders goals and assists', () => {
    const ids = (group: 'goalkeeper' | 'forward') => milestones([played()], group).map((m) => m.id);
    expect(ids('goalkeeper')).toEqual(expect.arrayContaining(['saves', 'cleanSheets']));
    expect(ids('goalkeeper')).not.toContain('goals');
    expect(ids('forward')).toEqual(expect.arrayContaining(['goals', 'assists']));
    expect(ids('forward')).not.toContain('saves');
  });

  it('marks a milestone achieved once the top tier is passed', () => {
    const matches = Array.from({ length: 30 }, () => played({ result: { motm: true } }));
    const motm = milestones(matches, 'goalkeeper').find((m) => m.id === 'motm');
    expect(motm?.achieved).toBe(true);
  });

  it('copes with no matches at all', () => {
    const list = milestones([], 'goalkeeper');
    expect(list.every((m) => m.current === 0 && m.banked === 0 && !m.achieved)).toBe(true);
  });
});
