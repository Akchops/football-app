import { bandFor, bandToDeclare, childOnly, playerIsChild, readGate, reloadGate, type AgeGate } from './ageGate';

const NOW = new Date(2026, 10, 13); // 13 Nov 2026

describe('the age question', () => {
  it('sorts a month and year into a child or an adult, at 18 as Indian law has it', () => {
    expect(bandFor(2016, 3, NOW)).toBe('child');
    expect(bandFor(2011, 1, NOW)).toBe('child'); // 15: a child under the DPDP Act
    expect(bandFor(2008, 10, NOW)).toBe('adult'); // 18 last month
    expect(bandFor(1980, 6, NOW)).toBe('adult');
  });

  it('takes the birth month itself as the birthday not yet come - the younger answer', () => {
    expect(bandFor(2008, 11, NOW)).toBe('child');
    expect(bandFor(2008, 12, NOW)).toBe('child');
  });

  it('reads an earlier build\'s "teen" answer as a child', () => {
    const store = new Map<string, string>([['matchday.ageGate.v1', JSON.stringify({ holder: 'teen', parent: false })]]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: () => {}, removeItem: () => {} });
    reloadGate();
    expect(readGate()?.holder).toBe('child');
    vi.unstubAllGlobals();
    reloadGate();
  });
});

describe("a player's date of birth", () => {
  it('is a child until the 18th birthday itself', () => {
    expect(playerIsChild('2008-11-14', NOW)).toBe(true);
    expect(playerIsChild('2008-11-13', NOW)).toBe(false);
    expect(playerIsChild('2011-05-01', NOW)).toBe(true);
    expect(playerIsChild('2000-05-01', NOW)).toBe(false);
  });

  it('counts as a child when there is no usable date, as the server does', () => {
    expect(playerIsChild('', NOW)).toBe(true);
    expect(playerIsChild('soon', NOW)).toBe(true);
  });
});

describe('what may leave the phone', () => {
  const gate = (change: Partial<AgeGate>): AgeGate => ({ holder: 'adult', parent: false, localOnly: false, recorded: [], ...change });

  it('nothing for a child until a parent or guardian signs in', () => {
    expect(childOnly(gate({ holder: 'child' }))).toBe(true);
    expect(bandToDeclare(gate({ holder: 'child' }))).toBeNull();
    expect(childOnly(gate({ holder: 'child', parent: true }))).toBe(false);
    expect(bandToDeclare(gate({ holder: 'child', parent: true }))).toBe('adult');
  });

  it('an adult signs in as themselves', () => {
    expect(childOnly(gate({ holder: 'adult' }))).toBe(false);
    expect(bandToDeclare(gate({ holder: 'adult' }))).toBe('adult');
    expect(childOnly(null)).toBe(false);
  });
});
