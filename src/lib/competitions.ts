import { nextStage, type Competition, type Match, type Settings, type Team } from '../types';
import { kickoffAt } from './date';

/** A match as the add-match form starts it: everything except what saving it adds. */
export type MatchDraft = Omit<Match, 'id' | 'status' | 'result' | 'remindAfter' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

/** 'HH:mm' an hour on, stopping at 23:00 rather than rolling into tomorrow. */
export function hourAfter(time: string): string {
  const [h, m] = (time || '00:00').split(':').map(Number);
  return `${String(Math.min(23, (h || 0) + 1)).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
}

/**
 * Where a match added to a competition later should start, so a fixture that
 * has just come in takes a few taps: the same team, ground, venue and match
 * length as its latest match - or, before it has one, as the tournament was
 * set up with - and the round after the latest one. The same day an hour on
 * while that day is still to come; otherwise the tournament's own day, or today.
 */
export function nextMatchFor(
  competition: Competition,
  matches: Match[],
  teams: Team[],
  settings: Pick<Settings, 'defaultKickoff' | 'defaultMatchLength'>,
  today: string,
): MatchDraft {
  const own = matches
    .filter((m) => m.competitionId === competition.id)
    .sort((a, b) => kickoffAt(a.date, a.time).getTime() - kickoffAt(b.date, b.time).getTime());
  const latest = own[own.length - 1] ?? null;
  const tournament = competition.type === 'tournament';
  // A team that has since been deleted can't be played for.
  const live = (id: string | null) => (id && teams.some((t) => t.id === id) ? id : null);

  const sameDay = latest !== null && latest.date >= today;
  const date = sameDay ? latest.date : competition.startDate && competition.startDate >= today ? competition.startDate : today;

  return {
    competitionId: competition.id,
    teamId: live(latest?.teamId ?? null) ?? live(competition.teamId),
    opponent: '',
    stage: latest ? nextStage(latest.stage) : tournament ? 'Group stage' : '',
    date,
    time: sameDay ? hourAfter(latest.time) : settings.defaultKickoff,
    venue: latest?.venue ?? (tournament ? 'neutral' : 'home'),
    location: latest?.location || competition.location,
    durationMinutes: latest?.durationMinutes || competition.matchLength || settings.defaultMatchLength,
    notes: '',
  };
}
