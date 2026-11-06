import { useSyncExternalStore } from 'react';
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
  /** Dropdowns and popovers: open in about 200ms, with the same bit of life. */
  menu: { type: 'spring', visualDuration: 0.2, bounce: 0.25 },
} satisfies Record<string, Transition>;

/** Curves for the few timed (not spring) movements. */
export const ease = {
  /** Entrances: fast at first, settling gently. */
  out: [0.23, 1, 0.32, 1] as [number, number, number, number],
  /** Things moving from one place to another on screen. */
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
};

/** How far things dip when pressed. */
export const press = 0.97;

/**
 * The way out, 20% quicker than the way in: leaving should never keep
 * anyone waiting.
 */
export function exitOf(t: Transition & { visualDuration?: number; duration?: number }): Transition {
  // A timed curve, not a spring: a spring's tail would keep it on screen
  // longer than it took to arrive. Picks up speed as it goes, as exits do.
  const length = (t.visualDuration ?? t.duration ?? 0.25) * 0.8;
  return { type: 'tween', duration: length, ease: [0.32, 0, 0.67, 0] };
}

/**
 * Lists easing in: each row rises a little after the one above it, 30ms
 * apart. Only on first appearance, and capped, so a long list doesn't make
 * anyone wait.
 */
export const stagger = (index: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { ...springs.smooth, delay: Math.min(index, 8) * 0.03 },
});

/**
 * The parts inside a card arriving in order as it settles: title, then the
 * line under it, then the numbers.
 */
export const details = (index: number, base = 0.08) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { ...springs.smooth, delay: base + index * 0.05 },
});

/**
 * Travel on a curve rather than a straight line: across quickly, up more
 * slowly (or the other way round), so the path bends like a thrown thing.
 */
export const arc = (base: Transition = springs.smooth, delay = 0): Transition => ({
  ...base,
  delay,
  x: { type: 'spring', visualDuration: 0.3, bounce: 0.15, delay },
  y: { type: 'spring', visualDuration: 0.5, bounce: 0.2, delay },
});

// ---------------------------------------------------------------- success pulse

/**
 * Something that just worked - a result saved, a squad made, a code copied -
 * gives one soft pulse so you know. Keyed by whatever id the thing on screen
 * already has; the mark lasts long enough for it to be drawn and to play.
 */
const pulsing = new Map<string, number>();
const pulseListeners = new Set<() => void>();
let pulseVersion = 0;

export function pulse(id: string, delayMs = 0): void {
  if (!id) return;
  // Saved from a sheet: wait for it to close, so the pulse is seen.
  if (delayMs > 0) {
    window.setTimeout(() => pulse(id), delayMs);
    return;
  }
  const at = Date.now();
  pulsing.set(id, at);
  pulseVersion += 1;
  pulseListeners.forEach((l) => l());
  window.setTimeout(() => {
    if (pulsing.get(id) !== at) return;
    pulsing.delete(id);
    pulseVersion += 1;
    pulseListeners.forEach((l) => l());
  }, 1400);
}

/** After a sheet closes: long enough for it to get out of the way. */
export const AFTER_SHEET = 380;

/** Redraws when anything starts or stops pulsing - for lists, with isPulsing(). */
export function usePulseTick(): number {
  return useSyncExternalStore(
    (l) => {
      pulseListeners.add(l);
      return () => pulseListeners.delete(l);
    },
    () => pulseVersion,
  );
}

export function isPulsing(id: string | null | undefined): boolean {
  return Boolean(id && pulsing.has(id));
}

/** Whether this id has just succeeded - add the `pulse` class while it's true. */
export function usePulse(id: string | null | undefined): boolean {
  usePulseTick();
  return isPulsing(id);
}

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
