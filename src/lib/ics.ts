import type { Competition, Match, Team, TrainingSession } from '../types';
import { TRAINING_TYPE_LABEL } from '../types';
import { kickoffAt, pad } from './date';

function stamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Escape the characters iCalendar treats specially. */
function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function event(opts: {
  uid: string;
  start: Date;
  durationMinutes: number;
  title: string;
  description: string;
  location: string;
  reminderLeadMinutes: number;
}): string[] {
  const end = new Date(opts.start.getTime() + opts.durationMinutes * 60000);
  return [
    'BEGIN:VEVENT',
    `UID:${opts.uid}@matchday.app`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(opts.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(opts.title)}`,
    opts.description ? `DESCRIPTION:${esc(opts.description)}` : '',
    opts.location ? `LOCATION:${esc(opts.location)}` : '',
    'BEGIN:VALARM',
    `TRIGGER:-PT${Math.max(0, Math.round(opts.reminderLeadMinutes))}M`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(opts.title)}`,
    'END:VALARM',
    'END:VEVENT',
  ].filter(Boolean);
}

function wrap(lines: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Matchday//EN', 'CALSCALE:GREGORIAN', ...lines, 'END:VCALENDAR'].join(
    '\r\n',
  );
}

export function matchToICS(
  match: Match,
  team: Team | null,
  competition: Competition | null,
  reminderLeadMinutes: number,
): string {
  const title = `${team ? `${team.name} ` : ''}${match.venue === 'away' ? 'away at' : 'vs'} ${match.opponent || 'TBC'}`;
  return wrap(
    event({
      uid: match.id,
      start: kickoffAt(match.date, match.time),
      durationMinutes: match.durationMinutes,
      title,
      description: [competition?.name, match.notes].filter(Boolean).join(' — '),
      location: match.location,
      reminderLeadMinutes,
    }),
  );
}

export function trainingToICS(session: TrainingSession, team: Team | null, reminderLeadMinutes: number): string {
  return wrap(
    event({
      uid: session.id,
      start: kickoffAt(session.date, session.time),
      durationMinutes: session.durationMinutes,
      title: `${TRAINING_TYPE_LABEL[session.type]}${team ? ` · ${team.name}` : ''}`,
      description: [session.focus, session.notes].filter(Boolean).join(' — '),
      location: '',
      reminderLeadMinutes,
    }),
  );
}

/** Hand the .ics to the phone, which opens it in its own calendar app. */
export function downloadICS(ics: string, filename: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
