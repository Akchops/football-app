import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type { AppData, Competition, Match, MatchResult, Settings } from '../types';
import { createId, emptyData, loadData, saveData } from './storage';
import { buildSampleData } from './sample';

type Action =
  | { type: 'data/replace'; data: AppData }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'competition/add'; competition: Competition }
  | { type: 'competition/update'; id: string; patch: Partial<Competition> }
  | { type: 'competition/delete'; id: string }
  | { type: 'match/add'; match: Match }
  | { type: 'match/update'; id: string; patch: Partial<Match> }
  | { type: 'match/delete'; id: string };

function touch(match: Match): Match {
  return { ...match, updatedAt: new Date().toISOString() };
}

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'data/replace':
      return action.data;

    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'competition/add':
      return { ...state, competitions: [...state.competitions, action.competition] };

    case 'competition/update':
      return {
        ...state,
        competitions: state.competitions.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)),
      };

    case 'competition/delete':
      // Matches outlive their competition - they just become uncategorised.
      return {
        ...state,
        competitions: state.competitions.filter((c) => c.id !== action.id),
        matches: state.matches.map((m) =>
          m.competitionId === action.id ? touch({ ...m, competitionId: null }) : m,
        ),
      };

    case 'match/add':
      return { ...state, matches: [...state.matches, action.match] };

    case 'match/update':
      return {
        ...state,
        matches: state.matches.map((m) => (m.id === action.id ? touch({ ...m, ...action.patch }) : m)),
      };

    case 'match/delete':
      return { ...state, matches: state.matches.filter((m) => m.id !== action.id) };

    default:
      return state;
  }
}

export interface NewMatchInput {
  competitionId: string | null;
  opponent: string;
  date: string;
  time: string;
  venue: Match['venue'];
  location: string;
  notes: string;
}

export interface NewCompetitionInput {
  name: string;
  type: Competition['type'];
  season: string;
  color: string;
  notes: string;
}

interface StoreValue {
  data: AppData;
  settings: Settings;
  matches: Match[];
  competitions: Competition[];
  addMatch(input: NewMatchInput): Match;
  updateMatch(id: string, patch: Partial<Match>): void;
  deleteMatch(id: string): void;
  saveResult(id: string, result: MatchResult): void;
  clearResult(id: string): void;
  cancelMatch(id: string): void;
  restoreMatch(id: string): void;
  /** Push the "enter your result" prompt back by `minutes`. */
  snoozeMatch(id: string, minutes: number): void;
  addCompetition(input: NewCompetitionInput): Competition;
  updateCompetition(id: string, patch: Partial<Competition>): void;
  deleteCompetition(id: string): void;
  updateSettings(patch: Partial<Settings>): void;
  competitionOf(match: Match): Competition | null;
  loadSampleData(): void;
  clearAllData(): void;
  importData(json: string): { ok: true } | { ok: false; error: string };
  exportData(): string;
}

const StoreContext = createContext<StoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, loadData);

  useEffect(() => {
    saveData(data);
  }, [data]);

  const value = useMemo<StoreValue>(() => {
    const now = () => new Date().toISOString();

    return {
      data,
      settings: data.settings,
      matches: data.matches,
      competitions: data.competitions,

      addMatch(input) {
        const match: Match = {
          id: createId('match'),
          ...input,
          status: 'scheduled',
          result: null,
          remindAfter: null,
          createdAt: now(),
          updatedAt: now(),
        };
        dispatch({ type: 'match/add', match });
        return match;
      },

      updateMatch(id, patch) {
        dispatch({ type: 'match/update', id, patch });
      },

      deleteMatch(id) {
        dispatch({ type: 'match/delete', id });
      },

      saveResult(id, result) {
        dispatch({ type: 'match/update', id, patch: { status: 'played', result, remindAfter: null } });
      },

      clearResult(id) {
        dispatch({ type: 'match/update', id, patch: { status: 'scheduled', result: null } });
      },

      cancelMatch(id) {
        dispatch({ type: 'match/update', id, patch: { status: 'cancelled', result: null, remindAfter: null } });
      },

      restoreMatch(id) {
        dispatch({ type: 'match/update', id, patch: { status: 'scheduled' } });
      },

      snoozeMatch(id, minutes) {
        const until = new Date(Date.now() + minutes * 60000).toISOString();
        dispatch({ type: 'match/update', id, patch: { remindAfter: until } });
      },

      addCompetition(input) {
        const competition: Competition = {
          id: createId('comp'),
          ...input,
          archived: false,
          createdAt: now(),
        };
        dispatch({ type: 'competition/add', competition });
        return competition;
      },

      updateCompetition(id, patch) {
        dispatch({ type: 'competition/update', id, patch });
      },

      deleteCompetition(id) {
        dispatch({ type: 'competition/delete', id });
      },

      updateSettings(patch) {
        dispatch({ type: 'settings/update', patch });
      },

      competitionOf(match) {
        return data.competitions.find((c) => c.id === match.competitionId) ?? null;
      },

      loadSampleData() {
        dispatch({ type: 'data/replace', data: buildSampleData() });
      },

      clearAllData() {
        dispatch({ type: 'data/replace', data: emptyData() });
      },

      exportData() {
        return JSON.stringify(data, null, 2);
      },

      importData(json) {
        try {
          const parsed = JSON.parse(json) as Partial<AppData>;
          if (!Array.isArray(parsed.matches) || !Array.isArray(parsed.competitions)) {
            return { ok: false, error: 'That file does not look like a Matchday backup.' };
          }
          const base = emptyData();
          dispatch({
            type: 'data/replace',
            data: {
              version: base.version,
              settings: { ...base.settings, ...(parsed.settings ?? {}) },
              competitions: parsed.competitions as Competition[],
              matches: parsed.matches as Match[],
            },
          });
          return { ok: true };
        } catch {
          return { ok: false, error: 'Could not read that file - is it valid JSON?' };
        }
      },
    };
  }, [data]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside <AppStoreProvider>');
  return value;
}
