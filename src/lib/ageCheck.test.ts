import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ageFromBirthMonth, holdAgeRecord, rememberUnder13, rememberedUnder13, takeHeldAgeRecord } from './ageCheck';

// 6 November 2026.
const now = new Date(2026, 10, 6);

describe('ageFromBirthMonth', () => {
  it('counts a birthday earlier in the year as had', () => {
    expect(ageFromBirthMonth(3, 2013, now)).toBe(13);
    expect(ageFromBirthMonth(10, 2013, now)).toBe(13);
  });

  it('counts a birthday later in the year as still to come', () => {
    expect(ageFromBirthMonth(12, 2013, now)).toBe(12);
  });

  it('counts a birthday this month as not reached yet - the day is not asked', () => {
    expect(ageFromBirthMonth(11, 2013, now)).toBe(12);
    expect(ageFromBirthMonth(11, 2008, now)).toBe(17);
  });

  it('works for adults', () => {
    expect(ageFromBirthMonth(1, 1980, now)).toBe(46);
  });
});

describe('the held age record', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('comes back once, then is gone', () => {
    holdAgeRecord({ signed_in_by: 'parent', checked_at: '2026-11-06T10:00:00.000Z' });
    expect(takeHeldAgeRecord()).toEqual({ signed_in_by: 'parent', checked_at: '2026-11-06T10:00:00.000Z' });
    expect(takeHeldAgeRecord()).toBeNull();
  });

  it('ignores anything that is not a record it wrote', () => {
    store.set('matchday.ageCheck', JSON.stringify({ signed_in_by: 'admin', checked_at: 'x' }));
    expect(takeHeldAgeRecord()).toBeNull();
    store.set('matchday.ageCheck', 'not json');
    expect(takeHeldAgeRecord()).toBeNull();
  });

  it('remembers an under-13 answer for the visit', () => {
    expect(rememberedUnder13()).toBe(false);
    rememberUnder13();
    expect(rememberedUnder13()).toBe(true);
  });
});
