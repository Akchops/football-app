import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile, Settings } from '../types';
import { SERVER_TABLE, TABLES, serverTime, type Outgoing, type Table } from './sync';
import type { Household, Invite, Person, PullResult, Remote, SentInvite, ServerRow } from './syncEngine';

/**
 * The server, through Supabase. Every call here runs as the signed-in person,
 * so the row-level security in supabase/schema.sql decides what each one can
 * see and change - this file never has to check it again.
 */

/** Rows per page when pulling; PostgREST caps a single response at 1000. */
const PAGE = 1000;
/** Rows per upsert, so a first upload of a long season is several small requests. */
const CHUNK = 200;

type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

function check<T>(result: Result<T>): T {
  if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
  return result.data as T;
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function supabaseRemote(sb: SupabaseClient, userId: string): Remote {
  return {
    async households(): Promise<Household[]> {
      const members = check(
        (await sb
          .from('household_members')
          .select('household_id, created_at, households(id, name)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })) as Result<
          { household_id: string; households: { id: string; name: string } | { id: string; name: string }[] | null }[]
        >,
      );
      if (members.length === 0) return [];

      const players = check(
        (await sb
          .from('players')
          .select('id, household_id, created_at')
          .in('household_id', members.map((m) => m.household_id))
          .order('created_at', { ascending: true })) as Result<{ id: string; household_id: string }[]>,
      );

      return members.flatMap((m) => {
        const player = players.find((p) => p.household_id === m.household_id);
        const household = Array.isArray(m.households) ? m.households[0] : m.households;
        // A household whose player row never got made is skipped rather than
        // half-used; the engine then carries on as if it were not there.
        if (!player || !household) return [];
        return [{ id: household.id, name: household.name, playerId: player.id }];
      });
    },

    async invitesForMe(): Promise<Invite[]> {
      const rows = check(
        (await sb.rpc('my_invites')) as Result<
          { id: string; household_id: string; household_name: string; invited_by_email: string | null }[]
        >,
      );
      return rows.map((r) => ({
        id: r.id,
        householdId: r.household_id,
        householdName: r.household_name,
        invitedBy: r.invited_by_email ?? '',
      }));
    },

    async acceptInvite(inviteId: string): Promise<void> {
      check((await sb.rpc('accept_invite', { invite_id: inviteId })) as Result<unknown>);
    },

    async createHousehold(name: string, profile: Profile, settings: Settings): Promise<Household> {
      const householdId = check((await sb.rpc('create_household', { name })) as Result<string>);
      const player = check(
        (await sb
          .from('players')
          .insert({ household_id: householdId, data: profile, updated_at: serverTime(profile.updatedAt) })
          .select('id')
          .single()) as Result<{ id: string }>,
      );
      check(
        (await sb
          .from('player_settings')
          .insert({ player_id: player.id, data: settings, updated_at: serverTime(settings.updatedAt) })) as Result<unknown>,
      );
      return { id: householdId, name, playerId: player.id };
    },

    async pull(playerId: string, since: string): Promise<PullResult> {
      const rows = {} as Record<Table, ServerRow[]>;
      for (const table of TABLES) {
        rows[table] = [];
        for (let from = 0; ; from += PAGE) {
          let query = sb
            .from(SERVER_TABLE[table])
            .select('id, data, synced_at')
            .eq('player_id', playerId)
            .order('synced_at', { ascending: true })
            .range(from, from + PAGE - 1);
          if (since) query = query.gt('synced_at', since);
          const page = check((await query) as Result<{ id: string; data: unknown; synced_at: string }[]>);
          rows[table].push(...page.map((r) => ({ id: r.id, data: r.data, syncedAt: r.synced_at })));
          if (page.length < PAGE) break;
        }
      }

      const player = check(
        (await sb.from('players').select('data').eq('id', playerId).maybeSingle()) as Result<{ data: unknown } | null>,
      );
      const settings = check(
        (await sb.from('player_settings').select('data').eq('player_id', playerId).maybeSingle()) as Result<{
          data: unknown;
        } | null>,
      );
      return { rows, profile: player?.data ?? null, settings: settings?.data ?? null };
    },

    async push(playerId: string, out: Outgoing): Promise<void> {
      for (const table of TABLES) {
        const records = out.rows[table] as { id: string; updatedAt: string; deletedAt: string | null }[];
        for (const batch of chunks(records, CHUNK)) {
          check(
            (await sb.from(SERVER_TABLE[table]).upsert(
              batch.map((record) => ({
                player_id: playerId,
                id: record.id,
                data: record,
                updated_at: serverTime(record.updatedAt),
                deleted_at: record.deletedAt ? serverTime(record.deletedAt) : null,
              })),
              { onConflict: 'player_id,id' },
            )) as Result<unknown>,
          );
        }
      }
      if (out.profile) {
        check(
          (await sb
            .from('players')
            .update({ data: out.profile, updated_at: serverTime(out.profile.updatedAt) })
            .eq('id', playerId)) as Result<unknown>,
        );
      }
      if (out.settings) {
        check(
          (await sb
            .from('player_settings')
            .upsert(
              { player_id: playerId, data: out.settings, updated_at: serverTime(out.settings.updatedAt) },
              { onConflict: 'player_id' },
            )) as Result<unknown>,
        );
      }
    },

    async people(householdId: string): Promise<Person[]> {
      const rows = check(
        (await sb.rpc('household_people', { hid: householdId })) as Result<
          { email: string; role: string; is_me: boolean }[]
        >,
      );
      return rows.map((r) => ({ email: r.email, role: r.role, isMe: r.is_me }));
    },

    async sentInvites(householdId: string): Promise<SentInvite[]> {
      const rows = check(
        (await sb
          .from('household_invites')
          .select('id, email')
          .eq('household_id', householdId)
          .order('created_at', { ascending: true })) as Result<{ id: string; email: string }[]>,
      );
      return rows.map((r) => ({ id: r.id, email: r.email }));
    },

    async invite(householdId: string, email: string): Promise<void> {
      const result = (await sb
        .from('household_invites')
        .insert({ household_id: householdId, email: email.trim().toLowerCase(), invited_by: userId })) as Result<unknown>;
      // Inviting someone twice is not a failure; they are invited.
      if (result.error?.code === '23505') return;
      check(result);
    },

    async cancelInvite(inviteId: string): Promise<void> {
      check((await sb.from('household_invites').delete().eq('id', inviteId)) as Result<unknown>);
    },
  };
}
