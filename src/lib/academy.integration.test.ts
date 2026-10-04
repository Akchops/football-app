import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { academyApi, type AcademyApi } from './academy';

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

async function person(who: string): Promise<{ api: AcademyApi; name: string }> {
  const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `${who}.${RUN}@example.com`;
  const sent = await sb.auth.signInWithOtp({ email });
  if (sent.error) throw sent.error;
  const { data, error } = await sb.auth.verifyOtp({ email, token: '123456', type: 'email' });
  if (error) throw error;
  const api = academyApi(sb, data.user!.id);
  return { api, name: `${who}_${RUN}` };
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
});
