export type CompetitionType = 'league' | 'cup' | 'tournament' | 'friendly' | 'other';

export interface Competition {
  id: string;
  name: string;
  type: CompetitionType;
  season: string;
  color: string;
  /** Optional free text, e.g. "U16 South Division" */
  notes: string;
  archived: boolean;
  createdAt: string;
}

export type MatchStatus = 'scheduled' | 'played' | 'cancelled';
export type Venue = 'home' | 'away' | 'neutral';

/** How the match finished, once a result has been entered. */
export interface MatchResult {
  goalsFor: number;
  goalsAgainst: number;
  /** Shootout score, only when the match was drawn and went to penalties. */
  penaltiesFor: number | null;
  penaltiesAgainst: number | null;
  /** Did the tracked player feature in this match? */
  didPlay: boolean;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  position: string;
  /** Self rating out of 10, or null when not rated. */
  rating: number | null;
  motm: boolean;
}

export interface Match {
  id: string;
  competitionId: string | null;
  opponent: string;
  /** Local calendar date, 'YYYY-MM-DD'. */
  date: string;
  /** Local kickoff time, 'HH:mm'. */
  time: string;
  venue: Venue;
  location: string;
  status: MatchStatus;
  result: MatchResult | null;
  notes: string;
  /** Set when the user says "not now" to the result prompt; ISO timestamp to stop asking until. */
  remindAfter: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  teamName: string;
  playerName: string;
  defaultPosition: string;
  /** Minutes after kickoff before the app asks for the result. 0 = as soon as kickoff passes. */
  resultPromptDelayMinutes: number;
  /** Default kickoff time pre-filled on a new match. */
  defaultKickoff: string;
  weekStartsOn: 0 | 1;
}

export interface AppData {
  version: number;
  settings: Settings;
  competitions: Competition[];
  matches: Match[];
}

export const COMPETITION_TYPE_LABEL: Record<CompetitionType, string> = {
  league: 'League',
  cup: 'Cup',
  tournament: 'Tournament',
  friendly: 'Friendly',
  other: 'Other',
};

export const VENUE_LABEL: Record<Venue, string> = {
  home: 'Home',
  away: 'Away',
  neutral: 'Neutral',
};

export const POSITIONS = [
  'GK', 'RB', 'CB', 'LB', 'RWB', 'LWB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'ST', 'CF', 'Sub',
];

export const COMPETITION_COLORS = [
  '#22c55e', '#38bdf8', '#f59e0b', '#a78bfa', '#f472b6', '#f87171', '#2dd4bf', '#facc15',
];

export function emptyResult(defaultPosition: string): MatchResult {
  return {
    goalsFor: 0,
    goalsAgainst: 0,
    penaltiesFor: null,
    penaltiesAgainst: null,
    didPlay: true,
    minutes: 90,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    position: defaultPosition,
    rating: null,
    motm: false,
  };
}

export const DEFAULT_SETTINGS: Settings = {
  teamName: 'My team',
  playerName: '',
  defaultPosition: 'CM',
  resultPromptDelayMinutes: 0,
  defaultKickoff: '16:30',
  weekStartsOn: 1,
};
