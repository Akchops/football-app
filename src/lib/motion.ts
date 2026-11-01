import type { Transition } from 'motion/react';

/**
 * The app's motion, in one place. Everything moves on springs rather than
 * timed curves, so a movement can be interrupted halfway and carries on from
 * where it is - the way iOS feels. Named after Apple's own presets:
 *
 * - snappy: controls - pills, toggles, steppers. Quick, a touch of life.
 * - smooth: sheets, screens, anything that travels. A hint of bounce at the end.
 * - bouncy: celebrations only (a card going up a tier). Rare on purpose.
 *
 * With Reduce Motion on, MotionConfig in App turns transforms off and these
 * become plain fades.
 */
export const springs = {
  snappy: { type: 'spring', visualDuration: 0.32, bounce: 0.25 },
  smooth: { type: 'spring', visualDuration: 0.45, bounce: 0.12 },
  bouncy: { type: 'spring', visualDuration: 0.6, bounce: 0.4 },
} satisfies Record<string, Transition>;

/**
 * Lists easing in: each row rises a little after the one above it. Only on
 * first appearance, and capped, so a long list doesn't make anyone wait.
 */
export const stagger = (index: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { ...springs.smooth, delay: Math.min(index, 8) * 0.035 },
});

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

/**
 * Where the last tap on a match came from, so the sheet it opens can grow out
 * of that row instead of rising from the bottom. Only good for a moment.
 */
let origin: { rect: DOMRect; at: number } | null = null;

export function rememberOrigin(el: Element | null): void {
  if (el) origin = { rect: el.getBoundingClientRect(), at: Date.now() };
}

export function takeOrigin(): DOMRect | null {
  const found = origin && Date.now() - origin.at < 600 ? origin.rect : null;
  origin = null;
  return found;
}
