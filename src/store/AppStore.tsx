import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type {
  AppData, Competition, Match, MatchResult, Profile, Settings, Team, TrainingSession,
} from '../types';
import { createId, emptyData, loadData, parseData, saveData } from './storage';
import { buildSampleData } from './sample';

type Action =
  | { type: 'data/replace'; data: AppData }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'profile/update'; patch: Partial<Profile> }
  | { type: 'team/add'; team: Team }
  | { type: 'team/update'; id: string; patch: Partial<Team> }
  | { type: 'team/delete'; id: string }
  | { type: 'match/addMany'; matches: Match[] }
  | { type: 'competition/add'; competition: Competition }
  | { type: 'competition/update'; id: string; patch: Partial<Competition> }
  | { type: 'competition/delete'; id: string }
  | { type: 'match/add'; match: Match }
  | { type: 'match/update'; id: string; patch: Partial<Match> }
  | { type: 'match/delete'; id: string }
  | { type: 'training/add'; session: TrainingSession }
  | { type: 'training/update'; id: string; patch: Partial<TrainingSession> }
  | { type: 'training/delete'; id: string };

function touch(match: Match): Match {
  return { ...match, updatedAt: new Date().toISOString() };
}

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'data/replace':
      return action.data;

    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'profile/update':
      return { ...state, profile: { ...state.profile, ...action.patch } };

    case 'team/add':
      return { ...state, teams: [...state.teams, action.team] };

    case 'team/update':
      return { ...state, teams: state.teams.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)) };

    case 'team/delete':
      // Matches outlive their team, same as competitions.
      return {
        ...state,
        teams: state.teams.filter((t) => t.id !== action.id),
        matches: state.matches.map((m) => (m.teamId === action.id ? touch({ ...m, teamId: null }) : m)),
      };

    case 'match/addMany':
      return { ...state, matches: [...state.matches, ...action.matches] };

    case 'training/add':
      return { ...state, training: [...state.training, action.session] };

    case 'training/update':
      return {
        ...state,
        training: state.training.map((t) =>
          t.id === action.id ? { ...t, ...action.patch, updatedAt: new Date().toISOString() } : t,
        ),
      };

    case 'training/delete':
      return { ...state, training: state.training.filter((t) => t.id !== action.id) };

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
  teamId: string | null;
  opponent: string;
  durationMinutes: number;
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

export interface NewTrainingInput {
  teamId: string | null;
  type: TrainingSession['type'];
  date: string;
  time: string;
  durationMinutes: number;
  intensity: number;
  focus: string;
  notes: string;
}

export interface NewTeamInput {
  name: string;
  ageGroup: string;
  position: string;
  color: string;
  notes: string;
}

/** One fixture inside a tournament being created in a single go. */
export interface TournamentFixture {
  opponent: string;
  date: string;
  time: string;
}

export interface NewTournamentInput extends NewCompetitionInput {
  teamId: string | null;
  location: string;
  /** Tournament games are usually short - applied to every fixture. */
  durationMinutes: number;
  fixtures: TournamentFixture[];
}

interface StoreValue {
  data: AppData;
  profile: Profile;
  settings: Settings;
  matches: Match[];
  competitions: Competition[];
  teams: Team[];
  training: TrainingSession[];
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
  /** Creates the tournament and all of its fixtures in one go. */
  addTournament(input: NewTournamentInput): Competition;
  addTraining(input: NewTrainingInput): TrainingSession;
  updateTraining(id: string, patch: Partial<TrainingSession>): void;
  deleteTraining(id: string): void;
  addTeam(input: NewTeamInput): Team;
  updateTeam(id: string, patch: Partial<Team>): void;
  deleteTeam(id: string): void;
  updateSettings(patch: Partial<Settings>): void;
  updateProfile(patch: Partial<Profile>): void;
  competitionOf(match: Match): Competition | null;
  teamOf(match: Match): Team | null;
  /** Calendar dot colour, following the colour-by setting. */
  colorOf(match: Match): string;
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
      profile: data.profile,
      settings: data.settings,
      matches: data.matches,
      competitions: data.competitions,
      teams: data.teams,
      training: data.training,

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

      addTournament(input) {
        const { fixtures, teamId, location, durationMinutes: _duration, ...competitionInput } = input;
        const competition: Competition = {
          id: createId('comp'),
          ...competitionInput,
          type: 'tournament',
          archived: false,
          createdAt: now(),
        };
        dispatch({ type: 'competition/add', competition });

        const created = fixtures
          .filter((f) => f.date)
          .map<Match>((fixture) => ({
            id: createId('match'),
            competitionId: competition.id,
            teamId,
            opponent: fixture.opponent.trim() || 'TBC',
            date: fixture.date,
            time: fixture.time || '00:00',
            venue: 'neutral',
            location,
            durationMinutes: input.durationMinutes,
            status: 'scheduled',
            result: null,
            notes: '',
            remindAfter: null,
            createdAt: now(),
            updatedAt: now(),
          }));
        if (created.length) dispatch({ type: 'match/addMany', matches: created });
        return competition;
      },

      addTraining(input) {
        const session: TrainingSession = {
          id: createId('train'),
          ...input,
          createdAt: now(),
          updatedAt: now(),
        };
        dispatch({ type: 'training/add', session });
        return session;
      },

      updateTraining(id, patch) {
        dispatch({ type: 'training/update', id, patch });
      },

      deleteTraining(id) {
        dispatch({ type: 'training/delete', id });
      },

      addTeam(input) {
        const team: Team = { id: createId('team'), ...input, createdAt: now() };
        dispatch({ type: 'team/add', team });
        return team;
      },

      updateTeam(id, patch) {
        dispatch({ type: 'team/update', id, patch });
      },

      deleteTeam(id) {
        dispatch({ type: 'team/delete', id });
      },

      updateSettings(patch) {
        dispatch({ type: 'settings/update', patch });
      },

      updateProfile(patch) {
        dispatch({ type: 'profile/update', patch });
      },

      competitionOf(match) {
        return data.competitions.find((c) => c.id === match.competitionId) ?? null;
      },

      teamOf(match) {
        return data.teams.find((t) => t.id === match.teamId) ?? null;
      },

      colorOf(match) {
        const competition = data.competitions.find((c) => c.id === match.competitionId);
        const team = data.teams.find((t) => t.id === match.teamId);
        const preferred = data.settings.calendarColorBy === 'team' ? team?.color : competition?.color;
        return preferred ?? competition?.color ?? team?.color ?? 'var(--accent)';
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
          // Reuse the loader so an older backup is migrated on the way in.
          dispatch({ type: 'data/replace', data: parseData(json) });
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
