import type { Transition } from 'motion/react';

/**
 * The app's motion, in one place. Everything moves on springs rather than
 * timed curves, so a movement can be interrupted halfway and carries on from
 * where it is - the way iOS feels. Named after Apple's own presets:
 *
 * - snappy: controls - pills, toggles, steppers. Quick, a touch of life.
 * - smooth: sheets, screens, anything that travels. No bounce.
 * - bouncy: celebrations only (a card going up a tier). Rare on purpose.
 *
 * With Reduce Motion on, MotionConfig in App turns transforms off and these
 * become plain fades.
 */
export const springs = {
  snappy: { type: 'spring', visualDuration: 0.3, bounce: 0.15 },
  smooth: { type: 'spring', visualDuration: 0.42, bounce: 0 },
  bouncy: { type: 'spring', visualDuration: 0.55, bounce: 0.35 },
} satisfies Record<string, Transition>;

/** True when the phone asks for less motion - for the few effects done outside Motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * How many sheets are up. While any are, the screen behind sinks back
 * (html[data-sheet-open], styled in styles.css) - the iOS card stack.
 */
let openSheets = 0;
export function sheetOpened(): () => void {
  openSheets += 1;
  document.documentElement.setAttribute('data-sheet-open', '');
  return () => {
    openSheets = Math.max(0, openSheets - 1);
    if (openSheets === 0) document.documentElement.removeAttribute('data-sheet-open');
  };
}
