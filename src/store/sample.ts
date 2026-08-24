import {
  COMPETITION_COLORS, TEAM_COLORS,
  type AppData, type Competition, type Match, type MatchResult, type Team,
} from '../types';
import { toISODate, seasonLabel } from '../lib/date';
import { createId, emptyData } from './storage';

/**
 * Demo data so the app has something to show before any real matches exist.
 * The demo player is a keeper across two clubs - it shows off both the
 * position-specific stats and the multi-team colouring.
 */
export function buildSampleData(now: Date = new Date()): AppData {
  const base = emptyData();
  const season = seasonLabel(now);
  const stamp = new Date().toISOString();
  const iso = (offsetDays: number) => toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays));

  const club: Team = {
    id: createId('team'), name: 'Wanderers FC', ageGroup: 'U16', position: 'GK',
    color: TEAM_COLORS[0], notes: 'Main club', createdAt: stamp,
  };
  const sundaySide: Team = {
    id: createId('team'), name: 'City Sunday XI', ageGroup: 'Open age', position: 'GK',
    color: TEAM_COLORS[1], notes: 'Sunday side with mates', createdAt: stamp,
  };

  const league: Competition = {
    id: createId('comp'), name: 'Sunday League', type: 'league', season,
    color: COMPETITION_COLORS[0], notes: 'Division 2', archived: false, createdAt: stamp,
  };
  const cup: Competition = {
    id: createId('comp'), name: 'County Cup', type: 'cup', season,
    color: COMPETITION_COLORS[2], notes: '', archived: false, createdAt: stamp,
  };
  const tournament: Competition = {
    id: createId('comp'), name: 'Easter 7s', type: 'tournament', season,
    color: COMPETITION_COLORS[3], notes: 'Group stage + knockouts, all in one day', archived: false, createdAt: stamp,
  };

  const result = (over: Partial<MatchResult>): MatchResult => ({
    goalsFor: 0, goalsAgainst: 0, penaltiesFor: null, penaltiesAgainst: null,
    didPlay: true, minutes: 80, position: 'GK', positionGroup: 'goalkeeper',
    rating: null, motm: false, yellowCards: 0, redCards: 0, metrics: {}, ...over,
  });

  const make = (over: Partial<Match>): Match => ({
    id: createId('match'), competitionId: league.id, teamId: club.id, opponent: 'TBC', date: iso(0),
    time: '16:30', venue: 'home', location: '', durationMinutes: 80, status: 'scheduled', result: null, notes: '',
    remindAfter: null, createdAt: stamp, updatedAt: stamp, ...over,
  });

  const matches: Match[] = [
    make({ opponent: 'Riverside FC', date: iso(-28), time: '14:00', venue: 'away', status: 'played',
      result: result({ goalsFor: 2, goalsAgainst: 1, rating: 8, motm: true,
        metrics: { saves: 5, conceded: 1, claims: 3 } }) }),
    make({ opponent: 'Kingsway United', date: iso(-21), time: '16:30', venue: 'home', status: 'played',
      result: result({ goalsFor: 0, goalsAgainst: 3, rating: 5,
        metrics: { saves: 2, conceded: 3, claims: 1 } }) }),
    make({ opponent: 'Barton Athletic', date: iso(-14), time: '11:00', venue: 'home', competitionId: cup.id,
      status: 'played', result: result({ goalsFor: 1, goalsAgainst: 1, penaltiesFor: 4, penaltiesAgainst: 3, rating: 7,
        metrics: { saves: 4, conceded: 1, penaltiesSaved: 2, claims: 2 } }) }),
    // A Sunday-league outing for the second club.
    make({ opponent: 'Dockside Rovers', date: iso(-10), time: '10:30', venue: 'away', teamId: sundaySide.id,
      competitionId: null, status: 'played', durationMinutes: 90,
      result: result({ goalsFor: 3, goalsAgainst: 0, rating: 8, minutes: 90,
        metrics: { saves: 6, conceded: 0, claims: 4, sweeperActions: 2 } }) }),
    make({ opponent: 'Old Boys', date: iso(-7), time: '16:30', venue: 'away', status: 'played',
      result: result({ goalsFor: 3, goalsAgainst: 0, rating: 9, motm: true,
        metrics: { saves: 3, conceded: 0, claims: 2, sweeperActions: 1 } }) }),
    make({ opponent: 'Northside Rangers', date: iso(-4), time: '16:30', venue: 'home', status: 'played',
      result: result({ goalsFor: 2, goalsAgainst: 2, rating: 7, yellowCards: 1,
        metrics: { saves: 4, conceded: 2, claims: 1 } }) }),
    // Kicked off yesterday and never logged - this is what triggers the result prompt.
    make({ opponent: 'Eastfield Town', date: iso(-1), time: '16:30', venue: 'away' }),
    // Tournament day - three matches on one date, in the tournament's colour.
    make({ opponent: 'Group A: Vale FC', date: iso(3), time: '09:30', venue: 'neutral', competitionId: tournament.id, location: 'Central Playing Fields', durationMinutes: 30 }),
    make({ opponent: 'Group A: Hillcrest', date: iso(3), time: '11:15', venue: 'neutral', competitionId: tournament.id, location: 'Central Playing Fields', durationMinutes: 30 }),
    make({ opponent: 'Semi-final', date: iso(3), time: '14:00', venue: 'neutral', competitionId: tournament.id, location: 'Central Playing Fields', durationMinutes: 30 }),
    make({ opponent: 'Harbour Wanderers', date: iso(6), time: '10:30', venue: 'home', teamId: sundaySide.id, competitionId: null, durationMinutes: 90 }),
    make({ opponent: 'Kingsway United', date: iso(9), time: '16:30', venue: 'away' }),
    make({ opponent: 'Riverside FC', date: iso(16), time: '16:30', venue: 'home' }),
    make({ opponent: 'Quarter-final', date: iso(23), time: '13:00', venue: 'neutral', competitionId: cup.id }),
  ];

  const birthYear = now.getFullYear() - 16;

  return {
    ...base,
    profile: {
      name: 'Alex',
      photo: '',
      dateOfBirth: `${birthYear}-04-12`,
      ageGroup: 'U16',
      position: 'GK',
      positionGroup: 'goalkeeper',
      onboardedAt: stamp,
    },
    teams: [club, sundaySide],
    competitions: [league, cup, tournament],
    matches,
  };
}
