import type { Competition, Match } from '../types';
import { formatTime, fromISODate, kickoffAt } from './date';

/** Which reminders this phone wants. Kept per phone: each one that should buzz turns them on itself. */
export interface ReminderPrefs {
  /** "Tomorrow: vs Oakfield", the evening before. */
  dayBefore: boolean;
  /** "How did it go?", once the day's last match is over. */
  results: boolean;
}

/** One notification, worked out here and sent to the server to deliver at `at`. */
export interface PlannedReminder {
  at: number;
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** The evening before: late enough that the week's plans are made, early enough to find the kit. */
export const EVENING_HOUR = 18;
/** After full time, a little longer - the drive home, the post-match chat. */
const AFTER_FULL_TIME_MIN = 30;
/** Only the next month or so: the list is resent whenever the fixtures change. */
const HORIZON_DAYS = 31;
const MAX = 40;

const versus = (m: Match) => `${m.venue === 'away' ? '@' : 'vs'} ${m.opponent.trim() || 'TBC'}`;

/** "Meet 9:45 AM", when a pasted message put one in the notes. */
function meetLine(m: Match): string | null {
  return /^Meet \d{1,2}:\d{2} [AP]M$/m.exec(m.notes)?.[0] ?? null;
}

function dayBefore(games: Match[], competitions: Competition[]): Pick<PlannedReminder, 'title' | 'body'> {
  const [first] = games;
  const ground = first.location.trim();
  if (games.length === 1) {
    return {
      title: `Tomorrow: ${versus(first)}`,
      body: [meetLine(first), `Kick-off ${formatTime(first.time)}`, ground].filter(Boolean).join(' · '),
    };
  }
  // A tournament day reads as the tournament; two separate games, as the games.
  const ids = new Set(games.map((g) => g.competitionId));
  const competition = ids.size === 1 ? competitions.find((c) => c.id === first.competitionId) : undefined;
  if (competition) {
    return {
      title: `Tomorrow: ${competition.name}`,
      body: [`${games.length} matches, first at ${formatTime(first.time)}`, ground].filter(Boolean).join(' · '),
    };
  }
  return {
    title: `Tomorrow: ${games.length} matches`,
    body: games.map((g) => `${versus(g)} ${formatTime(g.time)}`).join(', '),
  };
}

function afterwards(games: Match[], competitions: Competition[]): Pick<PlannedReminder, 'title' | 'body'> {
  if (games.length === 1) return { title: `How did it go ${versus(games[0])}?`, body: 'Log the result while it’s fresh.' };
  const ids = new Set(games.map((g) => g.competitionId));
  const competition = ids.size === 1 ? competitions.find((c) => c.id === games[0].competitionId) : undefined;
  return {
    title: competition ? `How did ${competition.name} go?` : 'How did today go?',
    body: `Log your ${games.length} results while they’re fresh.`,
  };
}

/**
 * Every reminder still to come for the fixtures on the calendar: one the
 * evening before each match day, and one after its last game. A day's games
 * share their reminders, so a tournament is one buzz, not five.
 */
export function reminderSchedule(
  matches: Match[],
  competitions: Competition[],
  prefs: ReminderPrefs,
  now: Date,
): PlannedReminder[] {
  if (!prefs.dayBefore && !prefs.results) return [];
  const until = now.getTime() + HORIZON_DAYS * 86_400_000;
  const byDay = new Map<string, Match[]>();
  for (const m of matches) {
    if (m.status !== 'scheduled') continue;
    const kickoff = kickoffAt(m.date, m.time).getTime();
    // A game from this morning still has its "how did it go" to come; next season's can wait.
    if (kickoff > until || kickoff + 12 * 3_600_000 < now.getTime()) continue;
    byDay.set(m.date, [...(byDay.get(m.date) ?? []), m]);
  }

  const out: PlannedReminder[] = [];
  for (const [date, games] of byDay) {
    games.sort((a, b) => a.time.localeCompare(b.time));
    if (prefs.dayBefore) {
      const day = fromISODate(date);
      const evening = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, EVENING_HOUR, 0).getTime();
      if (evening > now.getTime()) out.push({ at: evening, ...dayBefore(games, competitions), url: './', tag: `day-${date}` });
    }
    if (prefs.results) {
      const last = games[games.length - 1];
      const over = kickoffAt(last.date, last.time).getTime() + (last.durationMinutes + AFTER_FULL_TIME_MIN) * 60_000;
      if (over > now.getTime()) out.push({ at: over, ...afterwards(games, competitions), url: './', tag: `result-${date}` });
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX);
}
