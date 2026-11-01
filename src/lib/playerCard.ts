import type { Match, MetricId, PositionGroup, Profile } from '../types';
import { computeStats, playedMatches } from './stats';

/**
 * The player's own Ultimate Team-style card: one rating, six stats, a tier.
 * Everything on it comes from what they have logged - nothing is invented.
 */
export type CardTier = 'none' | 'bronze' | 'silver' | 'gold' | 'inform';

export interface CardStat {
  /** Three letters, as on the cards: SAV, GOL, MOTM is the exception. */
  code: string;
  label: string;
  value: number;
}

export interface PlayerCardData {
  /** Average match score, rounded; null until a match has been played. */
  rating: number | null;
  tier: CardTier;
  /** The position as written on the profile: "GK", "CB"... */
  position: string;
  group: PositionGroup;
  stats: CardStat[];
  appearances: number;
}

/** Bronze under 65, silver to 74, gold from 75 - the game's own breaks, on a 100 scale. */
export function tierFor(rating: number | null): Exclude<CardTier, 'inform'> {
  if (rating === null) return 'none';
  if (rating >= 75) return 'gold';
  if (rating >= 65) return 'silver';
  return 'bronze';
}

const SIX: Record<PositionGroup, { code: string; label: string; metric?: MetricId; from?: 'cleanSheets' | 'apps' | 'motm' }[]> = {
  goalkeeper: [
    { code: 'SAV', label: 'Saves', metric: 'saves' },
    { code: 'CS', label: 'Clean sheets', from: 'cleanSheets' },
    { code: 'PEN', label: 'Pens saved', metric: 'penaltiesSaved' },
    { code: 'CLM', label: 'Claims', metric: 'claims' },
    { code: 'APP', label: 'Apps', from: 'apps' },
    { code: 'MOTM', label: 'Man of the match', from: 'motm' },
  ],
  defender: [
    { code: 'TKL', label: 'Tackles', metric: 'tackles' },
    { code: 'INT', label: 'Interceptions', metric: 'interceptions' },
    { code: 'CLR', label: 'Clearances', metric: 'clearances' },
    { code: 'CS', label: 'Clean sheets', from: 'cleanSheets' },
    { code: 'APP', label: 'Apps', from: 'apps' },
    { code: 'MOTM', label: 'Man of the match', from: 'motm' },
  ],
  midfielder: [
    { code: 'GOL', label: 'Goals', metric: 'goals' },
    { code: 'AST', label: 'Assists', metric: 'assists' },
    { code: 'CHN', label: 'Chances', metric: 'chancesCreated' },
    { code: 'TKL', label: 'Tackles', metric: 'tackles' },
    { code: 'APP', label: 'Apps', from: 'apps' },
    { code: 'MOTM', label: 'Man of the match', from: 'motm' },
  ],
  forward: [
    { code: 'GOL', label: 'Goals', metric: 'goals' },
    { code: 'AST', label: 'Assists', metric: 'assists' },
    { code: 'SHT', label: 'Shots', metric: 'shots' },
    { code: 'CHN', label: 'Chances', metric: 'chancesCreated' },
    { code: 'APP', label: 'Apps', from: 'apps' },
    { code: 'MOTM', label: 'Man of the match', from: 'motm' },
  ],
};

export function playerCard(matches: Match[], profile: Pick<Profile, 'position' | 'positionGroup'>): PlayerCardData {
  const stats = computeStats(matches);
  const rating = stats.averageScore === null ? null : Math.round(stats.averageScore);
  // "In form": man of the match in one of the last three games played in.
  const recent = playedMatches(matches).filter((m) => m.result.didPlay).slice(0, 3);
  const inForm = rating !== null && recent.some((m) => m.result.motm);
  const group = profile.positionGroup;
  return {
    rating,
    tier: inForm ? 'inform' : tierFor(rating),
    position: profile.position || 'POS',
    group,
    appearances: stats.appearances,
    stats: SIX[group].map(({ code, label, metric, from }) => ({
      code,
      label,
      value: metric
        ? stats.totals[metric] ?? 0
        : from === 'cleanSheets'
          ? stats.cleanSheetsPlayed
          : from === 'apps'
            ? stats.appearances
            : stats.motm,
    })),
  };
}
