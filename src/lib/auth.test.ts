import { describe, expect, it } from 'vitest';
import { describeAuthError } from './auth';

/** The messages Supabase Auth actually sends back, and what the app says instead. */
describe('describeAuthError', () => {
  it('explains an address the project cannot email yet', () => {
    expect(describeAuthError('Email address not authorized')).toMatch(/can't email that address yet/);
  });

  it('does not mistake sign-ups being off for a wrong code', () => {
    const said = describeAuthError('Signups not allowed for otp');
    expect(said).toMatch(/switched off/);
    expect(said).not.toMatch(/code did not work/);
  });

  it('says a wrong or old code did not work', () => {
    expect(describeAuthError('Token has expired or is invalid')).toMatch(/code did not work/);
  });

  it('asks to wait when codes are asked for too often', () => {
    expect(describeAuthError('email rate limit exceeded')).toMatch(/Wait a minute/);
    expect(describeAuthError('For security purposes, you can only request this after 45 seconds.')).toMatch(/Wait a minute/);
  });

  it('blames the connection, not the person, when offline', () => {
    expect(describeAuthError('Failed to fetch')).toMatch(/still saved on this phone/);
  });

  it('spots something that is not an email address', () => {
    expect(describeAuthError('Unable to validate email address: invalid format')).toMatch(/not look like an email/);
  });

  it('passes anything else through as it came', () => {
    expect(describeAuthError('Something new went wrong')).toBe('Something new went wrong');
  });
});
