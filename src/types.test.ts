import { describe, expect, it } from 'vitest';
import { STAGES, nextStage } from './types';

/** Adding a match to a tournament starts it on the round most likely to come next. */
describe('tournament stages', () => {
  it('follows a group game with another', () => {
    expect(nextStage('Group stage')).toBe('Group stage');
  });

  it('moves through the knockout rounds to the final', () => {
    expect(nextStage('Round of 16')).toBe('Quarter-final');
    expect(nextStage('Quarter-final')).toBe('Semi-final');
    expect(nextStage('Semi-final')).toBe('Final');
    expect(nextStage('3rd place play-off')).toBe('Final');
  });

  it('stays put after the final, or with no stage', () => {
    expect(nextStage('Final')).toBe('Final');
    expect(nextStage('')).toBe('');
  });

  it('only ever suggests a stage that can be picked', () => {
    for (const stage of STAGES) expect(STAGES).toContain(nextStage(stage));
  });
});
