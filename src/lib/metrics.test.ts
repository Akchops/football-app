import { describe, expect, it } from 'vitest';
import { groupForPosition, metricsForGroup } from '../types';
import { addMetrics, formMetricsFor, positionStatCards, pruneMetrics, showsTeamAttack } from './metrics';

describe('position groups', () => {
  it('maps shirt positions onto stat sets', () => {
    expect(groupForPosition('GK')).toBe('goalkeeper');
    expect(groupForPosition('CB')).toBe('defender');
    expect(groupForPosition('CAM')).toBe('midfielder');
    expect(groupForPosition('ST')).toBe('forward');
  });

  it('tracks saves only for keepers and shots only for attacking players', () => {
    const keeperIds = metricsForGroup('goalkeeper').map((m) => m.id);
    const strikerIds = metricsForGroup('forward').map((m) => m.id);
    expect(keeperIds).toContain('saves');
    expect(keeperIds).not.toContain('shots');
    expect(strikerIds).toContain('shots');
    expect(strikerIds).not.toContain('saves');
  });

  it('gives defenders defensive work and keeps goals available', () => {
    const ids = metricsForGroup('defender').map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['tackles', 'interceptions', 'clearances', 'blocks', 'goals']));
  });
});

describe('metric totals', () => {
  it('adds metric maps together', () => {
    expect(addMetrics({ saves: 2 }, { saves: 3, conceded: 1 })).toEqual({ saves: 5, conceded: 1 });
  });

  it('drops zeroes so an untouched stat stays untouched', () => {
    expect(pruneMetrics({ saves: 3, conceded: 0, goals: 0 })).toEqual({ saves: 3 });
  });

  it('keeps showing a stat that was already recorded under another position', () => {
    const ids = formMetricsFor('goalkeeper', { goals: 1 }).map((m) => m.id);
    expect(ids).toContain('saves');
    expect(ids).toContain('goals');
  });
});

describe('positionStatCards', () => {
  const input = {
    appearances: 4,
    played: 4,
    minutes: 360,
    cleanSheetsPlayed: 2,
    goalsAgainst: 4,
    totals: { saves: 12, conceded: 4, penaltiesSaved: 1, goals: 0 },
  };

  it('leads with clean sheets, conceded and saves for a keeper - never goals scored', () => {
    const labels = positionStatCards('goalkeeper', input).map((c) => c.label);
    expect(labels.slice(0, 3)).toEqual(['Clean sheets', 'Goals conceded', 'Saves']);
    expect(labels).not.toContain('Goals');
  });

  it('works out save percentage from saves and goals conceded', () => {
    const savePct = positionStatCards('goalkeeper', input).find((c) => c.label === 'Save %');
    expect(savePct?.value).toBe('75%'); // 12 saves out of 16 shots faced
  });

  it('falls back to the team goals against when conceded was never entered per match', () => {
    const cards = positionStatCards('goalkeeper', { ...input, totals: { saves: 6 } });
    expect(cards.find((c) => c.label === 'Goals conceded')?.value).toBe('4');
  });

  it('leads with defensive work for a defender', () => {
    const labels = positionStatCards('defender', { ...input, totals: { tackles: 8, interceptions: 6 } }).map((c) => c.label);
    expect(labels.slice(0, 3)).toEqual(['Clean sheets', 'Tackles won', 'Interceptions']);
  });

  it('leads with goals and conversion for a forward', () => {
    const cards = positionStatCards('forward', { ...input, totals: { goals: 3, shots: 12, shotsOnTarget: 6 } });
    expect(cards[0].label).toBe('Goals');
    expect(cards.find((c) => c.label === 'Conversion')?.value).toBe('25%');
  });

  it('handles a player with no appearances without dividing by zero', () => {
    const cards = positionStatCards('goalkeeper', {
      appearances: 0, played: 0, minutes: 0, cleanSheetsPlayed: 0, goalsAgainst: 0, totals: {},
    });
    expect(cards.every((c) => c.value !== 'NaN' && !c.sub?.includes('NaN'))).toBe(true);
  });

  it('hides the team attacking tile for keepers only', () => {
    expect(showsTeamAttack('goalkeeper')).toBe(false);
    expect(showsTeamAttack('defender')).toBe(true);
  });
});
