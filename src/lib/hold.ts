/**
 * Press and hold on a + or − button: 14 saves shouldn't take 14 taps.
 *
 * A tap is still exactly one. Holding waits a moment - longer than any tap -
 * then steps, slowly at first and quicker and quicker. Lifting the finger,
 * sliding it off the button, or the page starting to scroll under it stops it.
 *
 * The tap is left to the browser's click, not counted on the way down, so a
 * finger that lands on a stepper on its way to scrolling the sheet changes
 * nothing: a scroll cancels the click.
 */

/** Before the first step of a hold: long enough that a tap never repeats. */
export const HOLD_START_MS = 400;
/** The fastest it goes. */
export const HOLD_FASTEST_MS = 40;

/** How long to wait before the next step, after `steps` steps of a hold (0 = not started yet). */
export function holdDelay(steps: number): number {
  if (steps <= 0) return HOLD_START_MS;
  return Math.max(HOLD_FASTEST_MS, Math.round(220 * 0.85 ** (steps - 1)));
}

export interface Hold {
  /** The finger (or mouse button) went down on the button. */
  press(): void;
  /** It lifted, slid off, or the browser took over for a scroll. Safe to call more than once. */
  release(): void;
  /**
   * The click that follows a press, or one from the keyboard. It steps once -
   * unless a hold has already done the stepping, which a keyboard click never has.
   */
  click(fromKeyboard: boolean): void;
}

/**
 * `step` moves the number one step and says whether there's room for another;
 * false (at the minimum or maximum) ends the hold.
 */
export function createHold(step: () => boolean): Hold {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let steps = 0;
  let held = false;

  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const tick = () => {
    timer = null;
    held = true;
    steps += 1;
    if (step()) timer = setTimeout(tick, holdDelay(steps));
  };

  return {
    press() {
      stop();
      steps = 0;
      held = false;
      timer = setTimeout(tick, holdDelay(0));
    },
    release: stop,
    click(fromKeyboard) {
      if (held && !fromKeyboard) return;
      step();
    },
  };
}
