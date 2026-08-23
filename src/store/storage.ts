import {
  DEFAULT_PROFILE, DEFAULT_SETTINGS, TEAM_COLORS, groupForPosition,
  type AppData, type Competition, type Match, type MatchResult, type MetricTotals, type Team,
} from '../types';

export const STORAGE_KEY = 'matchday.data.v1';
export const DATA_VERSION = 2;

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    profile: { ...DEFAULT_PROFILE },
    settings: { ...DEFAULT_SETTINGS },
    teams: [],
    competitions: [],
    matches: [],
  };
}

export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

/** Shape of a v1 result, before stats became position-aware. */
interface LegacyResult {
  goals?: number;
  assists?: number;
  position?: string;
  metrics?: MetricTotals;
  positionGroup?: MatchResult['positionGroup'];
}

function migrateResult(raw: MatchResult | null): MatchResult | null {
  if (!raw) return null;
  const legacy = raw as MatchResult & LegacyResult;
  const position = legacy.position || 'CM';
  // v1 kept goals and assists as their own fields; they're metrics now.
  const metrics: MetricTotals = { ...(legacy.metrics ?? {}) };
  if (legacy.metrics === undefined) {
    if (legacy.goals) metrics.goals = legacy.goals;
    if (legacy.assists) metrics.assists = legacy.assists;
  }
  return {
    goalsFor: raw.goalsFor ?? 0,
    goalsAgainst: raw.goalsAgainst ?? 0,
    penaltiesFor: raw.penaltiesFor ?? null,
    penaltiesAgainst: raw.penaltiesAgainst ?? null,
    didPlay: raw.didPlay ?? true,
    minutes: raw.minutes ?? 90,
    position,
    positionGroup: legacy.positionGroup ?? groupForPosition(position),
    rating: raw.rating ?? null,
    motm: raw.motm ?? false,
    yellowCards: raw.yellowCards ?? 0,
    redCards: raw.redCards ?? 0,
    metrics,
  };
}

/** Fill in fields added after a match was first saved. */
function normaliseMatch(m: Match): Match {
  return {
    ...m,
    competitionId: m.competitionId ?? null,
    teamId: m.teamId ?? null,
    location: m.location ?? '',
    notes: m.notes ?? '',
    result: migrateResult(m.result ?? null),
    remindAfter: m.remindAfter ?? null,
    status: m.status ?? 'scheduled',
  };
}

/** v1 kept a single team name and the player's details inside settings. */
interface LegacySettings {
  teamName?: string;
  playerName?: string;
  defaultPosition?: string;
}

/**
 * Defensive parse: anything malformed falls back to a sane default rather than
 * blowing up the whole app, since this is the only copy of the user's data.
 */
export function parseData(raw: string | null): AppData {
  if (!raw) return emptyData();
  try {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    const base = emptyData();
    const legacySettings = (parsed.settings ?? {}) as LegacySettings;

    const teams: Team[] = Array.isArray(parsed.teams) ? (parsed.teams as Team[]) : [];
    let matches = Array.isArray(parsed.matches) ? (parsed.matches as Match[]).map(normaliseMatch) : [];

    // v1 -> v2: the single settings.teamName becomes the player's first team.
    if (teams.length === 0 && legacySettings.teamName && legacySettings.teamName !== 'My team') {
      const team: Team = {
        id: createId('team'),
        name: legacySettings.teamName,
        ageGroup: '',
        position: legacySettings.defaultPosition ?? '',
        color: TEAM_COLORS[0],
        notes: '',
        createdAt: new Date().toISOString(),
      };
      teams.push(team);
      matches = matches.map((m) => (m.teamId ? m : { ...m, teamId: team.id }));
    }

    const profile = parsed.profile
      ? { ...base.profile, ...parsed.profile }
      : {
          ...base.profile,
          name: legacySettings.playerName ?? '',
          position: legacySettings.defaultPosition ?? base.profile.position,
          positionGroup: groupForPosition(legacySettings.defaultPosition ?? base.profile.position),
        };

    return {
      version: DATA_VERSION,
      profile,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      teams,
      competitions: Array.isArray(parsed.competitions) ? (parsed.competitions as Competition[]) : [],
      matches,
    };
  } catch {
    return emptyData();
  }
}

export function loadData(): AppData {
  if (typeof localStorage === 'undefined') return emptyData();
  try {
    return parseData(localStorage.getItem(STORAGE_KEY));
  } catch {
    return emptyData();
  }
}

export function saveData(data: AppData): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked (private mode) - the app still works for this session.
  }
}
