import type { SupabaseClient } from '@supabase/supabase-js';

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
  | 'remove-players';

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

type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

function check<T>(result: Result<T>): T {
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

/** A row that is already there counts as added. */
function insertedOrThere(result: Result<unknown>): void {
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
        (await sb.from('profiles').select('username').eq('user_id', userId).maybeSingle()) as Result<{
          username: string;
        } | null>,
      );
      return row?.username ?? null;
    },

    async usernameAvailable(name) {
      return Boolean(check((await sb.rpc('username_available', { name: cleanUsername(name) })) as Result<boolean>));
    },

    async claimUsername(name) {
      return check((await sb.rpc('claim_username', { name: cleanUsername(name) })) as Result<string>);
    },

    async staffAcademies() {
      const rows = check(
        (await sb
          .from('academy_members')
          .select(`role, created_at, academies(${ACADEMY_COLUMNS})`)
          .eq('user_id', userId)
          .order('created_at', { ascending: true })) as Result<
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
        })) as Result<string>,
      );
      // The logo is the one thing too big to want in a function call's arguments.
      if (details.logo) await api.updateAcademy(id, { logo: details.logo });
      return id;
    },

    async updateAcademy(id, patch) {
      const rows = check(
        (await sb.from('academies').update(toRow(patch)).eq('id', id).select('id')) as Result<{ id: string }[]>,
      );
      changedOne(rows, "You can't change this academy's details.");
    },

    async deleteAcademy(id) {
      const rows = check((await sb.from('academies').delete().eq('id', id).select('id')) as Result<{ id: string }[]>);
      changedOne(rows, 'Only the owner can delete the academy.');
    },

    async newJoinCode(id) {
      return check((await sb.rpc('new_join_code', { aid: id })) as Result<string>);
    },

    async staffInvitesForMe() {
      const rows = check(
        (await sb.rpc('my_staff_invites')) as Result<
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
      check((await sb.rpc('answer_staff_invite', { invite_id: inviteId, accept })) as Result<unknown>);
    },

    async staff(academyId) {
      const rows = check(
        (await sb.rpc('academy_staff', { aid: academyId })) as Result<
          { user_id: string; username: string; role: StaffRole; is_me: boolean }[]
        >,
      );
      return rows.map((r) => ({ userId: r.user_id, username: r.username ?? '', role: r.role, isMe: r.is_me }));
    },

    async pendingStaff(academyId) {
      const rows = check(
        (await sb.rpc('pending_staff', { aid: academyId })) as Result<
          { id: string; username: string; role: StaffRole; invited_by: string }[]
        >,
      );
      return rows.map((r) => ({ id: r.id, username: r.username ?? '', role: r.role, invitedBy: r.invited_by ?? '' }));
    },

    async inviteStaff(academyId, username, role) {
      check((await sb.rpc('invite_staff', { aid: academyId, username: cleanUsername(username), role })) as Result<unknown>);
    },

    async cancelStaffInvite(inviteId) {
      const rows = check(
        (await sb.from('academy_staff_invites').delete().eq('id', inviteId).select('id')) as Result<{ id: string }[]>,
      );
      changedOne(rows, 'That invite has already been answered or cancelled.');
    },

    async setStaffRole(academyId, member, role) {
      check((await sb.rpc('set_staff_role', { aid: academyId, member, role })) as Result<unknown>);
    },

    async removeStaff(academyId, member) {
      check((await sb.rpc('remove_staff', { aid: academyId, member })) as Result<unknown>);
    },

    async transferOwnership(academyId, member) {
      check((await sb.rpc('transfer_ownership', { aid: academyId, member })) as Result<unknown>);
    },

    async squads(academyId) {
      const rows = check(
        (await sb
          .from('academy_squads')
          .select('id, name, age_group, created_at, squad_coaches(user_id), squad_players(academy_player_id)')
          .eq('academy_id', academyId)
          .order('created_at', { ascending: true })) as Result<
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
          .single()) as Result<{ id: string }>,
      );
      return row.id;
    },

    async updateSquad(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.name = patch.name.trim();
      if (patch.ageGroup !== undefined) row.age_group = patch.ageGroup;
      const rows = check((await sb.from('academy_squads').update(row).eq('id', id).select('id')) as Result<{ id: string }[]>);
      changedOne(rows, 'Only the owner or a manager can change a squad.');
    },

    async deleteSquad(id) {
      const rows = check((await sb.from('academy_squads').delete().eq('id', id).select('id')) as Result<{ id: string }[]>);
      changedOne(rows, 'Only the owner or a manager can delete a squad.');
    },

    async setSquadCoach(squadId, member, on) {
      if (on) {
        insertedOrThere((await sb.from('squad_coaches').insert({ squad_id: squadId, user_id: member })) as Result<unknown>);
      } else {
        check((await sb.from('squad_coaches').delete().eq('squad_id', squadId).eq('user_id', member)) as Result<unknown>);
      }
    },

    async setSquadMember(squadId, academyPlayerId, on) {
      if (on) {
        insertedOrThere(
          (await sb.from('squad_players').insert({ squad_id: squadId, academy_player_id: academyPlayerId })) as Result<unknown>,
        );
      } else {
        const rows = check(
          (await sb
            .from('squad_players')
            .delete()
            .eq('squad_id', squadId)
            .eq('academy_player_id', academyPlayerId)
            .select('squad_id')) as Result<{ squad_id: string }[]>,
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
          .order('display_name', { ascending: true })) as Result<
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
          .single()) as Result<{ id: string }>,
      );
      return row.id;
    },

    async updatePlayer(id, patch) {
      const rows = check(
        (await sb.from('academy_players').update(playerRow(patch)).eq('id', id).select('id')) as Result<{ id: string }[]>,
      );
      changedOne(rows, "You can't change this player's details.");
    },

    async removePlayer(id) {
      const rows = check((await sb.from('academy_players').delete().eq('id', id).select('id')) as Result<{ id: string }[]>);
      changedOne(rows, 'Only the owner or a manager can take a player off the books.');
    },

    async invitePlayer(academyId, username, options = {}) {
      return check(
        (await sb.rpc('invite_player', {
          aid: academyId,
          username: cleanUsername(username),
          roster_id: options.rosterId ?? null,
          squad: options.squadId ?? null,
        })) as Result<string>,
      );
    },

    async answerJoinRequest(requestId, accept, squadId) {
      check(
        (await sb.rpc('answer_join_request', { request_id: requestId, accept, squad: squadId ?? null })) as Result<unknown>,
      );
    },

    async playerInvitesForMe() {
      const rows = check(
        (await sb.rpc('my_player_invites')) as Result<
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
      check((await sb.rpc('answer_player_invite', { invite_id: inviteId, accept, consent })) as Result<unknown>);
    },

    async joinByCode(code, consent) {
      return check((await sb.rpc('join_by_code', { code: cleanJoinCode(code), consent })) as Result<string>);
    },

    async joinRequests() {
      const rows = check(
        (await sb.rpc('my_join_requests')) as Result<
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
        (await sb.rpc('my_academies')) as Result<
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
      check((await sb.rpc('leave_academy', { link_id: linkId })) as Result<unknown>);
    },
  };
  return api;
}
