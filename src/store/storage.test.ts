import { describe, expect, it } from 'vitest';
import { DATA_VERSION, emptyData, parseData } from './storage';

/** A backup written by v1, before profiles, teams and position-aware stats. */
const V1_BACKUP = JSON.stringify({
  version: 1,
  settings: {
    teamName: 'Wanderers FC',
    playerName: 'Alex',
    defaultPosition: 'GK',
    resultPromptDelayMinutes: 0,
    defaultKickoff: '16:30',
    weekStartsOn: 1,
  },
  competitions: [
    { id: 'c1', name: 'Sunday League', type: 'league', season: '25/26', color: '#22c55e', notes: '', archived: false, createdAt: '' },
  ],
  matches: [
    {
      id: 'm1', competitionId: 'c1', opponent: 'Riverside FC', date: '2026-04-10', time: '16:30',
      venue: 'home', location: '', status: 'played', notes: '', remindAfter: null,
      createdAt: '', updatedAt: '',
      result: {
        goalsFor: 2, goalsAgainst: 1, penaltiesFor: null, penaltiesAgainst: null, didPlay: true,
        minutes: 90, goals: 1, assists: 2, yellowCards: 0, redCards: 0, position: 'GK', rating: 8, motm: true,
      },
    },
  ],
});

describe('parseData', () => {
  it('returns empty data for missing or broken storage', () => {
    expect(parseData(null)).toEqual(emptyData());
    expect(parseData('not json at all')).toEqual(emptyData());
    expect(parseData('{"matches":"nope"}').matches).toEqual([]);
  });

  it('upgrades a v1 backup to the current version', () => {
    expect(parseData(V1_BACKUP).version).toBe(DATA_VERSION);
  });

  it('turns the old single team name into the player\'s first team', () => {
    const data = parseData(V1_BACKUP);
    expect(data.teams).toHaveLength(1);
    expect(data.teams[0].name).toBe('Wanderers FC');
    expect(data.matches[0].teamId).toBe(data.teams[0].id);
  });

  it('builds a profile from the old settings', () => {
    const { profile } = parseData(V1_BACKUP);
    expect(profile.name).toBe('Alex');
    expect(profile.position).toBe('GK');
    expect(profile.positionGroup).toBe('goalkeeper');
    // Existing users still get walked through the new setup once.
    expect(profile.onboardedAt).toBeNull();
  });

  it('moves v1 goals and assists into the metrics map without losing them', () => {
    const result = parseData(V1_BACKUP).matches[0].result;
    expect(result?.metrics).toEqual({ goals: 1, assists: 2 });
    expect(result?.positionGroup).toBe('goalkeeper');
    expect(result?.goalsFor).toBe(2);
    expect(result?.rating).toBe(8);
  });

  it('leaves already-migrated data alone', () => {
    const migrated = parseData(V1_BACKUP);
    const round2 = parseData(JSON.stringify(migrated));
    expect(round2.teams).toHaveLength(1);
    expect(round2.matches[0].result?.metrics).toEqual({ goals: 1, assists: 2 });
  });
});
