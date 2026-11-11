import { describe, expect, it } from 'vitest';
import { assess, cleanNotice, countdown, type Readings } from './status';

const all: Readings = { drill: false, online: true, accounts: true, worker: true };

describe('assess', () => {
  it('is fine when the account server answers', () => {
    expect(assess(all)).toBe('ok');
  });

  it('is fine before anything has been checked, and in a build with no account server', () => {
    expect(assess({ ...all, accounts: null })).toBe('ok');
    expect(assess({ ...all, accounts: null, worker: null })).toBe('ok');
  });

  it('is an outage when the phone has signal and the worker answers, but the account server does not', () => {
    expect(assess({ ...all, accounts: false })).toBe('outage');
  });

  it('is an outage when there is no worker to compare with and the phone says it is online', () => {
    expect(assess({ ...all, accounts: false, worker: null })).toBe('outage');
  });

  it('is only no signal when nothing answers - not worth a banner', () => {
    expect(assess({ ...all, accounts: false, worker: false })).toBe('offline');
  });

  it('is no signal when the phone says so, whatever else', () => {
    expect(assess({ ...all, online: false, accounts: false })).toBe('offline');
  });

  it('is an outage during the drill, even with everything answering', () => {
    expect(assess({ ...all, drill: true })).toBe('outage');
    expect(assess({ ...all, drill: true, online: false })).toBe('outage');
  });
});

describe('cleanNotice', () => {
  it('keeps a message', () => {
    expect(cleanNotice({ title: 'Syncing is down', message: 'Back by 3pm.', postedAt: '2026-11-11T12:00:00.000Z' })).toEqual({
      title: 'Syncing is down',
      message: 'Back by 3pm.',
      postedAt: '2026-11-11T12:00:00.000Z',
    });
  });

  it('is nothing for no message, or for something that is not one', () => {
    expect(cleanNotice(null)).toBeNull();
    expect(cleanNotice('Back by 3pm')).toBeNull();
    expect(cleanNotice({ title: ' ', message: '' })).toBeNull();
    expect(cleanNotice({ message: 42 })).toBeNull();
  });

  it('never shows more than it should', () => {
    const notice = cleanNotice({ title: 't'.repeat(200), message: 'm'.repeat(2000), postedAt: 'soon' });
    expect(notice?.title).toHaveLength(80);
    expect(notice?.message).toHaveLength(600);
    expect(notice?.postedAt).toBe('');
  });
});

describe('countdown', () => {
  it('counts down in minutes and seconds, rounding up', () => {
    expect(countdown(30_000)).toBe('0:30');
    expect(countdown(22_100)).toBe('0:23');
    expect(countdown(61_000)).toBe('1:01');
  });

  it('never goes below zero', () => {
    expect(countdown(-5_000)).toBe('0:00');
  });
});
