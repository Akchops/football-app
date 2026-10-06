import { describe, expect, it } from 'vitest';
import { monthFirstLocale, readFixtureMessage, type MessageContext } from './fixtureMessage';

// Tuesday 6 October 2026.
const ctx: MessageContext = {
  today: '2026-10-06',
  teamNames: ['Wanderers FC'],
  competitions: [
    { id: 'c-easter', name: 'Easter 7s' },
    { id: 'c-league', name: 'Sunday League' },
  ],
  monthFirst: false,
};

const read = (text: string, over: Partial<MessageContext> = {}) => readFixtureMessage(text, { ...ctx, ...over });
const one = (text: string, over: Partial<MessageContext> = {}) => {
  const found = read(text, over);
  expect(found).toHaveLength(1);
  return found[0];
};

describe('readFixtureMessage: one game', () => {
  it('reads a typical coach message', () => {
    expect(
      one(
        'Hi all, next game is Sat 17th Oct v Oakfield Rangers, KO 10:30, meet at 10:00 at Riverside Park pitch 3. Red kit please 👍',
      ),
    ).toMatchObject({
      date: '2026-10-17',
      time: '10:30',
      opponent: 'Oakfield Rangers',
      meet: '10:00',
      location: 'Riverside Park pitch 3',
      venue: null,
      stage: null,
    });
  });

  it('keeps the pitch with the ground, however it is joined on', () => {
    expect(one('vs Oakfield at Riverside Park, pitch 3. Red kit').location).toBe('Riverside Park, pitch 3');
    expect(one('vs Oakfield at Riverside Park - Pitch 3').location).toBe('Riverside Park - Pitch 3');
    expect(one('vs Oakfield at Riverside Park, KO 10').location).toBe('Riverside Park');
  });

  it('reads an away game with an address', () => {
    expect(one('U14s - Sunday 11/10 Away at Hillcrest FC, kick off 11am. Address: Mill Lane, BN1 2AB')).toMatchObject({
      date: '2026-10-11',
      time: '11:00',
      opponent: 'Hillcrest FC',
      venue: 'away',
      location: 'Mill Lane, BN1 2AB',
    });
  });

  it('reads tomorrow and a home marker', () => {
    expect(one('Match tomorrow 9am vs Barton Athletic (H)')).toMatchObject({
      date: '2026-10-07',
      time: '09:00',
      opponent: 'Barton Athletic',
      venue: 'home',
    });
  });

  it('tells kick-off from meeting time, and reads "at theirs" as away', () => {
    expect(one('Game this Saturday against Kingsway Utd at theirs, KO 2pm, be there 1.15')).toMatchObject({
      date: '2026-10-10',
      time: '14:00',
      meet: '13:15',
      opponent: 'Kingsway Utd',
      venue: 'away',
      location: null,
    });
  });

  it('reads a knockout round', () => {
    expect(one('Cup quarter final!! Sun 18 Oct 10.30 KO vs Northside Rangers at home 🏆')).toMatchObject({
      date: '2026-10-18',
      time: '10:30',
      opponent: 'Northside Rangers',
      venue: 'home',
      stage: 'quarter',
      stageDetail: '',
    });
    expect(one('Plate semi v Vale 2.30')).toMatchObject({ stage: 'semi', stageDetail: 'Plate', opponent: 'Vale', time: '14:30' });
    expect(one('Semi final vs TBC 1pm')).toMatchObject({ stage: 'semi', opponent: 'TBC', time: '13:00' });
  });

  it("works out which side is the player's own team", () => {
    expect(one('Riverside FC v Wanderers FC, Saturday 17th October, 12:00')).toMatchObject({
      opponent: 'Riverside FC',
      venue: 'away',
      date: '2026-10-17',
      time: '12:00',
    });
    expect(one('Sat 17th: Wanderers U14 vs Hove Albion U14 – KO 10am – Hove Park')).toMatchObject({
      opponent: 'Hove Albion',
      venue: 'home',
      date: '2026-10-17',
      time: '10:00',
    });
  });

  it('reads @ as an away game when nothing else names the opponent', () => {
    expect(one('Next fixture: 24/10 @ Dockside Rovers 10:30')).toMatchObject({
      date: '2026-10-24',
      opponent: 'Dockside Rovers',
      venue: 'away',
      time: '10:30',
      location: null,
    });
  });

  it('reads the emoji template clubs send', () => {
    const message = [
      '⚽️ MATCH DAY ⚽️',
      '📅 Sunday 18th October',
      '⏰ KO 10:30 (meet 9:45)',
      '🆚 Northside Rangers',
      '📍 Away - Northside Rec, Pitch 2',
      '👕 Away kit (white)',
    ].join('\n');
    expect(one(message)).toMatchObject({
      date: '2026-10-18',
      time: '10:30',
      meet: '09:45',
      opponent: 'Northside Rangers',
      venue: 'away',
      location: 'Northside Rec, Pitch 2',
    });
  });

  it('reads US dates and grounds', () => {
    expect(
      one('Game Saturday 10/17 at 9:00 AM vs. Strikers FC at Field 4, Memorial Park', { monthFirst: true }),
    ).toMatchObject({
      date: '2026-10-17',
      time: '09:00',
      opponent: 'Strikers FC',
      location: 'Memorial Park, Field 4',
    });
  });

  it('lets the weekday settle a date that could be either way round', () => {
    // 10/11 is 10 November, a Tuesday, or October 11, a Sunday.
    expect(one('Sun 10/11 v Oakfield').date).toBe('2026-10-11');
    expect(one('Match 10/11 vs Oakfield').date).toBe('2026-11-10');
    expect(one('Match 10/11 vs Oakfield', { monthFirst: true }).date).toBe('2026-10-11');
  });

  it('picks the date that goes with the game', () => {
    expect(one('Training cancelled tonight. Match on Saturday vs Kingsway at 2pm at home')).toMatchObject({
      date: '2026-10-10',
      time: '14:00',
      opponent: 'Kingsway',
      venue: 'home',
    });
    expect(one('Sat 17th v Oakfield (rearranged from Sun 11th)').date).toBe('2026-10-17');
  });

  it('reads match length only when it is stated', () => {
    expect(one('League game Sunday 25th Oct v Old Boys, 2 x 25 min halves, KO 9.30am at Hove Park')).toMatchObject({
      date: '2026-10-25',
      opponent: 'Old Boys',
      durationMinutes: 50,
      time: '09:30',
      location: 'Hove Park',
    });
    expect(one('vs Oakfield Saturday, meet 15 mins before KO').durationMinutes).toBeNull();
  });

  it('spots a competition the message names', () => {
    expect(one('Easter 7s update: next game 11:15 v Hillcrest')).toMatchObject({
      competitionId: 'c-easter',
      opponent: 'Hillcrest',
      time: '11:15',
      date: null,
    });
  });

  it('ignores the sender stamp on a copied WhatsApp message', () => {
    expect(one('[06/10/2026, 18:32] Coach Dave: Sat 10th v Oakfield KO 10')).toMatchObject({
      date: '2026-10-10',
      opponent: 'Oakfield',
      time: '10:00',
    });
  });

  it("isn't fooled by kit, sun cream, prices or a final reminder", () => {
    expect(one('Home game v Oakfield Sat, wear away kit').venue).toBe('home');
    expect(one('Bring sun cream! Game vs Oakfield at 10:30 tomorrow').date).toBe('2026-10-07');
    expect(one('Entry £3.50, game vs Oakfield 10:30').time).toBe('10:30');
    expect(one('Final reminder: game vs Oakfield Sat')).toMatchObject({ stage: null, date: '2026-10-10' });
    expect(one("C'mon lads, game vs Oakfield on the 17th").date).toBe('2026-10-17');
  });

  it('reads a four-digit kick-off, and a bare "at 10"', () => {
    expect(one('v Oakfield KO 1030').time).toBe('10:30');
    expect(one("We're playing Oakfield on Saturday at 10")).toMatchObject({
      opponent: 'Oakfield',
      date: '2026-10-10',
      time: '10:00',
    });
    expect(one('vs Oakfield, meet at 9, KO at 10').time).toBe('10:00');
    expect(one('vs Oakfield at 10 Mill Lane').time).toBeNull();
  });

  it('reads the other ways a date gets written', () => {
    expect(one('Next Saturday vs Oakfield').date).toBe('2026-10-10');
    expect(one('vs Oakfield on 3rd Nov').date).toBe('2026-11-03');
    expect(one('vs Oakfield Nov 3rd').date).toBe('2026-11-03');
    expect(one('vs Oakfield 2026-11-03').date).toBe('2026-11-03');
    expect(one('vs Oakfield 3.11.26').date).toBe('2026-11-03');
    expect(one('vs Oakfield today').date).toBe('2026-10-06');
    // A date in January is next year's.
    expect(one('vs Oakfield 9th January').date).toBe('2027-01-09');
  });

  it('reads the team before the colon as the opening of the fixture', () => {
    expect(one('Game: Wanderers vs Oakfield')).toMatchObject({ opponent: 'Oakfield', venue: 'home' });
  });

  it('finds nothing in a message with no fixture in it', () => {
    expect(read('Great effort lads, well played!')).toEqual([]);
    expect(read('   ')).toEqual([]);
  });
});

describe('readFixtureMessage: a list of games', () => {
  it("reads a tournament's order of play, with the date, ground and group above applying to the games under them", () => {
    const games = read(
      [
        'Easter 7s fixtures:',
        'Sunday 18th October @ Central Playing Fields',
        'Group B:',
        '9:30 vs Vale FC',
        '10:15 vs Hillcrest',
        '11:00 vs Oakfield',
        'Semis 1pm',
      ].join('\n'),
    );
    expect(games).toHaveLength(4);
    expect(games.map((g) => [g.time, g.opponent, g.stage, g.stageDetail])).toEqual([
      ['09:30', 'Vale FC', 'group', 'B'],
      ['10:15', 'Hillcrest', 'group', 'B'],
      ['11:00', 'Oakfield', 'group', 'B'],
      ['13:00', null, 'semi', ''],
    ]);
    for (const game of games) {
      expect(game).toMatchObject({ date: '2026-10-18', location: 'Central Playing Fields', competitionId: 'c-easter' });
    }
  });

  it('splits several games written on one line', () => {
    const games = read('Group B: 09:00 v Oakfield, 09:40 v Vale, 10:20 v Hillcrest');
    expect(games.map((g) => [g.time, g.opponent, g.stage, g.stageDetail])).toEqual([
      ['09:00', 'Oakfield', 'group', 'B'],
      ['09:40', 'Vale', 'group', 'B'],
      ['10:20', 'Hillcrest', 'group', 'B'],
    ]);
  });

  it('carries each day down to its games', () => {
    const games = read('Saturday:\n10:00 v Ajax Juniors\n11:00 v Brighton Colts\nSunday:\n10:00 v Crawley Town');
    expect(games.map((g) => [g.date, g.opponent])).toEqual([
      ['2026-10-10', 'Ajax Juniors'],
      ['2026-10-10', 'Brighton Colts'],
      ['2026-10-11', 'Crawley Town'],
    ]);
  });
});

describe('monthFirstLocale', () => {
  it('knows which way round a phone writes dates', () => {
    expect(monthFirstLocale('en-US')).toBe(true);
    expect(monthFirstLocale('en-GB')).toBe(false);
    expect(monthFirstLocale('en-IN')).toBe(false);
  });
});
