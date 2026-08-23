import { COMPETITION_COLORS, type AppData, type Competition, type Match, type MatchResult } from '../types';
import { toISODate, seasonLabel } from '../lib/date';
import { createId, emptyData } from './storage';

/** Demo data so the app has something to show before any real matches exist. */
export function buildSampleData(now: Date = new Date()): AppData {
  const base = emptyData();
  const season = seasonLabel(now);
  const iso = (offsetDays: number) => toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays));

  const league: Competition = {
    id: createId('comp'), name: 'Sunday League', type: 'league', season,
    color: COMPETITION_COLORS[0], notes: 'Division 2', archived: false, createdAt: new Date().toISOString(),
  };
  const cup: Competition = {
    id: createId('comp'), name: 'County Cup', type: 'cup', season,
    color: COMPETITION_COLORS[2], notes: '', archived: false, createdAt: new Date().toISOString(),
  };
  const tournament: Competition = {
    id: createId('comp'), name: 'Easter 7s', type: 'tournament', season,
    color: COMPETITION_COLORS[3], notes: 'Group stage + knockouts, all in one day', archived: false,
    createdAt: new Date().toISOString(),
  };

  const result = (over: Partial<MatchResult>): MatchResult => ({
    goalsFor: 0, goalsAgainst: 0, penaltiesFor: null, penaltiesAgainst: null,
    didPlay: true, minutes: 90, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
    position: 'CM', rating: null, motm: false, ...over,
  });

  const make = (over: Partial<Match>): Match => ({
    id: createId('match'), competitionId: league.id, opponent: 'TBC', date: iso(0), time: '16:30',
    venue: 'home', location: '', status: 'scheduled', result: null, notes: '', remindAfter: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...over,
  });

  const matches: Match[] = [
    make({ opponent: 'Riverside FC', date: iso(-28), time: '14:00', venue: 'away', status: 'played',
      result: result({ goalsFor: 2, goalsAgainst: 1, goals: 1, assists: 1, rating: 8, motm: true }) }),
    make({ opponent: 'Kingsway United', date: iso(-21), time: '16:30', venue: 'home', status: 'played',
      result: result({ goalsFor: 0, goalsAgainst: 3, minutes: 65, rating: 5 }) }),
    make({ opponent: 'Barton Athletic', date: iso(-14), time: '11:00', venue: 'home', competitionId: cup.id,
      status: 'played', result: result({ goalsFor: 1, goalsAgainst: 1, penaltiesFor: 4, penaltiesAgainst: 3, assists: 1, rating: 7 }) }),
    make({ opponent: 'Old Boys', date: iso(-7), time: '16:30', venue: 'away', status: 'played',
      result: result({ goalsFor: 3, goalsAgainst: 0, goals: 2, rating: 9, motm: true }) }),
    make({ opponent: 'Northside Rangers', date: iso(-4), time: '16:30', venue: 'home', status: 'played',
      result: result({ goalsFor: 2, goalsAgainst: 2, goals: 1, assists: 1, yellowCards: 1, rating: 7 }) }),
    // Kicked off yesterday and never logged - this is what triggers the result prompt.
    make({ opponent: 'Eastfield Town', date: iso(-1), time: '16:30', venue: 'away' }),
    // Tournament day - three matches on one date.
    make({ opponent: 'Group A: Vale FC', date: iso(3), time: '09:30', venue: 'neutral', competitionId: tournament.id, location: 'Central Playing Fields' }),
    make({ opponent: 'Group A: Hillcrest', date: iso(3), time: '11:15', venue: 'neutral', competitionId: tournament.id, location: 'Central Playing Fields' }),
    make({ opponent: 'Semi-final', date: iso(3), time: '14:00', venue: 'neutral', competitionId: tournament.id, location: 'Central Playing Fields' }),
    make({ opponent: 'Kingsway United', date: iso(9), time: '16:30', venue: 'away' }),
    make({ opponent: 'Riverside FC', date: iso(16), time: '16:30', venue: 'home' }),
    make({ opponent: 'Quarter-final', date: iso(23), time: '13:00', venue: 'neutral', competitionId: cup.id }),
  ];

  return {
    ...base,
    settings: { ...base.settings, teamName: 'Wanderers FC', playerName: 'You', defaultPosition: 'CM' },
    competitions: [league, cup, tournament],
    matches,
  };
}
