import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { reducer } from '../store/AppStore';
import { emptyData, live } from '../store/storage';
import type { AppData, Match, TrainingSession } from '../types';
import { supabaseRemote } from './remote';
import { mergeRemote } from './sync';
import { syncOnce, type Remote, type SyncState } from './syncEngine';

/**
 * The Supabase remote against a real API layer: PostgREST in front of Postgres
 * with supabase/schema.sql and its row-level security, reached through the
 * real supabase-js client. Only sign-in is faked (the code is always 123456).
 *
 * Skipped unless a local stand-in is running - see supabase/README.md:
 *   LOCAL_SUPABASE_URL=http://localhost:54321 LOCAL_SUPABASE_ANON_KEY=... npx vitest run remote.integration
 */
const URL = process.env.LOCAL_SUPABASE_URL ?? '';
const KEY = process.env.LOCAL_SUPABASE_ANON_KEY ?? '';

/** A different address every run, so runs never see each other's households. */
const RUN = Date.now().toString(36);
const email = (who: string) => `${who}.${RUN}@example.com`;

async function signIn(address: string): Promise<{ sb: SupabaseClient; userId: string }> {
  const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const sent = await sb.auth.signInWithOtp({ email: address });
  if (sent.error) throw sent.error;
  const { data, error } = await sb.auth.verifyOtp({ email: address, token: '123456', type: 'email' });
  if (error) throw error;
  return { sb, userId: data.user!.id };
}

class Phone {
  data: AppData;
  state: SyncState | null = null;
  asked = 0;

  constructor(
    public remote: Remote,
    public userId: string,
    data: AppData = emptyData(),
  ) {
    this.data = data;
  }

  sync(answer: 'merge' | 'replace' = 'merge') {
    return syncOnce({
      remote: this.remote,
      userId: this.userId,
      getLocal: () => this.data,
      applyRemote: (changes) => {
        this.data = mergeRemote(this.data, changes);
      },
      replaceLocal: (data) => {
        this.data = data;
      },
      loadState: () => this.state,
      saveState: (state) => {
        this.state = structuredClone(state);
      },
      askJoin: async () => {
        this.asked += 1;
        return answer;
      },
      backup: () => {},
    });
  }

  act(action: Parameters<typeof reducer>[1]) {
    this.data = reducer(this.data, action);
  }

  opponents() {
    return live(this.data.matches).map((m) => m.opponent).sort();
  }

  focuses() {
    return live(this.data.training).map((t) => t.focus).sort();
  }
}

let seq = 0;
function match(opponent: string): Match {
  seq += 1;
  const at = new Date(Date.UTC(2026, 8, 1, 12, 0, seq)).toISOString();
  return {
    id: `match_${RUN}_${seq}`, competitionId: null, teamId: null, opponent, date: '2026-10-03', time: '10:30',
    venue: 'home', location: '', durationMinutes: 70, status: 'scheduled', result: null, notes: '',
    remindAfter: null, stage: null, stageDetail: '', createdAt: at, updatedAt: at, deletedAt: null,
  };
}

function session(focus: string): TrainingSession {
  seq += 1;
  const at = new Date(Date.UTC(2026, 8, 1, 12, 0, seq)).toISOString();
  return {
    id: `train_${RUN}_${seq}`, teamId: null, type: 'keeper', date: '2026-09-30', time: '18:00',
    durationMinutes: 60, intensity: 3, focus, notes: '', createdAt: at, updatedAt: at, deletedAt: null,
  };
}

describe.skipIf(!URL)('the Supabase remote, against PostgREST and the real schema', () => {
  it('carries a whole family through signing in, inviting, joining and editing', async () => {
    // The brother signs in with his season on his phone.
    const b = await signIn(email('brother'));
    const season = emptyData();
    season.profile = { ...season.profile, name: 'Arjun', onboardedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' };
    season.matches = [match('Riverside Rovers'), match('Hillcrest Athletic')];
    season.training = [session('Crosses')];
    const brother = new Phone(supabaseRemote(b.sb, b.userId), b.userId, season);

    const first = await brother.sync();
    expect(first.created).toBe(true);
    expect(first.pushed).toBe(3);

    const onServer = await b.sb.from('matches').select('id, deleted_at').eq('player_id', first.household!.playerId);
    expect(onServer.error).toBeNull();
    expect(onServer.data).toHaveLength(2);

    // Nothing left to send.
    expect((await brother.sync()).pushed).toBe(0);

    // He invites mum; inviting twice is not an error.
    await brother.remote.invite(first.household!.id, email('mum'));
    await brother.remote.invite(first.household!.id, email('Mum').toUpperCase());
    expect((await brother.remote.sentInvites(first.household!.id)).map((i) => i.email)).toEqual([email('mum')]);

    // Mum signs in on an empty phone: she sees who invited her, and joins.
    const m = await signIn(email('mum'));
    const mumRemote = supabaseRemote(m.sb, m.userId);
    const invites = await mumRemote.invitesForMe();
    expect(invites).toHaveLength(1);
    expect(invites[0].householdName).toBe("Arjun's family");
    expect(invites[0].invitedBy).toBe(email('brother'));

    const mum = new Phone(mumRemote, m.userId);
    const joined = await mum.sync();
    expect(joined.joined).toBe(true);
    expect(joined.household!.id).toBe(first.household!.id);
    expect(mum.opponents()).toEqual(['Hillcrest Athletic', 'Riverside Rovers']);
    expect(mum.data.profile.name).toBe('Arjun');

    // Both of them, and each marked correctly.
    const people = await mumRemote.people(joined.household!.id);
    expect(people.map((p) => [p.email, p.role, p.isMe])).toEqual([
      [email('brother'), 'owner', false],
      [email('mum'), 'adult', true],
    ]);

    // With no signal: mum adds a session, the brother deletes a match,
    // changes his age group and enters another team's result for the table.
    // Then each syncs.
    mum.act({ type: 'training/add', session: session('Penalties') });
    const gone = brother.data.matches.find((x) => x.opponent === 'Riverside Rovers')!;
    brother.act({ type: 'match/delete', id: gone.id });
    brother.act({ type: 'profile/update', patch: { ageGroup: 'U17' } });
    const at = new Date().toISOString();
    brother.act({
      type: 'result/add',
      result: {
        id: `result_${RUN}`, competitionId: 'c1', home: 'Vale', away: 'Moor', homeGoals: 3, awayGoals: 1, date: '2026-09-26',
        stage: null, stageDetail: '', createdAt: at, updatedAt: at, deletedAt: null,
      },
    });

    await mum.sync();
    await brother.sync();
    await mum.sync();

    for (const phone of [brother, mum]) {
      expect(phone.focuses()).toEqual(['Crosses', 'Penalties']);
      expect(phone.opponents()).toEqual(['Hillcrest Athletic']);
      expect(phone.data.profile.ageGroup).toBe('U17');
      expect(phone.data.results.map((r) => `${r.home} ${r.homeGoals}-${r.awayGoals} ${r.away}`)).toEqual(['Vale 3-1 Moor']);
    }

    // The delete is on the server as a tombstone, not a missing row.
    const tomb = await b.sb.from('matches').select('deleted_at').eq('id', gone.id).single();
    expect(tomb.data?.deleted_at).not.toBeNull();

    // Someone outside the family sees none of it and can change none of it.
    const s = await signIn(email('stranger'));
    const strangerRemote = supabaseRemote(s.sb, s.userId);
    const peek = await strangerRemote.pull(first.household!.playerId, '');
    expect(peek.rows.matches).toEqual([]);
    expect(peek.rows.training).toEqual([]);
    expect(peek.profile).toBeNull();
    await expect(
      strangerRemote.push(first.household!.playerId, {
        rows: { matches: [match('Injected FC')], training: [], teams: [], competitions: [], results: [] },
      }),
    ).rejects.toThrow();
    expect(await strangerRemote.people(first.household!.id)).toEqual([]);
    expect(await strangerRemote.invitesForMe()).toEqual([]);

    // And the brother's view was not touched by the attempt.
    await brother.sync();
    expect(brother.opponents()).toEqual(['Hillcrest Athletic']);
  });

  it('asks a phone with its own matches once, and keeps both when told to', async () => {
    const b = await signIn(email('brother2'));
    const season = emptyData();
    season.matches = [match('Castle Vale FC')];
    const brother = new Phone(supabaseRemote(b.sb, b.userId), b.userId, season);
    const first = await brother.sync();
    await brother.remote.invite(first.household!.id, email('dad'));

    const d = await signIn(email('dad'));
    const dadData = emptyData();
    dadData.matches = [match('Dad Sunday League')];
    const dad = new Phone(supabaseRemote(d.sb, d.userId), d.userId, dadData);

    await dad.sync('merge');
    expect(dad.asked).toBe(1);
    expect(dad.opponents()).toEqual(['Castle Vale FC', 'Dad Sunday League']);

    await brother.sync();
    expect(brother.opponents()).toEqual(['Castle Vale FC', 'Dad Sunday League']);
  });
});
