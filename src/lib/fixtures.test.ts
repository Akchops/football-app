import { describe, expect, it } from 'vitest';
import type { Match } from '../types';
import {
  buildRows,
  findDuplicate,
  importable,
  isRealDate,
  matchCompetition,
  normaliseOpponent,
  problemWith,
  toMatchInput,
  type ParsedFixture,
} from './fixtures';

const TODAY = '2026-08-27';

function fixture(over: Partial<ParsedFixture> = {}): ParsedFixture {
  return {
    date: '2026-09-12',
    time: '16:30',
    opponent: 'Oakwood United',
    venue: 'away',
    competition: 'U16 South Division',
    location: '',
    durationMinutes: 0,
    confidence: 'high',
    ...over,
  };
}

function match(over: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    competitionId: null,
    teamId: null,
    opponent: 'Oakwood United',
    date: '2026-09-12',
    time: '16:30',
    venue: 'away',
    location: '',
    durationMinutes: 90,
    status: 'scheduled',
    result: null,
    notes: '',
    remindAfter: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

describe('isRealDate', () => {
  it('accepts a real date', () => {
    expect(isRealDate('2026-09-12')).toBe(true);
  });

  it('rejects a date that looks right but does not exist', () => {
    expect(isRealDate('2026-02-31')).toBe(false);
    expect(isRealDate('2026-13-01')).toBe(false);
  });

  it('rejects anything not in ISO form', () => {
    expect(isRealDate('12/09/2026')).toBe(false);
    expect(isRealDate('Sat 12 Sep')).toBe(false);
    expect(isRealDate('')).toBe(false);
  });
});

describe('problemWith', () => {
  it('passes a clean row', () => {
    expect(problemWith(fixture(), TODAY)).toBe('');
  });

  it('allows a row with no kickoff time', () => {
    expect(problemWith(fixture({ time: '' }), TODAY)).toBe('');
  });

  it('catches an unreadable date', () => {
    expect(problemWith(fixture({ date: 'Sat 12 Sep' }), TODAY)).toMatch(/date/i);
  });

  it('catches a 12-hour time that never got converted', () => {
    expect(problemWith(fixture({ time: '4.30pm' }), TODAY)).toMatch(/kickoff/i);
    expect(problemWith(fixture({ time: '25:00' }), TODAY)).toMatch(/kickoff/i);
  });

  it('catches a missing opponent', () => {
    expect(problemWith(fixture({ opponent: '   ' }), TODAY)).toMatch(/opponent/i);
  });

  it('catches a year the model got wrong in either direction', () => {
    expect(problemWith(fixture({ date: '2024-09-12' }), TODAY)).toMatch(/year ago/i);
    expect(problemWith(fixture({ date: '2029-09-12' }), TODAY)).toMatch(/two years/i);
  });

  it('still allows a fixture from last season being backfilled', () => {
    expect(problemWith(fixture({ date: '2026-03-01' }), TODAY)).toBe('');
  });
});

describe('normaliseOpponent', () => {
  it('treats club-name variants as the same team', () => {
    expect(normaliseOpponent('Oakwood Utd U16')).toBe(normaliseOpponent('Oakwood United'));
    expect(normaliseOpponent('Riverside F.C.')).toBe(normaliseOpponent('Riverside FC'));
    expect(normaliseOpponent('  BROOKSIDE   ATHLETIC ')).toBe('brookside athletic');
  });

  it('keeps genuinely different clubs apart', () => {
    expect(normaliseOpponent('Oakwood United')).not.toBe(normaliseOpponent('Oakhill United'));
  });

  it('does not collapse a name that is only a suffix', () => {
    expect(normaliseOpponent('FC')).toBe('');
  });
});

describe('findDuplicate', () => {
  it('spots the same fixture already on the calendar', () => {
    expect(findDuplicate(fixture(), [match()])?.id).toBe('m1');
  });

  it('spots it through a differently written club name', () => {
    expect(findDuplicate(fixture({ opponent: 'Oakwood Utd U16' }), [match()])?.id).toBe('m1');
  });

  it('does not match the same opponent on another day', () => {
    expect(findDuplicate(fixture({ date: '2026-09-19' }), [match()])).toBeNull();
  });

  it('does not match a different opponent on the same day', () => {
    expect(findDuplicate(fixture({ opponent: 'Brookside Athletic' }), [match()])).toBeNull();
  });

  it('never matches on an empty opponent', () => {
    expect(findDuplicate(fixture({ opponent: '' }), [match({ opponent: '' })])).toBeNull();
  });
});

describe('buildRows', () => {
  it('ticks a clean new fixture', () => {
    const [row] = buildRows([fixture()], [], TODAY);
    expect(row.include).toBe(true);
    expect(row.problem).toBe('');
    expect(row.duplicateOf).toBeNull();
  });

  it('leaves a duplicate unticked rather than adding it twice', () => {
    const [row] = buildRows([fixture()], [match()], TODAY);
    expect(row.duplicateOf).toBe('m1');
    expect(row.include).toBe(false);
  });

  it('leaves a broken row unticked', () => {
    const [row] = buildRows([fixture({ date: 'nonsense' })], [], TODAY);
    expect(row.include).toBe(false);
    expect(row.problem).not.toBe('');
  });

  it('gives every row a distinct key', () => {
    const rows = buildRows([fixture(), fixture({ date: '2026-09-19' })], [], TODAY);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });
});

describe('importable', () => {
  it('counts only ticked, unbroken rows', () => {
    const rows = buildRows(
      [fixture(), fixture({ date: '2026-09-19' }), fixture({ date: 'bad' })],
      [match()],
      TODAY,
    );
    expect(importable(rows)).toHaveLength(1);
  });

  it('never returns a broken row even if it was ticked by hand', () => {
    const rows = buildRows([fixture({ date: 'bad' })], [], TODAY).map((r) => ({ ...r, include: true }));
    expect(importable(rows)).toHaveLength(0);
  });
});

describe('matchCompetition', () => {
  const comps = [
    { id: 'c1', name: 'U16 South Division' },
    { id: 'c2', name: 'County Cup' },
  ];

  it('matches the competition printed on the sheet', () => {
    expect(matchCompetition('U16 South Division', comps)).toBe('c1');
  });

  it('matches when the sheet writes it slightly differently', () => {
    expect(matchCompetition('South Division', comps)).toBe('c1');
  });

  it('returns nothing for a competition not set up yet', () => {
    expect(matchCompetition('Easter Tournament', comps)).toBeNull();
  });

  it('returns nothing when the sheet named no competition', () => {
    expect(matchCompetition('', comps)).toBeNull();
  });
});

describe('toMatchInput', () => {
  const options = { teamId: 't1', competitionId: 'c1', defaultTime: '10:00', defaultLength: 90 };

  it('carries the fixture across', () => {
    const input = toMatchInput(buildRows([fixture()], [], TODAY)[0], options);
    expect(input).toMatchObject({
      opponent: 'Oakwood United',
      date: '2026-09-12',
      time: '16:30',
      venue: 'away',
      teamId: 't1',
      competitionId: 'c1',
    });
  });

  it('falls back to the default kickoff only when the sheet gave none', () => {
    const [row] = buildRows([fixture({ time: '' })], [], TODAY);
    expect(toMatchInput(row, options).time).toBe('10:00');
  });

  it('uses the stated match length when there is one, the default otherwise', () => {
    const [stated] = buildRows([fixture({ durationMinutes: 60 })], [], TODAY);
    expect(toMatchInput(stated, options).durationMinutes).toBe(60);
    const [silent] = buildRows([fixture({ durationMinutes: 0 })], [], TODAY);
    expect(toMatchInput(silent, options).durationMinutes).toBe(90);
  });

  it('trims whitespace off names read from a photo', () => {
    const [row] = buildRows([fixture({ opponent: '  Oakwood United  ', location: ' Meadow Park ' })], [], TODAY);
    const input = toMatchInput(row, options);
    expect(input.opponent).toBe('Oakwood United');
    expect(input.location).toBe('Meadow Park');
  });
});
