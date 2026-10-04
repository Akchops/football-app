import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RESERVED_USERNAMES, USERNAME_PATTERN, can, canRemove, cleanUsername, describeAcademyError, rolesToGive,
  usernameProblem,
} from './academy';

describe('usernames', () => {
  it('are stored without the @, the spaces or the capitals', () => {
    expect(cleanUsername('  @Arjun_GK ')).toBe('arjun_gk');
    expect(cleanUsername('@@sam')).toBe('sam');
  });

  it('take 3 to 20 letters, numbers or _', () => {
    expect(usernameProblem('arjun_gk')).toBeNull();
    expect(usernameProblem('@Arjun_GK')).toBeNull();
    expect(usernameProblem('a1_')).toBeNull();
    expect(usernameProblem('ab')).toMatch(/3 to 20/);
    expect(usernameProblem('a'.repeat(21))).toMatch(/3 to 20/);
    expect(usernameProblem('no spaces')).toMatch(/3 to 20/);
    expect(usernameProblem('dash-ed')).toMatch(/3 to 20/);
    expect(usernameProblem('élan')).toMatch(/3 to 20/);
    expect(usernameProblem('')).toMatch(/3 to 20/);
  });

  it('keep a few names back', () => {
    expect(usernameProblem('Admin')).toMatch(/reserved/);
    expect(usernameProblem('matchday')).toMatch(/reserved/);
    expect(usernameProblem('admin1')).toBeNull();
  });

  it('follow the same rules as the server', () => {
    // username_problem() in schema.sql decides in the end; the app only says
    // so sooner. If either changes, this fails until both do.
    const sql = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
    const fn = sql.slice(sql.indexOf('function public.username_problem'), sql.indexOf('function public.username_available'));
    expect(fn).toContain(`!~ '${USERNAME_PATTERN.source}'`);
    const reserved = [...fn.slice(fn.indexOf(' in (')).matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(reserved).toEqual(RESERVED_USERNAMES);
  });
});

describe('roles', () => {
  it('give the office side to the owner, managers and the admin role', () => {
    expect(can('owner', 'edit-details')).toBe(true);
    expect(can('manager', 'edit-details')).toBe(true);
    expect(can('admin', 'edit-details')).toBe(true);
    expect(can('coach', 'edit-details')).toBe(false);
    expect(can('admin', 'invite-staff')).toBe(true);
    expect(can('coach', 'invite-staff')).toBe(false);
  });

  it('keep the big decisions for the owner', () => {
    for (const action of ['delete', 'hand-over', 'verify'] as const) {
      expect(can('owner', action)).toBe(true);
      expect(can('manager', action)).toBe(false);
      expect(can('admin', action)).toBe(false);
    }
    expect(can('manager', 'new-join-code')).toBe(true);
    expect(can('admin', 'new-join-code')).toBe(false);
    expect(can(null, 'edit-details')).toBe(false);
  });

  it('say which roles someone may hand out', () => {
    expect(rolesToGive('owner', null)).toEqual(['manager', 'coach', 'admin']);
    expect(rolesToGive('owner', 'coach')).toEqual(['manager', 'coach', 'admin']);
    expect(rolesToGive('owner', 'owner')).toEqual([]);
    expect(rolesToGive('manager', null)).toEqual(['coach', 'admin']);
    expect(rolesToGive('manager', 'admin')).toEqual(['coach', 'admin']);
    expect(rolesToGive('manager', 'manager')).toEqual([]);
    expect(rolesToGive('admin', 'coach')).toEqual(['coach', 'admin']);
    expect(rolesToGive('admin', 'manager')).toEqual([]);
    expect(rolesToGive('coach', null)).toEqual([]);
  });

  it('say who may take someone off the staff', () => {
    expect(canRemove('owner', 'manager', false)).toBe(true);
    expect(canRemove('manager', 'coach', false)).toBe(true);
    expect(canRemove('admin', 'coach', false)).toBe(true);
    expect(canRemove('admin', 'manager', false)).toBe(false);
    expect(canRemove('coach', 'coach', false)).toBe(false);
    // Anyone may leave - except the owner, who hands over first.
    expect(canRemove('coach', 'coach', true)).toBe(true);
    expect(canRemove('owner', 'owner', true)).toBe(false);
    expect(canRemove('manager', 'owner', false)).toBe(false);
  });
});

describe('describeAcademyError', () => {
  it('turns what the server says into something to show', () => {
    expect(describeAcademyError(new Error('That username is taken'))).toBe('That username is taken.');
    expect(describeAcademyError(new Error('Give the academy a name.'))).toBe('Give the academy a name.');
    expect(describeAcademyError(new Error('TypeError: Failed to fetch'))).toMatch(/no signal/i);
    expect(describeAcademyError(new Error('permission denied for table academies'))).toMatch(/permission/);
    expect(describeAcademyError(new Error('JWT expired'))).toMatch(/sign out and in again/i);
    expect(describeAcademyError('')).toMatch(/went wrong/);
  });
});
