import { describe, expect, it } from 'vitest';
import { reducer } from '../store/AppStore';
import { emptyData, live } from '../store/storage';
import type { AppData, Match, TrainingSession } from '../types';
import { mergeRemote, TABLES, type Table } from './sync';
import { syncOnce, type Remote, type ServerRow, type SyncState } from './syncEngine';

/**
 * A server in memory, holding what Supabase would, with the same rule that
 * matters most: you only see and change a household you belong to. Its clock
 * is its own and only ever moves forward, like the real one.
 */
class MemoryServer {
  private tick = 0;
  households = new Map<string, { id: string; name: string }>();
  members: { householdId: string; userId: string; role: string; at: number }[] = [];
  invites: { id: string; householdId: string; email: string; invitedBy: string }[] = [];
  players = new Map<string, { householdId: string; data: unknown }>();
  settings = new Map<string, unknown>();
  rows = new Map<Table, Map<string, { playerId: string; data: unknown; syncedAt: string }>>();
  emails = new Map<string, string>();
  failNextPush = false;

  private stamp(): string {
    return new Date(Date.UTC(2026, 0, 1) + ++this.tick * 60_000).toISOString();
  }

  private newId(prefix: string): string {
    return `${prefix}-${++this.tick}`;
  }

  table(t: Table) {
    if (!this.rows.has(t)) this.rows.set(t, new Map());
    return this.rows.get(t)!;
  }

  count(t: Table): number {
    return this.table(t).size;
  }

  as(userId: string, email: string): Remote {
    this.emails.set(userId, email);
    const server = this;
    const isMember = (hid: string) => server.members.some((m) => m.householdId === hid && m.userId === userId);
    const ownsPlayer = (pid: string) => {
      const p = server.players.get(pid);
      return Boolean(p) && isMember(p!.householdId);
    };

    return {
      async households() {
        return server.members
          .filter((m) => m.userId === userId)
          .sort((a, b) => b.at - a.at)
          .map((m) => {
            const hh = server.households.get(m.householdId)!;
            const playerId = [...server.players.entries()].find(([, p]) => p.householdId === hh.id)?.[0] ?? '';
            return { id: hh.id, name: hh.name, playerId };
          });
      },
      async invitesForMe() {
        return server.invites
          .filter((i) => i.email === email.toLowerCase())
          .map((i) => ({
            id: i.id,
            householdId: i.householdId,
            householdName: server.households.get(i.householdId)!.name,
            invitedBy: server.emails.get(i.invitedBy) ?? '',
          }));
      },
      async acceptInvite(inviteId) {
        const invite = server.invites.find((i) => i.id === inviteId);
        if (!invite || invite.email !== email.toLowerCase()) throw new Error('this invite is for somebody else');
        server.members.push({ householdId: invite.householdId, userId, role: 'adult', at: ++server.tick });
        server.invites = server.invites.filter((i) => i !== invite);
      },
      async createHousehold(name, profile, settings) {
        const hid = server.newId('hh');
        server.households.set(hid, { id: hid, name });
        server.members.push({ householdId: hid, userId, role: 'owner', at: ++server.tick });
        const pid = server.newId('player');
        server.players.set(pid, { householdId: hid, data: structuredClone(profile) });
        server.settings.set(pid, structuredClone(settings));
        return { id: hid, name, playerId: pid };
      },
      async pull(playerId, since) {
        if (!ownsPlayer(playerId)) throw new Error('not your household');
        const rows = {} as Record<Table, ServerRow[]>;
        for (const t of TABLES) {
          rows[t] = [...server.table(t).values()]
            .filter((r) => r.playerId === playerId && (!since || r.syncedAt > since))
            .sort((a, b) => (a.syncedAt < b.syncedAt ? -1 : 1))
            .map((r) => ({ id: (r.data as { id: string }).id, data: structuredClone(r.data), syncedAt: r.syncedAt }));
        }
        return {
          rows,
          profile: structuredClone(server.players.get(playerId)!.data),
          settings: structuredClone(server.settings.get(playerId) ?? null),
        };
      },
      async push(playerId, out) {
        if (server.failNextPush) {
          server.failNextPush = false;
          throw new Error('Failed to fetch');
        }
        if (!ownsPlayer(playerId)) throw new Error('not your household');
        for (const t of TABLES) {
          for (const record of out.rows[t] as { id: string }[]) {
            server.table(t).set(`${playerId}:${record.id}`, { playerId, data: structuredClone(record), syncedAt: server.stamp() });
          }
        }
        if (out.profile) server.players.get(playerId)!.data = structuredClone(out.profile);
        if (out.settings) server.settings.set(playerId, structuredClone(out.settings));
      },
      async people(hid) {
        if (!isMember(hid)) return [];
        return server.members
          .filter((m) => m.householdId === hid)
          .map((m) => ({ email: server.emails.get(m.userId) ?? '', role: m.role, isMe: m.userId === userId }));
      },
      async sentInvites(hid) {
        if (!isMember(hid)) return [];
        return server.invites.filter((i) => i.householdId === hid).map((i) => ({ id: i.id, email: i.email }));
      },
      async invite(hid, to) {
        if (!isMember(hid)) throw new Error('not a member');
        server.invites.push({ id: server.newId('inv'), householdId: hid, email: to.toLowerCase(), invitedBy: userId });
      },
      async cancelInvite(id) {
        server.invites = server.invites.filter((i) => i.id !== id);
      },
    };
  }
}

/** A phone: its own data, edited through the app's real reducer, and its own sync state. */
class Phone {
  data: AppData;
  state: SyncState | null = null;
  backedUp: AppData | null = null;
  asked = 0;
  mayCreate = true;

  constructor(
    private server: MemoryServer,
    public userId: string,
    public email: string,
    data: AppData = emptyData(),
  ) {
    this.data = data;
  }

  get remote(): Remote {
    return this.server.as(this.userId, this.email);
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
      backup: (data) => {
        this.backedUp = data;
      },
      mayCreate: () => this.mayCreate,
    });
  }

  act(action: Parameters<typeof reducer>[1]) {
    this.data = reducer(this.data, action);
  }

  opponents(): string[] {
    return live(this.data.matches).map((m) => m.opponent).sort();
  }

  focuses(): string[] {
    return live(this.data.training).map((t) => t.focus).sort();
  }
}

let seq = 0;
function match(opponent: string, over: Partial<Match> = {}): Match {
  seq += 1;
  const at = new Date(Date.UTC(2026, 8, 1, 12, 0, seq)).toISOString();
  return {
    id: `match_${seq}`, competitionId: null, teamId: null, opponent, date: '2026-10-03', time: '10:30',
    venue: 'home', location: '', durationMinutes: 70, status: 'scheduled', result: null, notes: '',
    remindAfter: null, createdAt: at, updatedAt: at, deletedAt: null, ...over,
  };
}

function session(focus: string): TrainingSession {
  seq += 1;
  const at = new Date(Date.UTC(2026, 8, 1, 12, 0, seq)).toISOString();
  return {
    id: `train_${seq}`, teamId: null, type: 'keeper', date: '2026-09-30', time: '18:00', durationMinutes: 60,
    intensity: 3, focus, notes: '', createdAt: at, updatedAt: at, deletedAt: null,
  };
}

function seasonOnPhone(): AppData {
  const data = emptyData();
  data.profile = { ...data.profile, name: 'Arjun', onboardedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' };
  data.matches = [match('Riverside Rovers'), match('Hillcrest Athletic')];
  data.training = [session('Crosses')];
  return data;
}

/** The brother signs in first, with his season on his phone. Returns his phone. */
async function brotherSignedIn(server: MemoryServer) {
  const brother = new Phone(server, 'u-brother', 'arjun@example.com', seasonOnPhone());
  await brother.sync();
  return brother;
}

async function invite(from: Phone, email: string) {
  await from.remote.invite(from.state!.householdId, email);
}

describe('the first phone to sign in', () => {
  it('makes the household and uploads everything on it', async () => {
    const server = new MemoryServer();
    const brother = new Phone(server, 'u-brother', 'arjun@example.com', seasonOnPhone());
    const result = await brother.sync();

    expect(result.created).toBe(true);
    expect(result.household!.name).toBe("Arjun's family");
    expect(server.count('matches')).toBe(2);
    expect(server.count('training')).toBe(1);
    // The phone keeps everything it had.
    expect(brother.opponents()).toEqual(['Hillcrest Athletic', 'Riverside Rovers']);
  });

  it('sends nothing more once everything is up', async () => {
    const server = new MemoryServer();
    const brother = await brotherSignedIn(server);
    expect((await brother.sync()).pushed).toBe(0);
    expect((await brother.sync()).pushed).toBe(0);
  });
});

describe('another phone', () => {
  it('on the same account gets the whole season without being asked anything', async () => {
    const server = new MemoryServer();
    await brotherSignedIn(server);
    const tablet = new Phone(server, 'u-brother', 'arjun@example.com');
    const result = await tablet.sync();

    expect(result.created).toBe(false);
    expect(tablet.asked).toBe(0);
    expect(tablet.opponents()).toEqual(['Hillcrest Athletic', 'Riverside Rovers']);
    expect(tablet.focuses()).toEqual(['Crosses']);
    expect(tablet.data.profile.name).toBe('Arjun');
  });

  it('belonging to an invited parent joins the household and sees the season', async () => {
    const server = new MemoryServer();
    const brother = await brotherSignedIn(server);
    await invite(brother, 'Mum@Example.com');

    const mum = new Phone(server, 'u-mum', 'mum@example.com');
    const result = await mum.sync();

    expect(result.joined).toBe(true);
    expect(result.household!.id).toBe(brother.state!.householdId);
    expect(mum.opponents()).toEqual(['Hillcrest Athletic', 'Riverside Rovers']);
    expect(await mum.remote.sentInvites(result.household!.id)).toEqual([]);
  });

  it('belonging to someone who was not invited gets a household of its own', async () => {
    const server = new MemoryServer();
    await brotherSignedIn(server);
    const stranger = new Phone(server, 'u-stranger', 'someone@example.com');
    const result = await stranger.sync();

    expect(result.created).toBe(true);
    expect(stranger.opponents()).toEqual([]);
  });
});

describe('two phones in one household', () => {
  async function family() {
    const server = new MemoryServer();
    const brother = await brotherSignedIn(server);
    await invite(brother, 'mum@example.com');
    const mum = new Phone(server, 'u-mum', 'mum@example.com');
    await mum.sync();
    return { server, brother, mum };
  }

  it('each adding a session with no signal end up with both', async () => {
    const { brother, mum } = await family();
    brother.act({ type: 'training/add', session: session('Distribution') });
    mum.act({ type: 'training/add', session: session('Penalties') });

    await brother.sync();
    await mum.sync();
    await brother.sync();

    for (const phone of [brother, mum]) {
      expect(phone.focuses()).toEqual(['Crosses', 'Distribution', 'Penalties']);
    }
  });

  it('see a match deleted on one disappear from the other', async () => {
    const { brother, mum } = await family();
    const gone = brother.data.matches.find((m) => m.opponent === 'Riverside Rovers')!;
    brother.act({ type: 'match/delete', id: gone.id });

    await brother.sync();
    await mum.sync();

    expect(mum.opponents()).toEqual(['Hillcrest Athletic']);
    // And it stays gone after further syncs in both directions.
    await mum.sync();
    await brother.sync();
    expect(brother.opponents()).toEqual(['Hillcrest Athletic']);
  });

  it('editing the same match end up agreeing, the later edit winning', async () => {
    const { brother, mum } = await family();
    const id = brother.data.matches[0].id;
    brother.act({ type: 'match/update', id, patch: { notes: 'from brother' } });
    await new Promise((r) => setTimeout(r, 5));
    mum.act({ type: 'match/update', id, patch: { notes: 'from mum' } });

    await brother.sync();
    await mum.sync();
    await brother.sync();

    const notes = (p: Phone) => p.data.matches.find((m) => m.id === id)!.notes;
    expect(notes(brother)).toBe('from mum');
    expect(notes(mum)).toBe('from mum');
  });

  it('never miss a change from a phone whose clock is behind', async () => {
    // The reason pulls go by the server's clock: this match claims to have
    // been edited years ago, long before the brother's last pull.
    const { brother, mum } = await family();
    await brother.sync();
    mum.act({ type: 'match/add', match: match('Late Clock FC', { updatedAt: '2020-01-01T00:00:00.000Z', createdAt: '2020-01-01T00:00:00.000Z' }) });

    await mum.sync();
    await brother.sync();

    expect(brother.opponents()).toContain('Late Clock FC');
  });

  it('share profile changes', async () => {
    const { brother, mum } = await family();
    mum.act({ type: 'profile/update', patch: { ageGroup: 'U17' } });

    await mum.sync();
    await brother.sync();

    expect(brother.data.profile.ageGroup).toBe('U17');
    expect(brother.data.profile.name).toBe('Arjun');
  });
});

describe('a phone that already has matches, joining', () => {
  it('is asked once, and "keep both" keeps both', async () => {
    const server = new MemoryServer();
    const brother = await brotherSignedIn(server);
    await invite(brother, 'dad@example.com');

    const dadData = emptyData();
    dadData.matches = [match('Dad Sunday League')];
    const dad = new Phone(server, 'u-dad', 'dad@example.com', dadData);

    await dad.sync('merge');
    expect(dad.asked).toBe(1);
    expect(dad.opponents()).toEqual(['Dad Sunday League', 'Hillcrest Athletic', 'Riverside Rovers']);

    await brother.sync();
    expect(brother.opponents()).toContain('Dad Sunday League');

    await dad.sync('merge');
    expect(dad.asked).toBe(1);
  });

  it('"use the family\'s only" leaves only the family\'s - and keeps a copy of what it dropped', async () => {
    const server = new MemoryServer();
    const brother = await brotherSignedIn(server);
    await invite(brother, 'gran@example.com');

    const granData = emptyData();
    granData.matches = [match('Sample Match')];
    const gran = new Phone(server, 'u-gran', 'gran@example.com', granData);

    await gran.sync('replace');
    expect(gran.opponents()).toEqual(['Hillcrest Athletic', 'Riverside Rovers']);
    expect(gran.backedUp?.matches.map((m) => m.opponent)).toEqual(['Sample Match']);

    await brother.sync();
    expect(brother.opponents()).not.toContain('Sample Match');
  });

  it('is not asked when the household has nothing in it yet', async () => {
    const server = new MemoryServer();
    const brother = new Phone(server, 'u-brother', 'arjun@example.com'); // signs in with an empty phone
    await brother.sync();
    await invite(brother, 'dad@example.com');

    const dadData = emptyData();
    dadData.matches = [match('Dad Sunday League')];
    const dad = new Phone(server, 'u-dad', 'dad@example.com', dadData);
    await dad.sync();

    expect(dad.asked).toBe(0);
    await brother.sync();
    expect(brother.opponents()).toEqual(['Dad Sunday League']);
  });
});

describe('a phone that has only just been set up, joining', () => {
  function setUpPhone(): AppData {
    // What finishing the setup screens leaves: a profile and a team, no matches.
    const data = emptyData();
    data.profile = { ...data.profile, name: 'Typed by mum', dateOfBirth: '1980-01-01', onboardedAt: '2026-09-28T09:00:00.000Z', updatedAt: '2026-09-28T09:00:00.000Z' };
    data.teams = [{
      id: 'team_mum', name: 'Oakwood Rangers', ageGroup: 'U16', position: 'GK', color: '#38bdf8', notes: '',
      createdAt: '2026-09-28T09:00:00.000Z', updatedAt: '2026-09-28T09:00:00.000Z', deletedAt: null,
    }];
    return data;
  }

  it('keeps the household\'s player rather than the profile typed while setting up', async () => {
    const server = new MemoryServer();
    const brother = await brotherSignedIn(server);
    await invite(brother, 'mum@example.com');

    const mum = new Phone(server, 'u-mum', 'mum@example.com', setUpPhone());
    await mum.sync();

    expect(mum.data.profile.name).toBe('Arjun');
    // ...and does not send the typed one back over his.
    await brother.sync();
    expect(brother.data.profile.name).toBe('Arjun');
  });

  it('is not asked about setup leftovers, and does not duplicate the team', async () => {
    const server = new MemoryServer();
    const brother = await brotherSignedIn(server);
    await invite(brother, 'mum@example.com');

    const mum = new Phone(server, 'u-mum', 'mum@example.com', setUpPhone());
    await mum.sync();

    expect(mum.asked).toBe(0);
    expect(live(mum.data.teams)).toEqual([]);
    expect(mum.opponents()).toEqual(['Hillcrest Athletic', 'Riverside Rovers']);
    // Kept, in case the team mattered after all.
    expect(mum.backedUp?.teams.map((t) => t.name)).toEqual(['Oakwood Rangers']);
  });

  it('keeps its own profile when the household\'s was never set up', async () => {
    const server = new MemoryServer();
    const brother = new Phone(server, 'u-brother', 'arjun@example.com'); // empty, never set up
    await brother.sync();
    await invite(brother, 'dad@example.com');

    const dadData = setUpPhone();
    dadData.profile = { ...dadData.profile, name: 'Arjun' };
    dadData.matches = [match('Dad Sunday League')];
    const dad = new Phone(server, 'u-dad', 'dad@example.com', dadData);
    await dad.sync();

    expect(dad.data.profile.name).toBe('Arjun');
    await brother.sync();
    expect(brother.data.profile.name).toBe('Arjun');
    expect(brother.opponents()).toEqual(['Dad Sunday League']);
  });
});

describe('when things go wrong', () => {
  it('a change that failed to send goes next time', async () => {
    const server = new MemoryServer();
    const brother = await brotherSignedIn(server);
    brother.act({ type: 'match/add', match: match('Offline FC') });

    server.failNextPush = true;
    await expect(brother.sync()).rejects.toThrow('Failed to fetch');
    expect(server.count('matches')).toBe(2);

    await brother.sync();
    expect(server.count('matches')).toBe(3);
  });

  it('a phone signed into a different account starts over rather than mixing the two', async () => {
    const server = new MemoryServer();
    const brother = await brotherSignedIn(server);
    const household = brother.state!.householdId;

    const borrowed = new Phone(server, 'u-other', 'other@example.com');
    borrowed.state = brother.state; // what the phone remembers from the last person
    await borrowed.sync();

    expect(borrowed.state!.householdId).not.toBe(household);
    expect(borrowed.state!.userId).toBe('u-other');
  });

  it('someone removed from a household finds their own again, not the old one', async () => {
    const server = new MemoryServer();
    const brother = await brotherSignedIn(server);
    await invite(brother, 'mum@example.com');
    const mum = new Phone(server, 'u-mum', 'mum@example.com');
    await mum.sync();
    const household = mum.state!.householdId;

    server.members = server.members.filter((m) => m.userId !== 'u-mum');
    await mum.sync();

    expect(mum.state!.householdId).not.toBe(household);
  });
});

describe('signing in on the first setup screen', () => {
  it('waits for an invite rather than starting a household with nobody in it', async () => {
    const server = new MemoryServer();
    const mum = new Phone(server, 'u-mum', 'mum@example.com');
    mum.mayCreate = false;

    const early = await mum.sync();
    expect(early.household).toBeNull();
    expect(server.households.size).toBe(0);
    expect(mum.state).toBeNull();

    // The brother invites her; the next sync joins and brings his details.
    const brother = await brotherSignedIn(server);
    await invite(brother, 'mum@example.com');
    const result = await mum.sync();

    expect(result.joined).toBe(true);
    expect(result.household!.id).toBe(brother.state!.householdId);
    expect(mum.data.profile.name).toBe('Arjun');
    expect(mum.data.profile.onboardedAt).toBeTruthy();
    expect(mum.opponents()).toEqual(['Hillcrest Athletic', 'Riverside Rovers']);
  });

  it('starts a household once setting up is finished, named after the player', async () => {
    const server = new MemoryServer();
    const phone = new Phone(server, 'u-brother', 'arjun@example.com');
    phone.mayCreate = false;
    expect((await phone.sync()).household).toBeNull();

    phone.act({ type: 'profile/update', patch: { name: 'Arjun', onboardedAt: '2026-09-28T10:00:00.000Z' } });
    phone.mayCreate = true;
    const result = await phone.sync();

    expect(result.created).toBe(true);
    expect(result.household!.name).toBe("Arjun's family");
  });
});

describe('joining a second household', () => {
  it('moves every phone of that person to it', async () => {
    const server = new MemoryServer();
    const brother = await brotherSignedIn(server);

    // Mum signed in before anyone invited her, on her phone and her tablet,
    // and so has a household of her own.
    const phone = new Phone(server, 'u-mum', 'mum@example.com');
    await phone.sync();
    const tablet = new Phone(server, 'u-mum', 'mum@example.com');
    await tablet.sync();
    const own = phone.state!.householdId;
    expect(tablet.state!.householdId).toBe(own);

    // Then the invite comes, and she accepts it on her phone.
    await invite(brother, 'mum@example.com');
    const [waiting] = await phone.remote.invitesForMe();
    await phone.remote.acceptInvite(waiting.id);
    await phone.sync();
    await tablet.sync();

    for (const device of [phone, tablet]) {
      expect(device.state!.householdId).toBe(brother.state!.householdId);
      expect(device.opponents()).toEqual(['Hillcrest Athletic', 'Riverside Rovers']);
      expect(device.data.profile.name).toBe('Arjun');
      expect(device.asked).toBe(0);
    }

    // And they stay there.
    await tablet.sync();
    expect(tablet.state!.householdId).toBe(brother.state!.householdId);
  });
});
