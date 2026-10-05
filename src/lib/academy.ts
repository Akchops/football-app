import type { SupabaseClient } from '@supabase/supabase-js';
import type { Competition, CompetitionType, Match, MatchStage, Profile, Result } from '../types';
import { cleanDetail, toStage } from './stage';
import { fromServer, profileFromServer } from './sync';

/**
 * Academies, through Supabase. Like remote.ts, every call runs as the
 * signed-in person and the rules in supabase/schema.sql decide what each one
 * may see and do; the checks here only decide which buttons to show, so a
 * button that should not be there fails safely on the server rather than
 * doing something it should not.
 */

export type StaffRole = 'owner' | 'manager' | 'coach' | 'admin';
export type Verification = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface Academy {
  id: string;
  name: string;
  town: string;
  country: string;
  contactEmail: string;
  ageGroups: string[];
  /** A small picture as a data URL, or ''. */
  logo: string;
  joinCode: string;
  verification: Verification;
  /** Why it was not approved, when it was not. */
  verificationNote: string;
}

/** An academy someone works at, and as what. */
export interface StaffAcademy extends Academy {
  role: StaffRole;
}

export interface StaffMember {
  userId: string;
  username: string;
  role: StaffRole;
  isMe: boolean;
}

/** An invite the academy has sent that nobody has answered yet. */
export interface PendingStaff {
  id: string;
  username: string;
  role: StaffRole;
  invitedBy: string;
}

/** An invite to work at an academy, waiting for the person it was sent to. */
export interface StaffInvite {
  id: string;
  academyId: string;
  academyName: string;
  town: string;
  verification: Verification;
  role: StaffRole;
  invitedBy: string;
}

export type PlayerStatus = 'roster' | 'invited' | 'requested' | 'linked' | 'declined' | 'left';

/** A group of players - "U14 Elite", "Dubai Cup squad". A player can be in several. */
export interface Squad {
  id: string;
  name: string;
  ageGroup: string;
  coachIds: string[];
  /** Ids of the academy's players (AcademyPlayer.id) in it. */
  memberIds: string[];
}

/** Someone on an academy's books. */
export interface AcademyPlayer {
  id: string;
  /** Their Matchday player while invited, asking or linked; null for a name with no app, or once they leave. */
  playerId: string | null;
  name: string;
  position: string;
  ageGroup: string;
  status: PlayerStatus;
  createdAt: string;
  /** When the family said yes. */
  consentAt: string | null;
}

export interface AcademyPlayerDetails {
  name: string;
  position: string;
  ageGroup: string;
}

/** An academy asking to add the family's player. */
export interface PlayerInvite {
  id: string;
  academyId: string;
  academyName: string;
  town: string;
  verification: Verification;
  invitedBy: string;
}

/** A request to join that the family has sent, not yet answered. */
export interface JoinRequest {
  id: string;
  academyId: string;
  academyName: string;
  town: string;
  verification: Verification;
}

/** An academy the family's player is linked to, and the squads they are in there. */
export interface Membership {
  linkId: string;
  academyId: string;
  academyName: string;
  verification: Verification;
  town: string;
  logo: string;
  squads: { id: string; name: string; mates: string[] }[];
}

/** One of the academy's own competitions, for its tables. */
export interface AcademyCompetition {
  id: string;
  academyId: string;
  /** The squad that plays in it, if one does. */
  squadId: string | null;
  name: string;
  type: CompetitionType;
  season: string;
  /** What the academy's side is called in this competition's table. */
  teamName: string;
  pointsWin: number;
  pointsDraw: number;
}

export type AcademyCompetitionInput = Omit<AcademyCompetition, 'id' | 'academyId'>;

/** A game in an academy competition - the academy's own or anyone else's. */
export interface AcademyResultInput {
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
  date: string;
  stage: MatchStage | null;
  stageDetail: string;
}

/** What an academy can read of one linked player's Matchday: never more than their family sees. */
export interface PlayerRecords {
  playerId: string;
  profile: Profile | null;
  matches: Match[];
  competitions: Competition[];
}

/** A team pick: a named list of players, in order. */
export interface Selection {
  id: string;
  squadId: string | null;
  name: string;
  /** AcademyPlayer ids, in the order picked. */
  playerIds: string[];
  notes: string;
  updatedAt: string;
}

export type SelectionInput = Omit<Selection, 'id' | 'updatedAt'>;

export interface AcademyDetails {
  name: string;
  town: string;
  country: string;
  contactEmail: string;
  ageGroups: string[];
  logo: string;
}

export interface AcademyApi {
  /** The signed-in person's username, or null if they have not picked one. */
  username(): Promise<string | null>;
  usernameAvailable(name: string): Promise<boolean>;
  /** Takes a username, or changes it. Resolves to it as stored. */
  claimUsername(name: string): Promise<string>;
  staffAcademies(): Promise<StaffAcademy[]>;
  createAcademy(details: AcademyDetails): Promise<string>;
  updateAcademy(id: string, patch: Partial<AcademyDetails>): Promise<void>;
  deleteAcademy(id: string): Promise<void>;
  newJoinCode(id: string): Promise<string>;
  staffInvitesForMe(): Promise<StaffInvite[]>;
  answerStaffInvite(inviteId: string, accept: boolean): Promise<void>;
  staff(academyId: string): Promise<StaffMember[]>;
  pendingStaff(academyId: string): Promise<PendingStaff[]>;
  inviteStaff(academyId: string, username: string, role: StaffRole): Promise<void>;
  cancelStaffInvite(inviteId: string): Promise<void>;
  setStaffRole(academyId: string, userId: string, role: StaffRole): Promise<void>;
  removeStaff(academyId: string, userId: string): Promise<void>;
  transferOwnership(academyId: string, userId: string): Promise<void>;

  squads(academyId: string): Promise<Squad[]>;
  createSquad(academyId: string, name: string, ageGroup: string): Promise<string>;
  updateSquad(id: string, patch: { name?: string; ageGroup?: string }): Promise<void>;
  deleteSquad(id: string): Promise<void>;
  setSquadCoach(squadId: string, userId: string, on: boolean): Promise<void>;
  setSquadMember(squadId: string, academyPlayerId: string, on: boolean): Promise<void>;
  players(academyId: string): Promise<AcademyPlayer[]>;
  /** A name with no app, so squad lists are complete. */
  addRosterPlayer(academyId: string, details: AcademyPlayerDetails): Promise<string>;
  updatePlayer(id: string, patch: Partial<AcademyPlayerDetails>): Promise<void>;
  removePlayer(id: string): Promise<void>;
  /** Asks a player's family, by the username of anyone in it. Optionally links a name already on the books, or puts them in a squad. */
  invitePlayer(academyId: string, username: string, options?: { rosterId?: string; squadId?: string }): Promise<string>;
  answerJoinRequest(requestId: string, accept: boolean, squadId?: string): Promise<void>;

  competitions(academyId: string): Promise<AcademyCompetition[]>;
  /** Makes a competition, or with an id, changes one. */
  saveCompetition(academyId: string, input: AcademyCompetitionInput, id?: string): Promise<string>;
  deleteCompetition(id: string): Promise<void>;
  /** A competition's games, shaped as the app's other-team results so the same tables read them. */
  results(competitionId: string): Promise<Result[]>;
  addResult(competitionId: string, input: AcademyResultInput): Promise<string>;
  updateResult(id: string, input: AcademyResultInput): Promise<void>;
  deleteResult(id: string): Promise<void>;

  /** Linked players' own records, as far as the rules let the viewer see: a coach gets only their squads'. */
  playerRecords(playerIds: string[]): Promise<PlayerRecords[]>;
  selections(academyId: string): Promise<Selection[]>;
  saveSelection(academyId: string, input: SelectionInput, id?: string): Promise<string>;
  deleteSelection(id: string): Promise<void>;

  // The family's side.
  playerInvitesForMe(): Promise<PlayerInvite[]>;
  answerPlayerInvite(inviteId: string, accept: boolean, consent: boolean): Promise<void>;
  joinByCode(code: string, consent: boolean): Promise<string>;
  joinRequests(): Promise<JoinRequest[]>;
  memberships(): Promise<Membership[]>;
  /** Leaves an academy, or takes back a request to join one. */
  leaveAcademy(linkId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Usernames. The same rules as username_problem() in schema.sql - a test
// reads that file to keep the two the same.
// ---------------------------------------------------------------------------

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export const RESERVED_USERNAMES = [
  'admin', 'administrator', 'matchday', 'support', 'help', 'root', 'system',
  'academy', 'staff', 'owner', 'coach', 'manager', 'moderator', 'null', 'undefined',
];

/** What someone typed, as it would be stored: no @, no spaces round it, lowercase. */
export function cleanUsername(input: string): string {
  return input.trim().replace(/^@+/, '').toLowerCase();
}

/** Why a username cannot be had, before asking the server whether it is taken. */
export function usernameProblem(input: string): string | null {
  const name = cleanUsername(input);
  if (!USERNAME_PATTERN.test(name)) return '3 to 20 letters, numbers or _';
  if (RESERVED_USERNAMES.includes(name)) return 'That one is reserved';
  return null;
}

// ---------------------------------------------------------------------------
// Roles: who may do what. Mirrors the server, for deciding what to show.
// ---------------------------------------------------------------------------

export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  coach: 'Coach',
  admin: 'Admin',
};

export const ROLE_BLURB: Record<StaffRole, string> = {
  owner: 'Everything, including verification, deleting the academy and handing it over.',
  manager: "Players, squads, staff and competitions, and every player's stats.",
  coach: "The squads they're given: those players' stats, results and team picks.",
  admin: "The office side: staff and the academy's details. Never sees a player's stats.",
};

export const PLAYER_STATUS_LABEL: Record<PlayerStatus, string> = {
  linked: 'Linked',
  invited: 'Invited',
  requested: 'Asking to join',
  roster: 'No app',
  declined: 'Said no',
  left: 'Left',
};

/** A join code as typed: capitals, no spaces. Codes never use 0, O, 1 or I. */
export function cleanJoinCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export const VERIFICATION_LABEL: Record<Verification, string> = {
  unverified: 'Not verified',
  pending: 'Under review',
  verified: 'Verified',
  rejected: 'Not approved',
};

export type AcademyAction =
  /** Name, logo, town, country, contact email, age groups. */
  | 'edit-details'
  | 'invite-staff'
  | 'new-join-code'
  | 'delete'
  | 'hand-over'
  | 'verify'
  /** Make, rename and delete squads, choose their coaches, and move anyone between them. */
  | 'run-squads'
  /** Invite players, add names, answer requests to join - into squads they coach. */
  | 'add-players'
  /** Take a player off the academy's books altogether. */
  | 'remove-players'
  /** Competitions, results and team picks - and players' stats. */
  | 'coach';

const ALLOWED: Record<AcademyAction, StaffRole[]> = {
  'edit-details': ['owner', 'manager', 'admin'],
  'invite-staff': ['owner', 'manager', 'admin'],
  'new-join-code': ['owner', 'manager'],
  delete: ['owner'],
  'hand-over': ['owner'],
  verify: ['owner'],
  'run-squads': ['owner', 'manager'],
  'add-players': ['owner', 'manager', 'coach'],
  'remove-players': ['owner', 'manager'],
  coach: ['owner', 'manager', 'coach'],
};

/**
 * The squads someone may put a player in: every squad for the owner and
 * managers; for a coach, the ones they coach - and, for a player already
 * linked, none, since that would open the player's stats to them.
 */
export function squadsToAddTo(role: StaffRole, myUserId: string, squads: Squad[], player?: Pick<AcademyPlayer, 'status'>): Squad[] {
  if (can(role, 'run-squads')) return squads;
  if (role !== 'coach' || player?.status === 'linked') return [];
  return squads.filter((s) => s.coachIds.includes(myUserId));
}

/** Whether someone may take a player out of a squad: the owner and managers, or that squad's coach. */
export function canTakeOutOf(role: StaffRole, myUserId: string, squad: Squad): boolean {
  return can(role, 'run-squads') || (role === 'coach' && squad.coachIds.includes(myUserId));
}

export function can(role: StaffRole | null | undefined, action: AcademyAction): boolean {
  return role ? ALLOWED[action].includes(role) : false;
}

/**
 * The roles `me` may give someone who is now `theirs` - or, with `theirs`
 * null, may invite someone new as. Empty when they may not change it at all.
 */
export function rolesToGive(me: StaffRole, theirs: StaffRole | null): StaffRole[] {
  if (theirs === 'owner') return [];
  if (me === 'owner') return ['manager', 'coach', 'admin'];
  if ((me === 'manager' || me === 'admin') && theirs !== 'manager') return ['coach', 'admin'];
  return [];
}

/** Whether `me` may take someone who is `theirs` off the staff. Leaving is always allowed, except for the owner. */
export function canRemove(me: StaffRole, theirs: StaffRole, isMe: boolean): boolean {
  if (theirs === 'owner') return false;
  if (isMe || me === 'owner') return true;
  return (me === 'manager' || me === 'admin') && (theirs === 'coach' || theirs === 'admin');
}

// ---------------------------------------------------------------------------
// Errors, said the way the person holding the phone would want them.
// ---------------------------------------------------------------------------

export function describeAcademyError(e: unknown): string {
  const message = (e instanceof Error ? e.message : String(e)).trim();
  if ((typeof navigator !== 'undefined' && navigator.onLine === false) || /failed to fetch|load failed|fetch failed|networkerror/i.test(message)) {
    return 'No signal - try again when you are back online.';
  }
  if (/jwt|not authenticated/i.test(message)) return 'Your sign-in has run out. Sign out and in again.';
  if (/permission denied|row-level security/i.test(message)) return "You don't have permission to do that.";
  if (!message) return 'Something went wrong. Try again.';
  // The server's own messages are written to be shown; give them a capital and a full stop.
  const sentence = message.charAt(0).toUpperCase() + message.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

// ---------------------------------------------------------------------------
// The server.
// ---------------------------------------------------------------------------

type Result_<T> = { data: T | null; error: { message: string; code?: string } | null };

function check<T>(result: Result_<T>): T {
  if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
  return result.data as T;
}

/** Updates and deletes that the rules filter out change nothing rather than failing; this makes that a failure. */
function changedOne(rows: unknown[] | null, refusal: string): void {
  if (!rows || rows.length === 0) throw new Error(refusal);
}

interface AcademyRow {
  id: string;
  name: string;
  town: string;
  country: string;
  contact_email: string;
  age_groups: string[] | null;
  logo: string;
  join_code: string;
  verification: Verification;
  verification_note: string;
}

const ACADEMY_COLUMNS = 'id, name, town, country, contact_email, age_groups, logo, join_code, verification, verification_note';

function toAcademy(row: AcademyRow): Academy {
  return {
    id: row.id,
    name: row.name,
    town: row.town ?? '',
    country: row.country ?? '',
    contactEmail: row.contact_email ?? '',
    ageGroups: row.age_groups ?? [],
    logo: row.logo ?? '',
    joinCode: row.join_code,
    verification: row.verification,
    verificationNote: row.verification_note ?? '',
  };
}

function playerRow(patch: Partial<AcademyPlayerDetails>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.display_name = patch.name.trim();
  if (patch.position !== undefined) row.position = patch.position;
  if (patch.ageGroup !== undefined) row.age_group = patch.ageGroup;
  return row;
}

interface CompetitionRow {
  id: string;
  academy_id: string;
  squad_id: string | null;
  name: string;
  type: CompetitionType;
  season: string;
  team_name: string;
  points_win: number;
  points_draw: number;
}

function toCompetition(r: CompetitionRow): AcademyCompetition {
  return {
    id: r.id,
    academyId: r.academy_id,
    squadId: r.squad_id,
    name: r.name,
    type: r.type,
    season: r.season ?? '',
    teamName: r.team_name ?? '',
    pointsWin: r.points_win,
    pointsDraw: r.points_draw,
  };
}

function competitionRow(input: AcademyCompetitionInput): Record<string, unknown> {
  return {
    squad_id: input.squadId,
    name: input.name.trim(),
    type: input.type,
    season: input.season.trim(),
    team_name: input.teamName.trim(),
    points_win: input.pointsWin,
    points_draw: input.pointsDraw,
  };
}

interface ResultRow {
  id: string;
  competition_id: string;
  home: string;
  away: string;
  home_goals: number | null;
  away_goals: number | null;
  date: string;
  stage: string | null;
  stage_detail: string;
  created_at: string;
  updated_at: string;
}

function toResult(r: ResultRow): Result {
  const stage = toStage(r.stage);
  return {
    id: r.id,
    competitionId: r.competition_id,
    home: r.home,
    away: r.away,
    homeGoals: r.home_goals,
    awayGoals: r.away_goals,
    date: r.date ?? '',
    stage,
    stageDetail: stage ? cleanDetail(stage, r.stage_detail ?? '') : '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: null,
  };
}

function resultRow(input: AcademyResultInput): Record<string, unknown> {
  // Half a score is no score: both or neither, as the table needs.
  const scored = input.homeGoals !== null && input.awayGoals !== null;
  return {
    home: input.home.trim(),
    away: input.away.trim(),
    home_goals: scored ? input.homeGoals : null,
    away_goals: scored ? input.awayGoals : null,
    date: input.date,
    stage: input.stage,
    stage_detail: input.stage ? input.stageDetail.trim() : '',
  };
}

/** A row that is already there counts as added. */
function insertedOrThere(result: Result_<unknown>): void {
  if (result.error?.code === '23505') return;
  check(result);
}

function toRow(patch: Partial<AcademyDetails>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.town !== undefined) row.town = patch.town.trim();
  if (patch.country !== undefined) row.country = patch.country.trim();
  if (patch.contactEmail !== undefined) row.contact_email = patch.contactEmail.trim();
  if (patch.ageGroups !== undefined) row.age_groups = patch.ageGroups;
  if (patch.logo !== undefined) row.logo = patch.logo;
  return row;
}

export function academyApi(sb: SupabaseClient, userId: string): AcademyApi {
  const api: AcademyApi = {
    async username() {
      const row = check(
        (await sb.from('profiles').select('username').eq('user_id', userId).maybeSingle()) as Result_<{
          username: string;
        } | null>,
      );
      return row?.username ?? null;
    },

    async usernameAvailable(name) {
      return Boolean(check((await sb.rpc('username_available', { name: cleanUsername(name) })) as Result_<boolean>));
    },

    async claimUsername(name) {
      return check((await sb.rpc('claim_username', { name: cleanUsername(name) })) as Result_<string>);
    },

    async staffAcademies() {
      const rows = check(
        (await sb
          .from('academy_members')
          .select(`role, created_at, academies(${ACADEMY_COLUMNS})`)
          .eq('user_id', userId)
          .order('created_at', { ascending: true })) as Result_<
          { role: StaffRole; academies: AcademyRow | AcademyRow[] | null }[]
        >,
      );
      return rows.flatMap((r) => {
        const academy = Array.isArray(r.academies) ? r.academies[0] : r.academies;
        return academy ? [{ ...toAcademy(academy), role: r.role }] : [];
      });
    },

    async createAcademy(details) {
      const id = check(
        (await sb.rpc('create_academy', {
          name: details.name.trim(),
          town: details.town.trim(),
          country: details.country.trim(),
          contact_email: details.contactEmail.trim(),
          age_groups: details.ageGroups,
        })) as Result_<string>,
      );
      // The logo is the one thing too big to want in a function call's arguments.
      if (details.logo) await api.updateAcademy(id, { logo: details.logo });
      return id;
    },

    async updateAcademy(id, patch) {
      const rows = check(
        (await sb.from('academies').update(toRow(patch)).eq('id', id).select('id')) as Result_<{ id: string }[]>,
      );
      changedOne(rows, "You can't change this academy's details.");
    },

    async deleteAcademy(id) {
      const rows = check((await sb.from('academies').delete().eq('id', id).select('id')) as Result_<{ id: string }[]>);
      changedOne(rows, 'Only the owner can delete the academy.');
    },

    async newJoinCode(id) {
      return check((await sb.rpc('new_join_code', { aid: id })) as Result_<string>);
    },

    async staffInvitesForMe() {
      const rows = check(
        (await sb.rpc('my_staff_invites')) as Result_<
          {
            id: string;
            academy_id: string;
            academy_name: string;
            town: string;
            verification: Verification;
            role: StaffRole;
            invited_by: string;
          }[]
        >,
      );
      return rows.map((r) => ({
        id: r.id,
        academyId: r.academy_id,
        academyName: r.academy_name,
        town: r.town ?? '',
        verification: r.verification,
        role: r.role,
        invitedBy: r.invited_by ?? '',
      }));
    },

    async answerStaffInvite(inviteId, accept) {
      check((await sb.rpc('answer_staff_invite', { invite_id: inviteId, accept })) as Result_<unknown>);
    },

    async staff(academyId) {
      const rows = check(
        (await sb.rpc('academy_staff', { aid: academyId })) as Result_<
          { user_id: string; username: string; role: StaffRole; is_me: boolean }[]
        >,
      );
      return rows.map((r) => ({ userId: r.user_id, username: r.username ?? '', role: r.role, isMe: r.is_me }));
    },

    async pendingStaff(academyId) {
      const rows = check(
        (await sb.rpc('pending_staff', { aid: academyId })) as Result_<
          { id: string; username: string; role: StaffRole; invited_by: string }[]
        >,
      );
      return rows.map((r) => ({ id: r.id, username: r.username ?? '', role: r.role, invitedBy: r.invited_by ?? '' }));
    },

    async inviteStaff(academyId, username, role) {
      check((await sb.rpc('invite_staff', { aid: academyId, username: cleanUsername(username), role })) as Result_<unknown>);
    },

    async cancelStaffInvite(inviteId) {
      const rows = check(
        (await sb.from('academy_staff_invites').delete().eq('id', inviteId).select('id')) as Result_<{ id: string }[]>,
      );
      changedOne(rows, 'That invite has already been answered or cancelled.');
    },

    async setStaffRole(academyId, member, role) {
      check((await sb.rpc('set_staff_role', { aid: academyId, member, role })) as Result_<unknown>);
    },

    async removeStaff(academyId, member) {
      check((await sb.rpc('remove_staff', { aid: academyId, member })) as Result_<unknown>);
    },

    async transferOwnership(academyId, member) {
      check((await sb.rpc('transfer_ownership', { aid: academyId, member })) as Result_<unknown>);
    },

    async squads(academyId) {
      const rows = check(
        (await sb
          .from('academy_squads')
          .select('id, name, age_group, created_at, squad_coaches(user_id), squad_players(academy_player_id)')
          .eq('academy_id', academyId)
          .order('created_at', { ascending: true })) as Result_<
          {
            id: string;
            name: string;
            age_group: string;
            squad_coaches: { user_id: string }[] | null;
            squad_players: { academy_player_id: string }[] | null;
          }[]
        >,
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        ageGroup: r.age_group ?? '',
        coachIds: (r.squad_coaches ?? []).map((c) => c.user_id),
        memberIds: (r.squad_players ?? []).map((p) => p.academy_player_id),
      }));
    },

    async createSquad(academyId, name, ageGroup) {
      const row = check(
        (await sb
          .from('academy_squads')
          .insert({ academy_id: academyId, name: name.trim(), age_group: ageGroup })
          .select('id')
          .single()) as Result_<{ id: string }>,
      );
      return row.id;
    },

    async updateSquad(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.name = patch.name.trim();
      if (patch.ageGroup !== undefined) row.age_group = patch.ageGroup;
      const rows = check((await sb.from('academy_squads').update(row).eq('id', id).select('id')) as Result_<{ id: string }[]>);
      changedOne(rows, 'Only the owner or a manager can change a squad.');
    },

    async deleteSquad(id) {
      const rows = check((await sb.from('academy_squads').delete().eq('id', id).select('id')) as Result_<{ id: string }[]>);
      changedOne(rows, 'Only the owner or a manager can delete a squad.');
    },

    async setSquadCoach(squadId, member, on) {
      if (on) {
        insertedOrThere((await sb.from('squad_coaches').insert({ squad_id: squadId, user_id: member })) as Result_<unknown>);
      } else {
        check((await sb.from('squad_coaches').delete().eq('squad_id', squadId).eq('user_id', member)) as Result_<unknown>);
      }
    },

    async setSquadMember(squadId, academyPlayerId, on) {
      if (on) {
        insertedOrThere(
          (await sb.from('squad_players').insert({ squad_id: squadId, academy_player_id: academyPlayerId })) as Result_<unknown>,
        );
      } else {
        const rows = check(
          (await sb
            .from('squad_players')
            .delete()
            .eq('squad_id', squadId)
            .eq('academy_player_id', academyPlayerId)
            .select('squad_id')) as Result_<{ squad_id: string }[]>,
        );
        changedOne(rows, "Only the owner, a manager or the squad's coach can take someone out of it.");
      }
    },

    async players(academyId) {
      const rows = check(
        (await sb
          .from('academy_players')
          .select('id, player_id, display_name, position, age_group, status, created_at, consent_at')
          .eq('academy_id', academyId)
          .order('display_name', { ascending: true })) as Result_<
          {
            id: string;
            player_id: string | null;
            display_name: string;
            position: string;
            age_group: string;
            status: PlayerStatus;
            created_at: string;
            consent_at: string | null;
          }[]
        >,
      );
      return rows.map((r) => ({
        id: r.id,
        playerId: r.player_id,
        name: r.display_name,
        position: r.position ?? '',
        ageGroup: r.age_group ?? '',
        status: r.status,
        createdAt: r.created_at,
        consentAt: r.consent_at,
      }));
    },

    async addRosterPlayer(academyId, details) {
      const row = check(
        (await sb
          .from('academy_players')
          .insert({ academy_id: academyId, status: 'roster', ...playerRow(details) })
          .select('id')
          .single()) as Result_<{ id: string }>,
      );
      return row.id;
    },

    async updatePlayer(id, patch) {
      const rows = check(
        (await sb.from('academy_players').update(playerRow(patch)).eq('id', id).select('id')) as Result_<{ id: string }[]>,
      );
      changedOne(rows, "You can't change this player's details.");
    },

    async removePlayer(id) {
      const rows = check((await sb.from('academy_players').delete().eq('id', id).select('id')) as Result_<{ id: string }[]>);
      changedOne(rows, 'Only the owner or a manager can take a player off the books.');
    },

    async invitePlayer(academyId, username, options = {}) {
      return check(
        (await sb.rpc('invite_player', {
          aid: academyId,
          username: cleanUsername(username),
          roster_id: options.rosterId ?? null,
          squad: options.squadId ?? null,
        })) as Result_<string>,
      );
    },

    async answerJoinRequest(requestId, accept, squadId) {
      check(
        (await sb.rpc('answer_join_request', { request_id: requestId, accept, squad: squadId ?? null })) as Result_<unknown>,
      );
    },

    async competitions(academyId) {
      const rows = check(
        (await sb
          .from('academy_competitions')
          .select('id, academy_id, squad_id, name, type, season, team_name, points_win, points_draw')
          .eq('academy_id', academyId)
          .order('created_at', { ascending: false })) as Result_<CompetitionRow[]>,
      );
      return rows.map(toCompetition);
    },

    async saveCompetition(academyId, input, id) {
      if (id) {
        const rows = check(
          (await sb.from('academy_competitions').update(competitionRow(input)).eq('id', id).select('id')) as Result_<
            { id: string }[]
          >,
        );
        changedOne(rows, "You can't change this competition.");
        return id;
      }
      const row = check(
        (await sb
          .from('academy_competitions')
          .insert({ academy_id: academyId, ...competitionRow(input) })
          .select('id')
          .single()) as Result_<{ id: string }>,
      );
      return row.id;
    },

    async deleteCompetition(id) {
      const rows = check((await sb.from('academy_competitions').delete().eq('id', id).select('id')) as Result_<{ id: string }[]>);
      changedOne(rows, "You can't delete this competition.");
    },

    async results(competitionId) {
      const rows = check(
        (await sb
          .from('academy_results')
          .select('id, competition_id, home, away, home_goals, away_goals, date, stage, stage_detail, created_at, updated_at')
          .eq('competition_id', competitionId)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })) as Result_<ResultRow[]>,
      );
      return rows.map(toResult);
    },

    async addResult(competitionId, input) {
      const row = check(
        (await sb
          .from('academy_results')
          .insert({ competition_id: competitionId, ...resultRow(input) })
          .select('id')
          .single()) as Result_<{ id: string }>,
      );
      return row.id;
    },

    async updateResult(id, input) {
      const rows = check(
        (await sb
          .from('academy_results')
          .update({ ...resultRow(input), updated_at: new Date().toISOString() })
          .eq('id', id)
          .select('id')) as Result_<{ id: string }[]>,
      );
      changedOne(rows, "You can't change this result.");
    },

    async deleteResult(id) {
      const rows = check((await sb.from('academy_results').delete().eq('id', id).select('id')) as Result_<{ id: string }[]>);
      changedOne(rows, "You can't delete this result.");
    },

    async playerRecords(playerIds) {
      const ids = [...new Set(playerIds)];
      if (ids.length === 0) return [];
      const PAGE = 1000;
      // Every row, a page at a time - PostgREST caps one answer at 1000.
      const all = async (table: string): Promise<{ player_id: string; data: unknown }[]> => {
        const out: { player_id: string; data: unknown }[] = [];
        for (let from = 0; ; from += PAGE) {
          const page = check(
            (await sb
              .from(table)
              .select('player_id, data')
              .in('player_id', ids)
              .is('deleted_at', null)
              .order('player_id')
              .order('id')
              .range(from, from + PAGE - 1)) as Result_<{ player_id: string; data: unknown }[]>,
          );
          out.push(...page);
          if (page.length < PAGE) return out;
        }
      };
      const [profiles, matches, competitions] = await Promise.all([
        sb.from('players').select('id, data').in('id', ids) as unknown as Promise<Result_<{ id: string; data: unknown }[]>>,
        all('matches'),
        all('competitions'),
      ]);
      const byPlayer = new Map<string, PlayerRecords>(
        check(profiles).map((p) => [p.id, { playerId: p.id, profile: profileFromServer(p.data), matches: [], competitions: [] }]),
      );
      // Records come only for players the rules opened; anything else is left out rather than shown empty.
      for (const row of matches) byPlayer.get(row.player_id)?.matches.push(fromServer('matches', row.data));
      for (const row of competitions) byPlayer.get(row.player_id)?.competitions.push(fromServer('competitions', row.data));
      return [...byPlayer.values()];
    },

    async selections(academyId) {
      const rows = check(
        (await sb
          .from('academy_selections')
          .select('id, squad_id, name, academy_player_ids, notes, updated_at')
          .eq('academy_id', academyId)
          .order('updated_at', { ascending: false })) as Result_<
          { id: string; squad_id: string | null; name: string; academy_player_ids: string[] | null; notes: string; updated_at: string }[]
        >,
      );
      return rows.map((r) => ({
        id: r.id,
        squadId: r.squad_id,
        name: r.name,
        playerIds: r.academy_player_ids ?? [],
        notes: r.notes ?? '',
        updatedAt: r.updated_at,
      }));
    },

    async saveSelection(academyId, input, id) {
      const row = {
        squad_id: input.squadId,
        name: input.name.trim(),
        academy_player_ids: input.playerIds,
        notes: input.notes.trim(),
        updated_at: new Date().toISOString(),
      };
      if (id) {
        const rows = check(
          (await sb.from('academy_selections').update(row).eq('id', id).select('id')) as Result_<{ id: string }[]>,
        );
        changedOne(rows, "You can't change this team pick.");
        return id;
      }
      const made = check(
        (await sb
          .from('academy_selections')
          .insert({ academy_id: academyId, created_by: userId, ...row })
          .select('id')
          .single()) as Result_<{ id: string }>,
      );
      return made.id;
    },

    async deleteSelection(id) {
      const rows = check((await sb.from('academy_selections').delete().eq('id', id).select('id')) as Result_<{ id: string }[]>);
      changedOne(rows, "You can't delete this team pick.");
    },

    async playerInvitesForMe() {
      const rows = check(
        (await sb.rpc('my_player_invites')) as Result_<
          { id: string; academy_id: string; academy_name: string; verification: Verification; town: string; invited_by: string }[]
        >,
      );
      return rows.map((r) => ({
        id: r.id,
        academyId: r.academy_id,
        academyName: r.academy_name,
        town: r.town ?? '',
        verification: r.verification,
        invitedBy: r.invited_by ?? '',
      }));
    },

    async answerPlayerInvite(inviteId, accept, consent) {
      check((await sb.rpc('answer_player_invite', { invite_id: inviteId, accept, consent })) as Result_<unknown>);
    },

    async joinByCode(code, consent) {
      return check((await sb.rpc('join_by_code', { code: cleanJoinCode(code), consent })) as Result_<string>);
    },

    async joinRequests() {
      const rows = check(
        (await sb.rpc('my_join_requests')) as Result_<
          { id: string; academy_id: string; academy_name: string; town: string; verification: Verification }[]
        >,
      );
      return rows.map((r) => ({
        id: r.id,
        academyId: r.academy_id,
        academyName: r.academy_name,
        town: r.town ?? '',
        verification: r.verification,
      }));
    },

    async memberships() {
      const rows = check(
        (await sb.rpc('my_academies')) as Result_<
          {
            link_id: string;
            academy_id: string;
            academy_name: string;
            verification: Verification;
            town: string;
            logo: string;
            squad_id: string | null;
            squad_name: string | null;
            mates: string[] | null;
          }[]
        >,
      );
      // One row per squad the player is in; one membership per academy.
      const byLink = new Map<string, Membership>();
      for (const r of rows) {
        let m = byLink.get(r.link_id);
        if (!m) {
          m = {
            linkId: r.link_id,
            academyId: r.academy_id,
            academyName: r.academy_name,
            verification: r.verification,
            town: r.town ?? '',
            logo: r.logo ?? '',
            squads: [],
          };
          byLink.set(r.link_id, m);
        }
        if (r.squad_id) m.squads.push({ id: r.squad_id, name: r.squad_name ?? '', mates: r.mates ?? [] });
      }
      return [...byLink.values()];
    },

    async leaveAcademy(linkId) {
      check((await sb.rpc('leave_academy', { link_id: linkId })) as Result_<unknown>);
    },
  };
  return api;
}
