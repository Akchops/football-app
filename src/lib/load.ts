import { RPE_LABEL, RPE_MAX, RPE_MIN, type MatchResult } from '../types';

/**
 * Match load: how hard a game was, times how long it was played for. It is the
 * session-RPE method - effort on a perceived-exertion scale, multiplied by
 * minutes - and comes out in arbitrary units (AU). One number per game that a
 * coach can add up over a week to see who is doing too much, or too little.
 *
 * The effort here is on Borg's 6-20 scale. (The best-known version of the
 * method uses his 0-10 scale instead, so these numbers run about one and a half
 * to two times higher than published 0-10 figures - compare like with like.)
 */

export const RPE_VALUES: number[] = Array.from({ length: RPE_MAX - RPE_MIN + 1 }, (_, i) => RPE_MIN + i);

/** "15 · Hard" */
export function rpeLabel(rpe: number): string {
  return `${rpe} · ${RPE_LABEL[rpe] ?? ''}`.trim();
}

/** RPE times minutes, or null when the effort wasn't given or nothing was played. */
export function matchLoad(result: Pick<MatchResult, 'rpe' | 'minutes' | 'didPlay' | 'walkover'>): number | null {
  const rpe = result.rpe ?? null;
  if (rpe === null || !result.didPlay || result.walkover || result.minutes <= 0) return null;
  return rpe * result.minutes;
}

/** "900 AU" */
export function formatLoad(load: number): string {
  return `${Math.round(load).toLocaleString('en-GB')} AU`;
}
