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

  it('gives matches from before match lengths existed the standard 90', () => {
    expect(parseData(V1_BACKUP).matches[0].durationMinutes).toBe(90);
  });

  it('keeps a match length that was already set', () => {
    const withLength = JSON.parse(V1_BACKUP);
    withLength.matches[0].durationMinutes = 60;
    expect(parseData(JSON.stringify(withLength)).matches[0].durationMinutes).toBe(60);
  });

  it('gives teams and competitions from before sharing an edit time', () => {
    const data = parseData(V1_BACKUP);
    // Backfilled from createdAt, so a record nobody has touched since the
    // upgrade loses to one that has actually been edited.
    expect(data.competitions[0].updatedAt).toBe(data.competitions[0].createdAt);
    expect(data.teams[0].updatedAt).toBe(data.teams[0].createdAt);
  });

  it('marks nothing as deleted when upgrading an old backup', () => {
    const data = parseData(V1_BACKUP);
    for (const row of [...data.matches, ...data.teams, ...data.competitions, ...data.training]) {
      expect(row.deletedAt).toBeNull();
    }
  });

  it('keeps a tombstone through a round trip so the delete still syncs', () => {
    const data = parseData(V1_BACKUP);
    data.matches[0].deletedAt = '2026-05-01T00:00:00.000Z';
    const round2 = parseData(JSON.stringify(data));
    expect(round2.matches[0].deletedAt).toBe('2026-05-01T00:00:00.000Z');
  });

  it('gives matches from before stages existed no stage, leaving the opponent as it was', () => {
    const [match] = parseData(V1_BACKUP).matches;
    expect(match.stage).toBe('');
    expect(match.opponent).toBe('Riverside FC');
  });

  it('gives competitions from before finishing an open, unplaced, ungrouped start', () => {
    const [competition] = parseData(V1_BACKUP).competitions;
    expect(competition).toMatchObject({ archived: false, placing: '', ageGroup: '' });
    // Nor anything set up for matches added later.
    expect(competition).toMatchObject({ startDate: '', teamId: null, location: '', matchLength: 0 });
  });

  it("counts an old profile's age group as picked in the year it was set up", () => {
    // Saved by a version from before the question existed, so the field is missing, not blank.
    const { ageGroupYear: _never, ...before } = emptyData().profile;
    const saved = (profile: object) => JSON.stringify({ ...emptyData(), profile: { ...before, ...profile } });

    // Set up in May 2025, so asked about moving up from New Year 2026 on.
    expect(parseData(saved({ ageGroup: 'U13', onboardedAt: '2025-05-01T10:00:00.000Z' })).profile.ageGroupYear).toBe(2025);
    // Never set up: nothing to ask about yet.
    expect(parseData(saved({ onboardedAt: null })).profile.ageGroupYear).toBe(0);
  });

  it('keeps a year that was already answered', () => {
    const json = JSON.stringify({
      ...emptyData(),
      profile: { ...emptyData().profile, onboardedAt: '2025-05-01T10:00:00.000Z', ageGroupYear: 2027 },
    });
    expect(parseData(json).profile.ageGroupYear).toBe(2027);
  });

  it('leaves already-migrated data alone', () => {
    const migrated = parseData(V1_BACKUP);
    const round2 = parseData(JSON.stringify(migrated));
    expect(round2.teams).toHaveLength(1);
    expect(round2.matches[0].result?.metrics).toEqual({ goals: 1, assists: 2 });
  });
});
