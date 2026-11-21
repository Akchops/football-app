import type { Transition } from 'motion/react';

/**
 * The app's motion, in one place. Everything moves on springs rather than
 * timed curves, so a movement can be interrupted halfway and carries on from
 * where it is - the way iOS feels. Named after Apple's own presets:
 *
 * - snappy: controls - pills, toggles, steppers, menus. Quick, no overshoot.
 * - smooth: sheets, screens, anything that travels. Settles without a bounce.
 * - release: where a finger lets go of something it was moving - a sheet or a
 *   row springing back. The only everyday spring with give in it, because only
 *   here did a gesture put the momentum there.
 * - bouncy: celebrations only (a card going up a tier). Rare on purpose.
 *
 * With Reduce Motion on, MotionConfig in App turns transforms off and these
 * become plain fades.
 */
export const springs = {
  snappy: { type: 'spring', visualDuration: 0.3, bounce: 0 },
  smooth: { type: 'spring', visualDuration: 0.4, bounce: 0 },
  release: { type: 'spring', visualDuration: 0.35, bounce: 0.18 },
  bouncy: { type: 'spring', visualDuration: 0.6, bounce: 0.4 },
} satisfies Record<string, Transition>;

/**
 * Where a flick would come to rest, as iOS scroll views work it out: the
 * distance (px) something released at `velocity` (px/s) travels before it
 * stops. 0.998 is a scroll's long glide; 0.99 stops sooner, for snapping.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * Resistance at an edge: the further past it, the less the thing follows the
 * finger - it slows before it stops, and never stops dead.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  const sign = Math.sign(overshoot);
  const x = Math.abs(overshoot);
  return (sign * (x * dimension * constant)) / (dimension + constant * x);
}

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
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openSheets = Math.max(0, openSheets - 1);
    if (openSheets === 0) {
      document.documentElement.removeAttribute('data-sheet-open');
      setSheetPull(null);
    }
  };
}

/** True when this is the only sheet up, so it alone decides where the screen behind sits. */
export const onlySheet = () => openSheets === 1;

/**
 * While the one sheet that's up is pulled down (or is sliding away), the
 * screen behind comes forward with it: 0 is the sheet fully up, 1 is gone.
 * Set on the app itself rather than <html>, so only the app restyles each
 * frame. null hands the screen back to its own CSS transition.
 */
export function setSheetPull(fraction: number | null): void {
  const apps = document.querySelectorAll<HTMLElement>('.app');
  apps.forEach((app) => {
    if (fraction === null) {
      app.style.removeProperty('--sheet-pull');
      app.removeAttribute('data-sheet-pull');
    } else {
      app.style.setProperty('--sheet-pull', String(Math.min(1, Math.max(0, fraction))));
      app.setAttribute('data-sheet-pull', '');
    }
  });
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
