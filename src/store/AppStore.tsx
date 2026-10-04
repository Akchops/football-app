import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type {
  AppData, Competition, Match, MatchResult, MatchStage, Profile, Result, Settings, Team, TrainingSession,
} from '../types';
import { createId, emptyData, live, loadData, parseData, saveData } from './storage';
import { buildSampleData } from './sample';
import { mergeRemote, type RemoteChanges } from '../lib/sync';

type Action =
  | { type: 'data/replace'; data: AppData }
  | { type: 'data/merge'; changes: RemoteChanges }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'profile/update'; patch: Partial<Profile> }
  | { type: 'team/add'; team: Team }
  | { type: 'team/update'; id: string; patch: Partial<Team> }
  | { type: 'team/delete'; id: string }
  | { type: 'match/addMany'; matches: Match[] }
  | { type: 'profile/confirmAgeGroup'; ageGroup: string; year: number }
  | { type: 'competition/add'; competition: Competition }
  | { type: 'competition/update'; id: string; patch: Partial<Competition> }
  | { type: 'competition/delete'; id: string }
  | ({ type: 'competition/finish'; id: string } & FinishCompetitionInput)
  | { type: 'competition/reopen'; id: string }
  | { type: 'match/add'; match: Match }
  | { type: 'match/update'; id: string; patch: Partial<Match> }
  | { type: 'match/delete'; id: string }
  | { type: 'training/add'; session: TrainingSession }
  | { type: 'training/update'; id: string; patch: Partial<TrainingSession> }
  | { type: 'training/delete'; id: string }
  | { type: 'result/add'; result: Result }
  | { type: 'result/update'; id: string; patch: Partial<Result> }
  | { type: 'result/delete'; id: string };

function touch<T extends { updatedAt: string }>(row: T): T {
  return { ...row, updatedAt: new Date().toISOString() };
}

/**
 * A delete has to be a thing that happened, not an absence. Dropping the row
 * leaves nothing to sync, so the next phone to push its copy puts it straight
 * back. The row stays, marked, and `live()` keeps it out of the app's sight.
 */
function bury<T extends { updatedAt: string; deletedAt: string | null }>(row: T): T {
  const at = new Date().toISOString();
  return { ...row, updatedAt: at, deletedAt: at };
}

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'data/replace':
      return action.data;

    // Records from the server are merged against whatever is here at this
    // moment, in one step - so an edit made while a sync was on its way is
    // never overwritten by what the sync saw before it.
    case 'data/merge':
      return mergeRemote(state, action.changes);

    // Settings and the profile are single records rather than lists, so they
    // carry their own edit time and merge whole.
    case 'settings/update':
      return { ...state, settings: touch({ ...state.settings, ...action.patch }) };

    case 'profile/update':
      return { ...state, profile: touch({ ...state.profile, ...action.patch }) };

    case 'profile/confirmAgeGroup': {
      // A squad moves up together, so teams in the player's old age group come
      // too. A team in any other group was set that way on purpose and stays.
      const from = state.profile.ageGroup;
      const moving = from !== '' && action.ageGroup !== from;
      return {
        ...state,
        profile: touch({ ...state.profile, ageGroup: action.ageGroup, ageGroupYear: action.year }),
        teams: moving
          ? state.teams.map((t) =>
              t.deletedAt === null && t.ageGroup === from ? touch({ ...t, ageGroup: action.ageGroup }) : t,
            )
          : state.teams,
      };
    }

    case 'team/add':
      return { ...state, teams: [...state.teams, action.team] };

    case 'team/update':
      return { ...state, teams: state.teams.map((t) => (t.id === action.id ? touch({ ...t, ...action.patch }) : t)) };

    case 'team/delete':
      // Matches outlive their team, same as competitions.
      return {
        ...state,
        teams: state.teams.map((t) => (t.id === action.id ? bury(t) : t)),
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
      return { ...state, training: state.training.map((t) => (t.id === action.id ? bury(t) : t)) };

    case 'competition/add':
      return { ...state, competitions: [...state.competitions, action.competition] };

    case 'competition/update':
      return {
        ...state,
        competitions: state.competitions.map((c) => (c.id === action.id ? touch({ ...c, ...action.patch }) : c)),
      };

    case 'competition/finish': {
      const { id, placing, ageGroup, notes } = action;
      return {
        ...state,
        competitions: state.competitions.map((c) =>
          c.id === id ? touch({ ...c, archived: true, placing, ageGroup, notes }) : c,
        ),
        // Rounds that never happened - a final they didn't reach - are called
        // off, the same as "Off" on the result prompt: nothing is lost, and they
        // stop asking for a score.
        matches: state.matches.map((m) =>
          m.competitionId === id && m.status === 'scheduled' && m.deletedAt === null
            ? touch<Match>({ ...m, status: 'cancelled', result: null, remindAfter: null })
            : m,
        ),
      };
    }

    case 'competition/reopen':
      return {
        ...state,
        competitions: state.competitions.map((c) => (c.id === action.id ? touch({ ...c, archived: false }) : c)),
      };

    case 'competition/delete':
      // Matches outlive their competition - they just become uncategorised. Other
      // teams' results only ever meant something inside it, so they go with it.
      return {
        ...state,
        competitions: state.competitions.map((c) => (c.id === action.id ? bury(c) : c)),
        matches: state.matches.map((m) =>
          m.competitionId === action.id ? touch({ ...m, competitionId: null }) : m,
        ),
        results: state.results.map((r) => (r.competitionId === action.id && r.deletedAt === null ? bury(r) : r)),
      };

    case 'result/add':
      return { ...state, results: [...state.results, action.result] };

    case 'result/update':
      return {
        ...state,
        results: state.results.map((r) => (r.id === action.id ? touch({ ...r, ...action.patch }) : r)),
      };

    case 'result/delete':
      return { ...state, results: state.results.map((r) => (r.id === action.id ? bury(r) : r)) };

    case 'match/add':
      return { ...state, matches: [...state.matches, action.match] };

    case 'match/update':
      return {
        ...state,
        matches: state.matches.map((m) => (m.id === action.id ? touch({ ...m, ...action.patch }) : m)),
      };

    case 'match/delete':
      return { ...state, matches: state.matches.map((m) => (m.id === action.id ? bury(m) : m)) };

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
  /** Left out for anything that is not a group game or knockout round. */
  stage?: MatchStage | null;
  stageDetail?: string;
}

export interface NewCompetitionInput {
  name: string;
  type: Competition['type'];
  season: string;
  ageGroup: string;
  color: string;
  notes: string;
  /** Table points; 3 for a win and 1 for a draw when left out. */
  pointsWin?: number;
  pointsDraw?: number;
}

/** What finishing a competition records - the stats themselves come from its matches. */
export interface FinishCompetitionInput {
  placing: string;
  ageGroup: string;
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
  stage?: MatchStage | null;
  stageDetail?: string;
}

export interface NewTournamentInput extends NewCompetitionInput {
  /** Its first day - kept even when no matches are known yet. */
  startDate: string;
  teamId: string | null;
  location: string;
  /** Tournament games are usually short - applied to every fixture. */
  durationMinutes: number;
  fixtures: TournamentFixture[];
}

/** A new fixture, not yet played. A stage's detail only means something with a stage. */
export function buildMatch(input: NewMatchInput, at: string): Match {
  return {
    id: createId('match'),
    ...input,
    stage: input.stage ?? null,
    stageDetail: input.stage ? (input.stageDetail ?? '').trim() : '',
    status: 'scheduled',
    result: null,
    remindAfter: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
}

/** The tournament and every fixture in it, each with the stage it was set up as. */
export function buildTournament(input: NewTournamentInput, at: string): { competition: Competition; matches: Match[] } {
  const { fixtures, teamId, location, startDate, durationMinutes, ...competitionInput } = input;
  const competition: Competition = {
    id: createId('comp'),
    ...competitionInput,
    type: 'tournament',
    archived: false,
    placing: '',
    // Kept on the tournament itself, so matches added one at a time later -
    // when there were no fixtures to make with it - start from them.
    startDate,
    teamId,
    location,
    matchLength: durationMinutes,
    pointsWin: competitionInput.pointsWin ?? 3,
    pointsDraw: competitionInput.pointsDraw ?? 1,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
  const matches = fixtures
    .filter((f) => f.date)
    .map((fixture) =>
      buildMatch(
        {
          competitionId: competition.id,
          teamId,
          opponent: fixture.opponent.trim() || 'TBC',
          date: fixture.date,
          time: fixture.time || '00:00',
          venue: 'neutral',
          location,
          durationMinutes,
          notes: '',
          stage: fixture.stage,
          stageDetail: fixture.stageDetail,
        },
        at,
      ),
    );
  return { competition, matches };
}

/** A game between two other teams, as the add-result form fills it in. */
export interface NewResultInput {
  competitionId: string;
  home: string;
  away: string;
  /** Null for both until it has been played. */
  homeGoals: number | null;
  awayGoals: number | null;
  date: string;
  stage?: MatchStage | null;
  stageDetail?: string;
}

/**
 * Tidies whatever parts of a result are given: names trimmed, half a score
 * treated as no score, and a group only kept alongside a stage.
 */
export function cleanResultPatch<T extends Partial<NewResultInput>>(input: T): T {
  const out: Partial<NewResultInput> = { ...input };
  if (input.home !== undefined) out.home = input.home.trim();
  if (input.away !== undefined) out.away = input.away.trim();
  if ('homeGoals' in input || 'awayGoals' in input) {
    const both = input.homeGoals != null && input.awayGoals != null;
    out.homeGoals = both ? input.homeGoals : null;
    out.awayGoals = both ? input.awayGoals : null;
  }
  if ('stage' in input) {
    out.stage = input.stage ?? null;
    out.stageDetail = input.stage ? (input.stageDetail ?? '').trim() : '';
  }
  return out as T;
}

export function buildResult(input: NewResultInput, at: string): Result {
  const clean = cleanResultPatch(input);
  return {
    id: createId('result'),
    competitionId: clean.competitionId,
    home: clean.home,
    away: clean.away,
    homeGoals: clean.homeGoals,
    awayGoals: clean.awayGoals,
    date: clean.date,
    stage: clean.stage ?? null,
    stageDetail: clean.stageDetail ?? '',
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
}

interface StoreValue {
  data: AppData;
  profile: Profile;
  settings: Settings;
  matches: Match[];
  competitions: Competition[];
  teams: Team[];
  training: TrainingSession[];
  /** Other teams' games, for competition tables. */
  results: Result[];
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
  /** Marks it over with how far they got, and calls off any rounds never played. */
  finishCompetition(id: string, input: FinishCompetitionInput): void;
  reopenCompetition(id: string): void;
  addTraining(input: NewTrainingInput): TrainingSession;
  updateTraining(id: string, patch: Partial<TrainingSession>): void;
  deleteTraining(id: string): void;
  addResult(input: NewResultInput): Result;
  updateResult(id: string, patch: Partial<NewResultInput>): void;
  deleteResult(id: string): void;
  addTeam(input: NewTeamInput): Team;
  updateTeam(id: string, patch: Partial<Team>): void;
  deleteTeam(id: string): void;
  updateSettings(patch: Partial<Settings>): void;
  updateProfile(patch: Partial<Profile>): void;
  /** Answers the new-season question: move to `ageGroup`, or pass the current one to stay. */
  confirmAgeGroup(ageGroup: string, year: number): void;
  competitionOf(match: Match): Competition | null;
  teamOf(match: Match): Team | null;
  /** Calendar dot colour, following the colour-by setting. */
  colorOf(match: Match): string;
  loadSampleData(): void;
  clearAllData(): void;
  importData(json: string): { ok: true } | { ok: false; error: string };
  exportData(): string;
  /** Records from the server, merged in record by record. */
  applyRemote(changes: RemoteChanges): void;
  /** Everything replaced at once - only for "use the family's only" when joining. */
  replaceData(data: AppData): void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, loadData);

  useEffect(() => {
    saveData(data);
  }, [data]);

  const value = useMemo<StoreValue>(() => {
    const now = () => new Date().toISOString();

    // Deleted rows stay in `data` so the delete reaches the other phones, but
    // nothing in the app should ever meet one. Everything below reads these,
    // including the lookups, which would otherwise happily hand back a team
    // that was just deleted.
    const matches = live(data.matches);
    const competitions = live(data.competitions);
    const teams = live(data.teams);
    const training = live(data.training);
    const results = live(data.results);

    return {
      data,
      profile: data.profile,
      settings: data.settings,
      matches,
      competitions,
      teams,
      training,
      results,

      addMatch(input) {
        const match = buildMatch(input, now());
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
          placing: '',
          startDate: '',
          teamId: null,
          location: '',
          matchLength: 0,
          pointsWin: input.pointsWin ?? 3,
          pointsDraw: input.pointsDraw ?? 1,
          createdAt: now(),
          updatedAt: now(),
          deletedAt: null,
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
        const { competition, matches: created } = buildTournament(input, now());
        dispatch({ type: 'competition/add', competition });
        if (created.length) dispatch({ type: 'match/addMany', matches: created });
        return competition;
      },

      finishCompetition(id, input) {
        dispatch({ type: 'competition/finish', id, ...input });
      },

      reopenCompetition(id) {
        dispatch({ type: 'competition/reopen', id });
      },

      addTraining(input) {
        const session: TrainingSession = {
          id: createId('train'),
          ...input,
          createdAt: now(),
          updatedAt: now(),
          deletedAt: null,
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

      addResult(input) {
        const result = buildResult(input, now());
        dispatch({ type: 'result/add', result });
        return result;
      },

      updateResult(id, patch) {
        dispatch({ type: 'result/update', id, patch: cleanResultPatch(patch) });
      },

      deleteResult(id) {
        dispatch({ type: 'result/delete', id });
      },

      addTeam(input) {
        const team: Team = { id: createId('team'), ...input, createdAt: now(), updatedAt: now(), deletedAt: null };
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

      confirmAgeGroup(ageGroup, year) {
        dispatch({ type: 'profile/confirmAgeGroup', ageGroup, year });
      },

      competitionOf(match) {
        return competitions.find((c) => c.id === match.competitionId) ?? null;
      },

      teamOf(match) {
        return teams.find((t) => t.id === match.teamId) ?? null;
      },

      colorOf(match) {
        const competition = competitions.find((c) => c.id === match.competitionId);
        const team = teams.find((t) => t.id === match.teamId);
        const preferred = data.settings.calendarColorBy === 'team' ? team?.color : competition?.color;
        return preferred ?? competition?.color ?? team?.color ?? 'var(--accent)';
      },

      loadSampleData() {
        dispatch({ type: 'data/replace', data: buildSampleData() });
      },

      clearAllData() {
        dispatch({ type: 'data/replace', data: emptyData() });
      },

      applyRemote(changes) {
        dispatch({ type: 'data/merge', changes });
      },

      replaceData(next) {
        dispatch({ type: 'data/replace', data: next });
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
