import { describe, expect, it } from 'vitest';
import { emptyResult, type Match, type Team } from '../types';
import { matchToICS } from './ics';

const team: Team = {
  id: 't1', name: 'Wanderers FC', ageGroup: 'U16', position: 'GK',
  color: '#38bdf8', notes: '', createdAt: '',
};

const match: Match = {
  id: 'm1', competitionId: null, teamId: 't1', opponent: 'Riverside FC',
  date: '2026-04-12', time: '16:30', venue: 'away', location: 'Central Fields, Pitch 3',
  durationMinutes: 80, status: 'scheduled', result: null, notes: 'Meet at 3pm',
  remindAfter: null, createdAt: '', updatedAt: '',
};

describe('matchToICS', () => {
  const ics = matchToICS(match, team, null, 120);

  it('produces a single well-formed calendar event', () => {
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('UID:m1@matchday.app');
  });

  it('titles it with the team and whether it is home or away', () => {
    expect(ics).toContain('SUMMARY:Wanderers FC away at Riverside FC');
  });

  it('sets an alarm at the configured lead time', () => {
    expect(ics).toContain('TRIGGER:-PT120M');
    expect(matchToICS(match, team, null, 1440)).toContain('TRIGGER:-PT1440M');
  });

  it('ends the event after the real match length', () => {
    const start = ics.match(/DTSTART:(\d{8}T\d{6}Z)/)?.[1];
    const end = ics.match(/DTEND:(\d{8}T\d{6}Z)/)?.[1];
    expect(start).toBeTruthy();
    expect(end).toBeTruthy();
    const toDate = (v: string) =>
      Date.parse(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(9, 11)}:${v.slice(11, 13)}:00Z`);
    expect((toDate(end as string) - toDate(start as string)) / 60000).toBe(80);
  });

  it('escapes commas in the location so the file stays valid', () => {
    expect(ics).toContain('LOCATION:Central Fields\\, Pitch 3');
  });

  it('works for a played match too', () => {
    const done = { ...match, status: 'played' as const, result: emptyResult('GK') };
    expect(matchToICS(done, team, null, 60)).toContain('BEGIN:VEVENT');
  });
});
