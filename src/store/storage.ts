import { DEFAULT_SETTINGS, type AppData, type Competition, type Match } from '../types';

export const STORAGE_KEY = 'matchday.data.v1';
export const DATA_VERSION = 1;

export function emptyData(): AppData {
  return { version: DATA_VERSION, settings: { ...DEFAULT_SETTINGS }, competitions: [], matches: [] };
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
    return {
      version: DATA_VERSION,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      competitions: Array.isArray(parsed.competitions) ? (parsed.competitions as Competition[]) : [],
      matches: Array.isArray(parsed.matches) ? (parsed.matches as Match[]).map(normaliseMatch) : [],
    };
  } catch {
    return emptyData();
  }
}

/** Fill in fields added after a match was first saved. */
function normaliseMatch(m: Match): Match {
  return {
    ...m,
    competitionId: m.competitionId ?? null,
    location: m.location ?? '',
    notes: m.notes ?? '',
    result: m.result ?? null,
    remindAfter: m.remindAfter ?? null,
    status: m.status ?? 'scheduled',
  };
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

export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}
