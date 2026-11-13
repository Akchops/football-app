import { bandFor, bandToDeclare, childOnly, playerIsChild, type AgeGate } from './ageGate';

const NOW = new Date(2026, 10, 13); // 13 Nov 2026

describe('the age question', () => {
  it('sorts a month and year into a band', () => {
    expect(bandFor(2016, 3, NOW)).toBe('child');
    expect(bandFor(2013, 10, NOW)).toBe('teen'); // 13 last month
    expect(bandFor(2008, 1, NOW)).toBe('adult');
    expect(bandFor(1980, 6, NOW)).toBe('adult');
  });

  it('takes the birth month itself as the birthday not yet come - the younger answer', () => {
    expect(bandFor(2013, 11, NOW)).toBe('child');
    expect(bandFor(2013, 12, NOW)).toBe('child');
    expect(bandFor(2008, 11, NOW)).toBe('teen');
    expect(bandFor(2008, 10, NOW)).toBe('adult');
  });
});

describe("a player's date of birth", () => {
  it('is under 13 until the 13th birthday itself', () => {
    expect(playerIsChild('2013-11-14', NOW)).toBe(true);
    expect(playerIsChild('2013-11-13', NOW)).toBe(false);
    expect(playerIsChild('2010-05-01', NOW)).toBe(false);
  });

  it('counts as under 13 when there is no usable date, as the server does', () => {
    expect(playerIsChild('', NOW)).toBe(true);
    expect(playerIsChild('soon', NOW)).toBe(true);
  });
});

describe('what may leave the phone', () => {
  const gate = (change: Partial<AgeGate>): AgeGate => ({ holder: 'teen', parent: false, localOnly: false, recorded: [], ...change });

  it('nothing for a child until a parent or guardian signs in', () => {
    expect(childOnly(gate({ holder: 'child' }))).toBe(true);
    expect(bandToDeclare(gate({ holder: 'child' }))).toBeNull();
    expect(childOnly(gate({ holder: 'child', parent: true }))).toBe(false);
    expect(bandToDeclare(gate({ holder: 'child', parent: true }))).toBe('adult');
  });

  it('a teenager or adult signs in as themselves', () => {
    expect(childOnly(gate({ holder: 'teen' }))).toBe(false);
    expect(bandToDeclare(gate({ holder: 'teen' }))).toBe('teen');
    expect(bandToDeclare(gate({ holder: 'adult' }))).toBe('adult');
    expect(childOnly(null)).toBe(false);
  });
});
