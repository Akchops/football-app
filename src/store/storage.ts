import {
  DEFAULT_MATCH_LENGTH, DEFAULT_PROFILE, DEFAULT_SETTINGS, TEAM_COLORS, groupForPosition,
  type AppData, type Competition, type Match, type MatchResult, type MetricTotals, type Profile, type Result,
  type Team, type TrainingSession,
} from '../types';
import { toStage } from '../lib/stage';

export const STORAGE_KEY = 'matchday.data.v1';
export const DATA_VERSION = 7;

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    profile: { ...DEFAULT_PROFILE },
    settings: { ...DEFAULT_SETTINGS },
    teams: [],
    competitions: [],
    matches: [],
    training: [],
    results: [],
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
export function normaliseMatch(m: Match): Match {
  return {
    ...m,
    deletedAt: m.deletedAt ?? null,
    competitionId: m.competitionId ?? null,
    teamId: m.teamId ?? null,
    location: m.location ?? '',
    // v2 and earlier assumed every match was 90 minutes.
    durationMinutes: m.durationMinutes ?? DEFAULT_MATCH_LENGTH,
    notes: m.notes ?? '',
    result: migrateResult(m.result ?? null),
    remindAfter: m.remindAfter ?? null,
    status: m.status ?? 'scheduled',
    // v5 and earlier had no stages: every match was just a match.
    stage: toStage(m.stage),
    stageDetail: typeof m.stageDetail === 'string' ? m.stageDetail : '',
  };
}

/** v1 kept a single team name and the player's details inside settings. */
interface LegacySettings {
  teamName?: string;
  playerName?: string;
  defaultPosition?: string;
}

/**
 * Sharing data between phones needs two things every record did not used to
 * have: an edit time to compare, and a tombstone so a delete travels instead of
 * being undone by the next device that pushes.
 *
 * Records from before the upgrade take their first `updatedAt` from when they
 * were created. That means an untouched record loses to one that has actually
 * been edited since, which is the right way round.
 */
export function normaliseTeam(t: Team): Team {
  return { ...t, updatedAt: t.updatedAt ?? t.createdAt ?? '', deletedAt: t.deletedAt ?? null };
}

export function normaliseCompetition(c: Competition): Competition {
  return {
    ...c,
    ageGroup: c.ageGroup ?? '',
    archived: c.archived ?? false,
    placing: c.placing ?? '',
    startDate: c.startDate ?? '',
    teamId: c.teamId ?? null,
    location: c.location ?? '',
    matchLength: c.matchLength ?? 0,
    // v6 and earlier had no tables: the usual three points for a win, one for a draw.
    pointsWin: typeof c.pointsWin === 'number' ? c.pointsWin : 3,
    pointsDraw: typeof c.pointsDraw === 'number' ? c.pointsDraw : 1,
    updatedAt: c.updatedAt ?? c.createdAt ?? '',
    deletedAt: c.deletedAt ?? null,
  };
}

/** A goal count as saved, or null - a score not entered yet, or one that makes no sense. */
function goals(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export function normaliseResult(r: Result): Result {
  const homeGoals = goals(r.homeGoals);
  const awayGoals = goals(r.awayGoals);
  const stage = toStage(r.stage);
  return {
    ...r,
    home: typeof r.home === 'string' ? r.home : '',
    away: typeof r.away === 'string' ? r.away : '',
    // Half a score is no score: both or neither.
    homeGoals: homeGoals !== null && awayGoals !== null ? homeGoals : null,
    awayGoals: homeGoals !== null && awayGoals !== null ? awayGoals : null,
    date: typeof r.date === 'string' ? r.date : '',
    stage,
    stageDetail: stage && typeof r.stageDetail === 'string' ? r.stageDetail : '',
    updatedAt: r.updatedAt ?? r.createdAt ?? '',
    deletedAt: r.deletedAt ?? null,
  };
}

/**
 * Profiles from before the new-season question count their age group as picked
 * when they were set up. One set up last year is asked straight away; one set up
 * this year isn't asked until the next. Also used for a profile arriving from a
 * phone that hasn't updated yet.
 */
export function settledYear(onboardedAt: string | null): number {
  const at = onboardedAt ? new Date(onboardedAt) : null;
  return at && !Number.isNaN(at.getTime()) ? at.getFullYear() : 0;
}

export function normaliseTraining(t: TrainingSession): TrainingSession {
  return { ...t, updatedAt: t.updatedAt ?? t.createdAt ?? '', deletedAt: t.deletedAt ?? null };
}

/**
 * Tombstoned records stay in storage so the delete can reach the other phones,
 * but nothing in the app should ever see them.
 */
export function live<T extends { deletedAt: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => row.deletedAt === null);
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

    const teams: Team[] = Array.isArray(parsed.teams) ? (parsed.teams as Team[]).map(normaliseTeam) : [];
    let matches = Array.isArray(parsed.matches) ? (parsed.matches as Match[]).map(normaliseMatch) : [];

    // v1 -> v2: the single settings.teamName becomes the player's first team.
    if (teams.length === 0 && legacySettings.teamName && legacySettings.teamName !== 'My team') {
      const stamp = new Date().toISOString();
      const team: Team = {
        id: createId('team'),
        name: legacySettings.teamName,
        ageGroup: '',
        position: legacySettings.defaultPosition ?? '',
        color: TEAM_COLORS[0],
        notes: '',
        createdAt: stamp,
        updatedAt: stamp,
        deletedAt: null,
      };
      teams.push(team);
      matches = matches.map((m) => (m.teamId ? m : { ...m, teamId: team.id }));
    }

    const profile: Profile = parsed.profile
      ? {
          ...base.profile,
          ...parsed.profile,
          ageGroupYear: parsed.profile.ageGroupYear ?? settledYear(parsed.profile.onboardedAt ?? null),
        }
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
      competitions: Array.isArray(parsed.competitions)
        ? (parsed.competitions as Competition[]).map(normaliseCompetition)
        : [],
      matches,
      training: Array.isArray(parsed.training)
        ? (parsed.training as TrainingSession[]).map(normaliseTraining)
        : [],
      // v6 and earlier kept only the player's own matches.
      results: Array.isArray(parsed.results) ? (parsed.results as Result[]).map(normaliseResult) : [],
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
