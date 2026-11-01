/**
 * How the app looks on this phone: Light, Dark or Automatic (following the
 * phone), and an accent drawn from the player's own team colour.
 *
 * Kept per phone in localStorage, not synced: a parent's phone in light mode
 * shouldn't flip their child's to it.
 */
export type Theme = 'dark' | 'light' | 'auto';

const THEME_KEY = 'matchday.theme.v1';
/** Matchday's own pitch green, for a team with no colour of its own. */
export const PITCH = '#0b7a43';

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'auto' ? value : 'dark';
  } catch {
    return 'dark';
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode: the choice lasts until the app is closed.
  }
}

/** Whether the screen is dark right now - Automatic asks the phone. */
export function isDark(theme: Theme): boolean {
  if (theme === 'auto') return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
  return theme === 'dark';
}

// ---- colour maths (WCAG relative luminance and contrast) ----

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

function luminance([r, g, b]: [number, number, number]): number {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 1;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mixes toward white (amount > 0) or black (amount < 0), keeping the hue. */
function shade(rgb: [number, number, number], amount: number): [number, number, number] {
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return rgb.map((v) => v + (target - v) * t) as [number, number, number];
}

/**
 * The team's colour, nudged lighter on dark screens or darker on light ones
 * until text in it reads at 4.5:1 against the cards - so any kit colour works
 * as the accent, from sky blue to navy. The ink is whichever of white or
 * near-black reads best on a button filled with it.
 */
export function accentFor(teamColour: string | undefined, dark: boolean): { accent: string; ink: string } {
  const base = parseHex(teamColour ?? '') ?? parseHex(PITCH)!;
  const card = dark ? '#1c1c1e' : '#f2f2f7';
  let rgb = base;
  for (let step = 0; step <= 20 && contrast(toHex(rgb), card) < 4.5; step++) {
    rgb = shade(base, (dark ? 1 : -1) * (step / 20));
  }
  const accent = toHex(rgb);
  const ink = contrast(accent, '#ffffff') >= contrast(accent, '#0b0f14') ? '#ffffff' : '#0b0f14';
  return { accent, ink };
}

/** Puts the theme and accent on <html>, and tells the phone's status bar. */
export function applyAppearance(theme: Theme, teamColour: string | undefined): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  const dark = isDark(theme);
  const { accent, ink } = accentFor(teamColour, dark);
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-ink', ink);
  root.style.setProperty('--kit', teamColour && parseHex(teamColour) ? teamColour : accent);
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = dark ? '#000000' : '#f2f2f7';
    meta.removeAttribute('media');
  }
}

// ---- a tiny store, so Setup can change the theme and the shell follows ----

const listeners = new Set<() => void>();
let current: Theme | null = null;

export function getTheme(): Theme {
  if (current === null) current = storedTheme();
  return current;
}

export function setTheme(theme: Theme): void {
  current = theme;
  saveTheme(theme);
  listeners.forEach((fn) => fn());
}

export function subscribeTheme(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---- the top of Matches: the next-match hero, or a plain list ----

export type MatchesTop = 'hero' | 'list';
const TOP_KEY = 'matchday.matchesTop.v1';
let top: MatchesTop | null = null;

export function getMatchesTop(): MatchesTop {
  if (top === null) {
    try {
      top = localStorage.getItem(TOP_KEY) === 'list' ? 'list' : 'hero';
    } catch {
      top = 'hero';
    }
  }
  return top;
}

export function setMatchesTop(value: MatchesTop): void {
  top = value;
  try {
    localStorage.setItem(TOP_KEY, value);
  } catch {
    // Private mode: lasts until the app is closed.
  }
  listeners.forEach((fn) => fn());
}
