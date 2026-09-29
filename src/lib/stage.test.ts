import { describe, expect, it } from 'vitest';
import { STAGES, fixtureContext, isKnockout, stageName, toStage } from './stage';

describe('stageName', () => {
  it('names every stage on its own', () => {
    expect(STAGES.map((s) => stageName(s))).toEqual([
      'Group stage', 'Early round', 'Round of 16', 'Quarter-final', 'Semi-final', '3rd place play-off', 'Final',
    ]);
  });

  it('is empty for a match with no stage', () => {
    expect(stageName(null)).toBe('');
    expect(stageName(undefined, 'B')).toBe('');
  });

  it('reads a group the way people and sheets write it', () => {
    expect(stageName('group', 'B')).toBe('Group B');
    expect(stageName('group', 'Group B')).toBe('Group B');
    expect(stageName('group', 'grp. c')).toBe('Group c');
    expect(stageName('group', 'pool 1')).toBe('Pool 1');
    expect(stageName('group', '  ')).toBe('Group stage');
  });

  it('numbers early cup rounds', () => {
    expect(stageName('round', '2')).toBe('Round 2');
    expect(stageName('round', 'Round 3')).toBe('Round 3');
    expect(stageName('round', 'R4')).toBe('Round 4');
  });

  it('puts the bracket in front of a knockout round', () => {
    expect(stageName('semi', 'Plate')).toBe('Plate semi-final');
    expect(stageName('final', 'Cup')).toBe('Cup final');
    expect(stageName('final')).toBe('Final');
  });
});

describe('toStage', () => {
  it('keeps real stages and drops anything else', () => {
    expect(toStage('semi')).toBe('semi');
    expect(toStage('Semi-final')).toBeNull();
    expect(toStage('none')).toBeNull();
    expect(toStage('')).toBeNull();
    expect(toStage(undefined)).toBeNull();
    expect(toStage(3)).toBeNull();
  });
});

describe('isKnockout', () => {
  it('is every stage after the groups', () => {
    expect(isKnockout('group')).toBe(false);
    expect(isKnockout(null)).toBe(false);
    expect(STAGES.filter(isKnockout)).toEqual(['round', 'last16', 'quarter', 'semi', 'third', 'final']);
  });
});

describe('fixtureContext', () => {
  it('joins the competition and the stage, whichever there are', () => {
    expect(fixtureContext({ name: 'Easter 7s' }, { stage: 'semi', stageDetail: '' })).toBe('Easter 7s · Semi-final');
    expect(fixtureContext({ name: 'Sunday League' }, { stage: null, stageDetail: '' })).toBe('Sunday League');
    expect(fixtureContext(null, { stage: 'group', stageDetail: 'B' })).toBe('Group B');
    expect(fixtureContext(null, { stage: null, stageDetail: '' })).toBe('');
  });
});
