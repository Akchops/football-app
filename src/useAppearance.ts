import { useEffect, useSyncExternalStore } from 'react';
import {
  applyAppearance, getMatchesTop, getTheme, setMatchesTop, setTheme, subscribeTheme, type MatchesTop, type Theme,
} from './lib/appearance';

/** The theme chosen on this phone, and a way to change it. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  return [useSyncExternalStore(subscribeTheme, getTheme, getTheme), setTheme];
}

/** Keeps <html> in step with the theme, the phone's own setting (for Automatic) and the team colour. */
export function useAppearance(teamColour: string | undefined): void {
  const [theme] = useTheme();
  useEffect(() => {
    applyAppearance(theme, teamColour);
    if (theme !== 'auto') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = () => applyAppearance(theme, teamColour);
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, [theme, teamColour]);
}

/** Whether Matches opens on the next-match hero or a plain list - a choice in Setup. */
export function useMatchesTop(): [MatchesTop, (value: MatchesTop) => void] {
  return [useSyncExternalStore(subscribeTheme, getMatchesTop, getMatchesTop), setMatchesTop];
}
