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
  FIXTURES_SCHEMA,
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
    stage: null,
    stageDetail: '',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
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

describe('stages on imported fixtures', () => {
  it('asks the reader for a stage on every row, with none as an answer', () => {
    const row = FIXTURES_SCHEMA.properties.fixtures.items;
    expect(row.required).toContain('stage');
    expect(row.required).toContain('stageDetail');
    expect(row.properties.stage.enum).toEqual(['none', 'group', 'round', 'last16', 'quarter', 'semi', 'third', 'final']);
  });

  it('keeps a real stage, trims its detail, and drops anything else', () => {
    const rows = buildRows(
      [
        fixture({ stage: 'group', stageDetail: ' B ' }),
        fixture({ stage: 'none', stageDetail: 'B', date: '2026-09-13' }),
        fixture({ stage: 'Semi-final', date: '2026-09-14' }),
        fixture({ date: '2026-09-15' }), // a reply from before stages: no field at all
        fixture({ stage: 'semi', stageDetail: 'Semi-final 1', date: '2026-09-16' }), // as the live reader sent it
        fixture({ stage: 'final', stageDetail: 'PLATE FINAL', date: '2026-09-17' }),
      ],
      [],
      TODAY,
    );
    expect(rows.map((r) => [r.stage, r.stageDetail])).toEqual([
      ['group', 'B'],
      [null, ''],
      [null, ''],
      [null, ''],
      ['semi', ''],
      ['final', 'Plate'],
    ]);
  });

  it('keeps a knockout game whose opponent is not known yet', () => {
    expect(problemWith(fixture({ opponent: '', stage: 'semi' }), TODAY)).toBe('');
    expect(problemWith(fixture({ opponent: '', stage: 'group' }), TODAY)).toBe('No opponent on this row');
    expect(problemWith(fixture({ opponent: '' }), TODAY)).toBe('No opponent on this row');

    const [row] = buildRows([fixture({ opponent: '', stage: 'final' })], [], TODAY);
    const input = toMatchInput(row, { teamId: null, competitionId: null, defaultTime: '10:00', defaultLength: 60 });
    expect(input).toMatchObject({ opponent: 'TBC', stage: 'final', stageDetail: '' });
  });

  it('does not take a final for the semi-final already in the calendar', () => {
    const semi = match({ date: '2026-09-12', opponent: 'TBC', stage: 'semi' });
    expect(findDuplicate(fixture({ opponent: 'TBC', stage: 'final' }), [semi])).toBeNull();
    expect(findDuplicate(fixture({ opponent: '', stage: 'final' }), [semi])).toBeNull();
    expect(findDuplicate(fixture({ opponent: 'TBC', stage: 'semi' }), [semi])?.id).toBe(semi.id);
    // Without a stage on one side there is nothing to tell them apart by.
    expect(findDuplicate(fixture({ opponent: 'TBC' }), [semi])?.id).toBe(semi.id);
  });
});
