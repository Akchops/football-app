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

/** A club or squad the player turns out for. Several can be active at once. */
export interface Team {
  id: string;
  name: string;
  /** Age group at this team, e.g. "U16" - can differ from the player's own age group. */
  ageGroup: string;
  /** Usual position at this team; a keeper might play outfield for a second side. */
  position: string;
  color: string;
  notes: string;
  createdAt: string;
}

/**
 * Which set of stats matters for a player. This is the whole point of the app:
 * a keeper's game is measured completely differently to a striker's.
 */
export type PositionGroup = 'goalkeeper' | 'defender' | 'midfielder' | 'forward';

export const POSITION_GROUP_LABEL: Record<PositionGroup, string> = {
  goalkeeper: 'Goalkeeper',
  defender: 'Defender',
  midfielder: 'Midfielder',
  forward: 'Forward',
};

export const POSITION_GROUP_BLURB: Record<PositionGroup, string> = {
  goalkeeper: 'Saves, clean sheets, goals conceded',
  defender: 'Tackles, interceptions, clearances, clean sheets',
  midfielder: 'Chances created, tackles, goals and assists',
  forward: 'Goals, assists, shots, conversion',
};

/** Specific positions, grouped by the stat set they use. */
export const POSITIONS_BY_GROUP: Record<PositionGroup, string[]> = {
  goalkeeper: ['GK'],
  defender: ['RB', 'CB', 'LB', 'RWB', 'LWB'],
  midfielder: ['CDM', 'CM', 'CAM', 'RM', 'LM'],
  forward: ['RW', 'LW', 'ST', 'CF'],
};

export const ALL_POSITIONS: string[] = [
  ...POSITIONS_BY_GROUP.goalkeeper,
  ...POSITIONS_BY_GROUP.defender,
  ...POSITIONS_BY_GROUP.midfielder,
  ...POSITIONS_BY_GROUP.forward,
];

export function groupForPosition(position: string): PositionGroup {
  for (const group of Object.keys(POSITIONS_BY_GROUP) as PositionGroup[]) {
    if (POSITIONS_BY_GROUP[group].includes(position)) return group;
  }
  return 'midfielder';
}

/** Every per-match stat the app can record. Which ones are shown depends on position. */
export type MetricId =
  | 'goals'
  | 'assists'
  | 'shots'
  | 'shotsOnTarget'
  | 'chancesCreated'
  | 'tackles'
  | 'interceptions'
  | 'clearances'
  | 'blocks'
  | 'duelsWon'
  | 'saves'
  | 'penaltiesSaved'
  | 'conceded'
  | 'claims'
  | 'sweeperActions';

export interface MetricDef {
  id: MetricId;
  label: string;
  /** Compact label for stat tiles. */
  short: string;
  /** Position groups that track this metric. */
  groups: PositionGroup[];
  /** Shown in the result form by default; the rest sit behind "more detail". */
  primary?: boolean;
  max: number;
}

export const METRICS: MetricDef[] = [
  { id: 'goals', label: 'Goals', short: 'Goals', groups: ['defender', 'midfielder', 'forward'], primary: true, max: 20 },
  { id: 'assists', label: 'Assists', short: 'Assists', groups: ['defender', 'midfielder', 'forward'], primary: true, max: 20 },
  { id: 'shots', label: 'Shots', short: 'Shots', groups: ['midfielder', 'forward'], max: 30 },
  { id: 'shotsOnTarget', label: 'On target', short: 'On target', groups: ['midfielder', 'forward'], max: 30 },
  { id: 'chancesCreated', label: 'Chances created', short: 'Chances', groups: ['midfielder', 'forward'], primary: true, max: 30 },
  { id: 'tackles', label: 'Tackles won', short: 'Tackles', groups: ['defender', 'midfielder'], primary: true, max: 40 },
  { id: 'interceptions', label: 'Interceptions', short: 'Intercept.', groups: ['defender', 'midfielder'], primary: true, max: 40 },
  { id: 'clearances', label: 'Clearances', short: 'Clearances', groups: ['defender'], primary: true, max: 40 },
  { id: 'blocks', label: 'Blocks', short: 'Blocks', groups: ['defender'], max: 20 },
  { id: 'duelsWon', label: 'Duels won', short: 'Duels', groups: ['defender', 'midfielder', 'forward'], max: 40 },
  { id: 'saves', label: 'Saves', short: 'Saves', groups: ['goalkeeper'], primary: true, max: 40 },
  { id: 'conceded', label: 'Goals conceded', short: 'Conceded', groups: ['goalkeeper'], primary: true, max: 30 },
  { id: 'penaltiesSaved', label: 'Penalties saved', short: 'Pens saved', groups: ['goalkeeper'], primary: true, max: 10 },
  { id: 'claims', label: 'Crosses claimed', short: 'Claims', groups: ['goalkeeper'], max: 30 },
  { id: 'sweeperActions', label: 'Sweeper clearances', short: 'Sweeper', groups: ['goalkeeper'], max: 20 },
];

export const METRIC_BY_ID: Record<MetricId, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.id, m]),
) as Record<MetricId, MetricDef>;

export function metricsForGroup(group: PositionGroup): MetricDef[] {
  return METRICS.filter((m) => m.groups.includes(group));
}

export type MetricTotals = Partial<Record<MetricId, number>>;

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
  /** Specific position played in this match. */
  position: string;
  /** Stat set used for this match - a keeper who plays outfield once is recorded as such. */
  positionGroup: PositionGroup;
  /** Self rating out of 10, or null when not rated. */
  rating: number | null;
  motm: boolean;
  yellowCards: number;
  redCards: number;
  /** Position-specific counting stats. */
  metrics: MetricTotals;
}

export interface Match {
  id: string;
  competitionId: string | null;
  teamId: string | null;
  opponent: string;
  /** Local calendar date, 'YYYY-MM-DD'. */
  date: string;
  /** Local kickoff time, 'HH:mm'. */
  time: string;
  venue: Venue;
  location: string;
  /** How long this match is, in minutes. Youth and small-sided games are rarely 90. */
  durationMinutes: number;
  status: MatchStatus;
  result: MatchResult | null;
  notes: string;
  /** Set when the user says "not now" to the result prompt; ISO timestamp to stop asking until. */
  remindAfter: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The player this app is tracking. Local only - there is no account or server. */
export interface Profile {
  name: string;
  /** 'YYYY-MM-DD', or '' if they'd rather not say. */
  dateOfBirth: string;
  /** Age group they currently play in, e.g. 'U16'. */
  ageGroup: string;
  position: string;
  positionGroup: PositionGroup;
  /** null until the setup screen has been completed. */
  onboardedAt: string | null;
}

export interface Settings {
  /** Minutes after kickoff before the app asks for the result. 0 = as soon as kickoff passes. */
  resultPromptDelayMinutes: number;
  /** Default kickoff time pre-filled on a new match. */
  defaultKickoff: string;
  /** Match length pre-filled on a new match, in minutes. */
  defaultMatchLength: number;
  weekStartsOn: 0 | 1;
  /** Whether calendar dots take their colour from the competition or the team. */
  calendarColorBy: 'competition' | 'team';
}

export interface AppData {
  version: number;
  profile: Profile;
  settings: Settings;
  teams: Team[];
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

export const AGE_GROUPS = [
  'U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18',
  'U21', 'U23', 'Open age', 'Veterans',
];

export const COMPETITION_COLORS = [
  '#22c55e', '#38bdf8', '#f59e0b', '#a78bfa', '#f472b6', '#f87171', '#2dd4bf', '#facc15',
];

/** Deliberately distinct from the competition palette so team and competition colours read differently. */
export const TEAM_COLORS = [
  '#38bdf8', '#f472b6', '#facc15', '#34d399', '#c084fc', '#fb923c', '#60a5fa', '#e879f9',
];

/** Common match lengths, from small-sided youth football up to a full game. */
export const MATCH_LENGTHS = [30, 40, 50, 60, 70, 80, 90];

export const DEFAULT_MATCH_LENGTH = 90;

export function emptyResult(position: string, group?: PositionGroup, durationMinutes = DEFAULT_MATCH_LENGTH): MatchResult {
  return {
    goalsFor: 0,
    goalsAgainst: 0,
    penaltiesFor: null,
    penaltiesAgainst: null,
    didPlay: true,
    minutes: durationMinutes,
    position,
    positionGroup: group ?? groupForPosition(position),
    rating: null,
    motm: false,
    yellowCards: 0,
    redCards: 0,
    metrics: {},
  };
}

export const DEFAULT_PROFILE: Profile = {
  name: '',
  dateOfBirth: '',
  ageGroup: '',
  position: 'GK',
  positionGroup: 'goalkeeper',
  onboardedAt: null,
};

export const DEFAULT_SETTINGS: Settings = {
  resultPromptDelayMinutes: 0,
  defaultKickoff: '16:30',
  defaultMatchLength: DEFAULT_MATCH_LENGTH,
  weekStartsOn: 1,
  calendarColorBy: 'competition',
};
