import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { emptyData } from '../store/storage';
import { academyApi, type AcademyApi } from './academy';
import { supabaseRemote } from './remote';

/**
 * The academy calls against a real API layer: PostgREST in front of Postgres
 * with supabase/schema.sql, through the real supabase-js client, signed in as
 * several people at once. Skipped unless a local stand-in is running - see
 * supabase/README.md:
 *   LOCAL_SUPABASE_URL=http://localhost:54321 LOCAL_SUPABASE_ANON_KEY=... npx vitest run academy.integration
 */
const URL = process.env.LOCAL_SUPABASE_URL ?? '';
const KEY = process.env.LOCAL_SUPABASE_ANON_KEY ?? '';

/** Different names every run, so runs never trip over each other's usernames. */
const RUN = Date.now().toString(36);

async function person(who: string): Promise<{ api: AcademyApi; name: string; sb: SupabaseClient; userId: string }> {
  const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `${who}.${RUN}@example.com`;
  const sent = await sb.auth.signInWithOtp({ email });
  if (sent.error) throw sent.error;
  const { data, error } = await sb.auth.verifyOtp({ email, token: '123456', type: 'email' });
  if (error) throw error;
  const api = academyApi(sb, data.user!.id);
  return { api, name: `${who}_${RUN}`, sb, userId: data.user!.id };
}

/** A family on Matchday: a household with its player and one match, and a username to be found by. */
async function family(who: string, playerName: string) {
  const p = await person(who);
  const data = emptyData();
  data.profile = { ...data.profile, name: playerName, position: 'GK', ageGroup: 'U16' };
  const household = await supabaseRemote(p.sb, p.userId).createHousehold(`${playerName}'s family`, data.profile, data.settings);
  const at = new Date().toISOString();
  const match = await p.sb.from('matches').insert({ player_id: household.playerId, id: `m_${who}_${RUN}`, data: { opponent: 'Vale' }, updated_at: at });
  if (match.error) throw match.error;
  await p.api.claimUsername(p.name);
  return { ...p, playerId: household.playerId };
}

/** How many of a player's matches someone can read. */
async function visibleMatches(sb: SupabaseClient, playerId: string): Promise<number> {
  const { data, error } = await sb.from('matches').select('id').eq('player_id', playerId);
  if (error) throw error;
  return data.length;
}

/** A 1x1 PNG, standing in for a logo. */
const LOGO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe.skipIf(!URL)('academies, against PostgREST and the real schema', () => {
  it('takes an academy from nothing to a staff with roles, and hands it over', async () => {
    const owner = await person('own');
    const coach = await person('cch');
    const office = await person('ofc');
    const stranger = await person('str');

    // Usernames: none yet, then claimed - in any case - and taken from then on.
    expect(await owner.api.username()).toBeNull();
    expect(await owner.api.usernameAvailable(owner.name)).toBe(true);
    expect(await owner.api.claimUsername(`@${owner.name.toUpperCase()}`)).toBe(owner.name);
    expect(await owner.api.username()).toBe(owner.name);
    expect(await coach.api.usernameAvailable(owner.name)).toBe(false);
    await expect(coach.api.claimUsername(owner.name)).rejects.toThrow(/taken/);
    await expect(coach.api.claimUsername('admin')).rejects.toThrow(/reserved/);
    for (const p of [coach, office, stranger]) await p.api.claimUsername(p.name);

    // The owner makes the academy, logo and all.
    const id = await owner.api.createAcademy({
      name: '  Riverside Academy ', town: 'Leeds', country: 'UK', contactEmail: 'info@riverside.test',
      ageGroups: ['U14', 'U16'], logo: LOGO,
    });
    const [made] = await owner.api.staffAcademies();
    expect(made).toMatchObject({
      id, name: 'Riverside Academy', town: 'Leeds', role: 'owner', verification: 'unverified', ageGroups: ['U14', 'U16'], logo: LOGO,
    });
    expect(made.joinCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(await stranger.api.staffAcademies()).toEqual([]);

    // Staff are invited by username, and see who is asking before they say yes.
    await owner.api.inviteStaff(id, `@${coach.name}`, 'coach');
    await owner.api.inviteStaff(id, office.name, 'admin');
    await expect(owner.api.inviteStaff(id, 'nobody_by_this_name', 'coach')).rejects.toThrow(/no one has that username/i);
    expect((await owner.api.pendingStaff(id)).map((p) => [p.username, p.role, p.invitedBy])).toEqual([
      [coach.name, 'coach', owner.name],
      [office.name, 'admin', owner.name],
    ]);

    const [invite] = await coach.api.staffInvitesForMe();
    expect(invite).toMatchObject({ academyName: 'Riverside Academy', town: 'Leeds', role: 'coach', invitedBy: owner.name, verification: 'unverified' });
    await coach.api.answerStaffInvite(invite.id, true);
    await office.api.answerStaffInvite((await office.api.staffInvitesForMe())[0].id, true);
    expect(await owner.api.pendingStaff(id)).toEqual([]);
    expect((await coach.api.staffAcademies()).map((a) => [a.name, a.role])).toEqual([['Riverside Academy', 'coach']]);

    const staff = await coach.api.staff(id);
    expect(staff.map((s) => [s.username, s.role, s.isMe])).toEqual([
      [owner.name, 'owner', false],
      [coach.name, 'coach', true],
      [office.name, 'admin', false],
    ]);

    // The office admin keeps the details up to date; a coach cannot.
    await office.api.updateAcademy(id, { town: 'Leeds LS1', ageGroups: ['U12', 'U14', 'U16'] });
    await expect(coach.api.updateAcademy(id, { name: 'Coach FC' })).rejects.toThrow(/can't change/);
    expect((await owner.api.staffAcademies())[0]).toMatchObject({ town: 'Leeds LS1', name: 'Riverside Academy' });

    // An invite that is cancelled is gone for both sides.
    await office.api.inviteStaff(id, stranger.name, 'coach');
    const [waiting] = await owner.api.pendingStaff(id);
    await office.api.cancelStaffInvite(waiting.id);
    expect(await stranger.api.staffInvitesForMe()).toEqual([]);
    await expect(office.api.cancelStaffInvite(waiting.id)).rejects.toThrow(/already been answered or cancelled/);

    // Roles: the owner promotes the coach; the admin cannot touch a manager.
    const coachId = staff.find((s) => s.username === coach.name)!.userId;
    const officeId = staff.find((s) => s.username === office.name)!.userId;
    await owner.api.setStaffRole(id, coachId, 'manager');
    await expect(office.api.setStaffRole(id, coachId, 'coach')).rejects.toThrow(/cannot change that role/);
    await expect(office.api.setStaffRole(id, officeId, 'coach')).rejects.toThrow(/your own role/);

    // A manager makes a new join code; the admin cannot.
    const code = await coach.api.newJoinCode(id);
    expect(code).not.toBe(made.joinCode);
    expect((await owner.api.staffAcademies())[0].joinCode).toBe(code);
    await expect(office.api.newJoinCode(id)).rejects.toThrow(/only the owner or a manager/i);

    // The admin leaves; the owner hands over and becomes a manager.
    await office.api.removeStaff(id, officeId);
    expect(await office.api.staffAcademies()).toEqual([]);
    await expect(owner.api.removeStaff(id, (await owner.api.staff(id)).find((s) => s.isMe)!.userId)).rejects.toThrow(/hands over/);
    await owner.api.transferOwnership(id, coachId);
    expect((await owner.api.staffAcademies())[0].role).toBe('manager');
    await expect(owner.api.deleteAcademy(id)).rejects.toThrow(/only the owner/i);

    // The new owner can delete it, and it is gone for everyone.
    await coach.api.deleteAcademy(id);
    expect(await coach.api.staffAcademies()).toEqual([]);
    expect(await owner.api.staffAcademies()).toEqual([]);
  });

  it('links players with their family\'s yes, keeps coaches to their squads, and lets families leave', async () => {
    const owner = await person('own2');
    const coach = await person('cch2');
    await owner.api.claimUsername(owner.name);
    await coach.api.claimUsername(coach.name);
    const id = await owner.api.createAcademy({ name: 'Vale Academy', town: 'York', country: '', contactEmail: '', ageGroups: [], logo: '' });
    await owner.api.inviteStaff(id, coach.name, 'coach');
    await coach.api.answerStaffInvite((await coach.api.staffInvitesForMe())[0].id, true);

    // Two squads; the coach takes the elite one.
    const elite = await owner.api.createSquad(id, 'U16 Elite', 'U16');
    const dev = await owner.api.createSquad(id, 'U14 Development', 'U14');
    await owner.api.setSquadCoach(elite, coach.userId, true);
    await owner.api.setSquadCoach(elite, coach.userId, true); // twice is not an error
    expect((await coach.api.squads(id)).map((s) => [s.name, s.coachIds])).toEqual([
      ['U16 Elite', [coach.userId]],
      ['U14 Development', []],
    ]);

    // Arjun's family is invited, by the username of anyone in it, straight into the elite squad.
    const arjun = await family('par2', 'Arjun');
    await expect(coach.api.invitePlayer(id, arjun.name, { squadId: dev })).rejects.toThrow(/squads you coach/);
    const link = await coach.api.invitePlayer(id, `@${arjun.name}`, { squadId: elite });
    expect(await visibleMatches(coach.sb, arjun.playerId)).toBe(0);

    const [invite] = await arjun.api.playerInvitesForMe();
    expect(invite).toMatchObject({ id: link, academyName: 'Vale Academy', town: 'York', invitedBy: coach.name, verification: 'unverified' });
    await expect(arjun.api.answerPlayerInvite(link, true, false)).rejects.toThrow(/agree to share/i);
    await arjun.api.answerPlayerInvite(link, true, true);
    expect(await visibleMatches(coach.sb, arjun.playerId)).toBe(1);

    // Sam's family asks with the code, typed any old way; only someone who can add to that squad says yes.
    const sam = await family('sam2', 'Sam');
    const code = (await owner.api.staffAcademies()).find((a) => a.id === id)!.joinCode;
    await expect(sam.api.joinByCode(code, false)).rejects.toThrow(/agree to share/i);
    const request = await sam.api.joinByCode(` ${code.slice(0, 3).toLowerCase()} ${code.slice(3)}`, true);
    expect((await sam.api.joinRequests()).map((r) => r.academyName)).toEqual(['Vale Academy']);
    await expect(coach.api.answerJoinRequest(request, true, dev)).rejects.toThrow(/squads you coach/);
    await owner.api.answerJoinRequest(request, true, dev);
    expect(await sam.api.joinRequests()).toEqual([]);
    expect(await visibleMatches(coach.sb, sam.playerId)).toBe(0); // not the coach's squad
    expect(await visibleMatches(owner.sb, sam.playerId)).toBe(1);

    // A name with no app, into the coach's own squad; never a linked player from another squad.
    const nathan = await coach.api.addRosterPlayer(id, { name: ' Nathan ', position: 'CM', ageGroup: 'U16' });
    await coach.api.setSquadMember(elite, nathan, true);
    await expect(coach.api.setSquadMember(elite, request, true)).rejects.toThrow();
    await expect(coach.api.setSquadMember(dev, request, false)).rejects.toThrow(/squad's coach/);

    const players = await coach.api.players(id);
    expect(players.map((p) => [p.name, p.status, p.playerId !== null])).toEqual([
      ['Arjun', 'linked', true],
      ['Nathan', 'roster', false],
      ['Sam', 'linked', true],
    ]);
    const squads = await coach.api.squads(id);
    expect(squads.find((s) => s.id === elite)!.memberIds.sort()).toEqual([link, nathan].sort());

    // What Arjun's family sees: the academy, his squad and his squad mates' names.
    expect(await arjun.api.memberships()).toEqual([
      {
        linkId: link, academyId: id, academyName: 'Vale Academy', verification: 'unverified', town: 'York', logo: '',
        squads: [{ id: elite, name: 'U16 Elite', mates: ['Nathan'] }],
      },
    ]);

    // Only the owner and managers take someone off the books.
    await expect(coach.api.removePlayer(nathan)).rejects.toThrow(/only the owner or a manager/i);
    await owner.api.removePlayer(nathan);

    // Arjun's family leaves: the academy keeps his name, marked as left, and sees nothing.
    await arjun.api.leaveAcademy(link);
    expect(await visibleMatches(coach.sb, arjun.playerId)).toBe(0);
    expect(await visibleMatches(owner.sb, arjun.playerId)).toBe(0);
    expect(await arjun.api.memberships()).toEqual([]);
    const after = await owner.api.players(id);
    expect(after.find((p) => p.id === link)).toMatchObject({ status: 'left', playerId: null });
    expect((await owner.api.squads(id)).find((s) => s.id === elite)!.memberIds).toEqual([]);

    await owner.api.deleteAcademy(id);
  });

  it('keeps tables and team picks for the academy, and opens players\' records only as far as each role allows', async () => {
    const owner = await person('own3');
    const coach = await person('cch3');
    await owner.api.claimUsername(owner.name);
    await coach.api.claimUsername(coach.name);
    const id = await owner.api.createAcademy({ name: 'Moor Academy', town: '', country: '', contactEmail: '', ageGroups: [], logo: '' });
    await owner.api.inviteStaff(id, coach.name, 'coach');
    await coach.api.answerStaffInvite((await coach.api.staffInvitesForMe())[0].id, true);
    const elite = await owner.api.createSquad(id, 'Elite', 'U16');
    const dev = await owner.api.createSquad(id, 'Development', 'U14');
    await owner.api.setSquadCoach(elite, coach.userId, true);

    // Two families, linked into different squads, each with a league and a game in it.
    const linkInto = async (who: string, name: string, squad: string) => {
      const fam = await family(who, name);
      const at = new Date().toISOString();
      const league = { id: `c_${who}_${RUN}`, name: 'Yorkshire U16 League', type: 'league', updatedAt: at, deletedAt: null };
      const add = await fam.sb.from('competitions').insert({ player_id: fam.playerId, id: league.id, data: league, updated_at: at });
      if (add.error) throw add.error;
      const link = await owner.api.invitePlayer(id, fam.name, { squadId: squad });
      await fam.api.answerPlayerInvite(link, true, true);
      return { ...fam, link };
    };
    const kai = await linkInto('kai3', 'Kai', elite);
    const ben = await linkInto('ben3', 'Ben', dev);

    // The owner reads both players' records; the coach only the one in their squad.
    const all = await owner.api.playerRecords([kai.playerId, ben.playerId]);
    expect(all.map((r) => [r.profile?.name, r.matches.length, r.competitions.map((c) => c.name)]).sort()).toEqual([
      ['Ben', 1, ['Yorkshire U16 League']],
      ['Kai', 1, ['Yorkshire U16 League']],
    ]);
    const mine = await coach.api.playerRecords([kai.playerId, ben.playerId]);
    expect(mine.map((r) => r.profile?.name)).toEqual(['Kai']);
    expect(await owner.api.playerRecords([])).toEqual([]);

    // The coach keeps the academy's own table.
    const comp = await coach.api.saveCompetition(id, {
      squadId: elite, name: 'Yorkshire U16 League', type: 'league', season: '2026/27', teamName: 'Moor', pointsWin: 3, pointsDraw: 1,
    });
    const first = await coach.api.addResult(comp, { home: 'Moor', away: 'Vale', homeGoals: 2, awayGoals: 1, date: '2026-09-06', stage: null, stageDetail: '' });
    await coach.api.addResult(comp, { home: 'Castle', away: 'Moor', homeGoals: null, awayGoals: 3, date: '2026-09-13', stage: null, stageDetail: 'ignored' });
    await coach.api.updateResult(first, { home: 'Moor', away: 'Vale', homeGoals: 3, awayGoals: 1, date: '2026-09-06', stage: null, stageDetail: '' });
    const games = await coach.api.results(comp);
    expect(games.map((g) => `${g.home} ${g.homeGoals ?? '-'}-${g.awayGoals ?? '-'} ${g.away}`)).toEqual(['Castle --- Moor', 'Moor 3-1 Vale']);
    expect((await coach.api.competitions(id)).map((c) => [c.name, c.teamName, c.squadId])).toEqual([['Yorkshire U16 League', 'Moor', elite]]);

    // A linked family reads the academy's tables; it cannot change them.
    expect((await kai.api.competitions(id)).map((c) => c.name)).toEqual(['Yorkshire U16 League']);
    expect(await kai.api.results(comp)).toHaveLength(2);
    await expect(kai.api.addResult(comp, { home: 'A', away: 'B', homeGoals: 1, awayGoals: 0, date: '', stage: null, stageDetail: '' })).rejects.toThrow();
    await expect(kai.api.deleteResult(first)).rejects.toThrow(/can't delete/);

    // Team picks keep their order, and change.
    const pick = await coach.api.saveSelection(id, { name: 'Dubai Cup 2027', squadId: elite, playerIds: [kai.link, ben.link], notes: ' Meet 8am ' });
    expect((await owner.api.selections(id)).map((s) => [s.name, s.playerIds, s.notes])).toEqual([['Dubai Cup 2027', [kai.link, ben.link], 'Meet 8am']]);
    await owner.api.saveSelection(id, { name: 'Dubai Cup 2027', squadId: elite, playerIds: [ben.link], notes: '' }, pick);
    expect((await coach.api.selections(id))[0].playerIds).toEqual([ben.link]);
    await expect(kai.api.deleteSelection(pick)).rejects.toThrow(/can't delete/);
    await coach.api.deleteSelection(pick);
    expect(await owner.api.selections(id)).toEqual([]);

    await coach.api.deleteCompetition(comp);
    expect(await owner.api.competitions(id)).toEqual([]);
    await owner.api.deleteAcademy(id);
  });
});
