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
  | 'verify';

const ALLOWED: Record<AcademyAction, StaffRole[]> = {
  'edit-details': ['owner', 'manager', 'admin'],
  'invite-staff': ['owner', 'manager', 'admin'],
  'new-join-code': ['owner', 'manager'],
  delete: ['owner'],
  'hand-over': ['owner'],
  verify: ['owner'],
};

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
  };
  return api;
}
