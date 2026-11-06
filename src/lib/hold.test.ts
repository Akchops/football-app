import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_FASTEST_MS, HOLD_START_MS, createHold, holdDelay, type Hold } from './hold';

/** A stepper's number, 0 to `max`, driven by a hold. */
function counter(max = 99) {
  let value = 0;
  const hold = createHold(() => {
    if (value >= max) return false;
    value += 1;
    return value < max;
  });
  return {
    hold,
    get value() {
      return value;
    },
  };
}

/** A press as the browser delivers it: down, a while, up, then the click. */
function tap(c: { hold: Hold }, ms = 120) {
  c.hold.press();
  vi.advanceTimersByTime(ms);
  c.hold.release();
  c.hold.click(false);
}

describe('holdDelay', () => {
  it('waits longer before the first step than any tap lasts', () => {
    expect(holdDelay(0)).toBe(HOLD_START_MS);
    expect(holdDelay(0)).toBeGreaterThan(holdDelay(1));
  });

  it('gets quicker step by step, down to a floor', () => {
    for (let n = 1; n < 30; n++) expect(holdDelay(n + 1)).toBeLessThanOrEqual(holdDelay(n));
    expect(holdDelay(5)).toBeLessThan(holdDelay(1));
    expect(holdDelay(100)).toBe(HOLD_FASTEST_MS);
  });
});

describe('press and hold', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('steps exactly once for a tap', () => {
    const c = counter();
    tap(c);
    expect(c.value).toBe(1);
    tap(c, 350);
    expect(c.value).toBe(2);
  });

  it('steps once for a click from the keyboard, with no press before it', () => {
    const c = counter();
    c.hold.click(true);
    expect(c.value).toBe(1);
  });

  it('starts repeating only after the pause', () => {
    const c = counter();
    c.hold.press();
    vi.advanceTimersByTime(HOLD_START_MS - 1);
    expect(c.value).toBe(0);
    vi.advanceTimersByTime(1);
    expect(c.value).toBe(1);
  });

  it('speeds up the longer it is held', () => {
    const c = counter();
    c.hold.press();
    vi.advanceTimersByTime(HOLD_START_MS + 1000);
    const firstSecond = c.value;
    vi.advanceTimersByTime(1000);
    expect(c.value - firstSecond).toBeGreaterThan(firstSecond);
  });

  it('gets to 14 in under two seconds', () => {
    const c = counter();
    c.hold.press();
    vi.advanceTimersByTime(2000);
    expect(c.value).toBeGreaterThanOrEqual(14);
  });

  it('stops the moment the finger lifts or slides off', () => {
    const c = counter();
    c.hold.press();
    vi.advanceTimersByTime(1200);
    c.hold.release();
    const atRelease = c.value;
    vi.advanceTimersByTime(5000);
    expect(c.value).toBe(atRelease);
  });

  it('does not add one more for the click that ends a hold', () => {
    const c = counter();
    c.hold.press();
    vi.advanceTimersByTime(1200);
    c.hold.release();
    const atRelease = c.value;
    c.hold.click(false);
    expect(c.value).toBe(atRelease);
    // ...and the next tap counts again.
    tap(c);
    expect(c.value).toBe(atRelease + 1);
  });

  it('stops at the maximum and stays there', () => {
    const c = counter(5);
    c.hold.press();
    vi.advanceTimersByTime(10_000);
    expect(c.value).toBe(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a hold cut short by a scroll before the pause changes nothing', () => {
    const c = counter();
    c.hold.press();
    vi.advanceTimersByTime(150);
    // The browser takes the touch for a scroll: pointercancel, and no click.
    c.hold.release();
    vi.advanceTimersByTime(2000);
    expect(c.value).toBe(0);
  });
});
