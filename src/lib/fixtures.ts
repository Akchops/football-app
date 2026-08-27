import type { Match, Venue } from '../types';

/** One fixture as read off a schedule image or PDF, before anyone has checked it. */
export interface ParsedFixture {
  /** Local calendar date, 'YYYY-MM-DD'. */
  date: string;
  /** Local kickoff, 'HH:mm'. Empty when the sheet does not give one. */
  time: string;
  opponent: string;
  venue: Venue;
  /** Competition exactly as printed, e.g. "U16 South Division" - matched to a real one later. */
  competition: string;
  location: string;
  /** Only when the sheet actually says, e.g. "2 x 30 mins". Never guessed. */
  durationMinutes: number | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface FixtureRead {
  /** What the sheet appears to be, in one line - shown so a wrong document is obvious. */
  summary: string;
  fixtures: ParsedFixture[];
}

export const FIXTURES_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'One line on what this document is, e.g. "U16 league fixtures for Riverside FC, autumn 2026". Say so plainly if it is not a fixture list.',
    },
    fixtures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Match date as YYYY-MM-DD' },
          time: { type: 'string', description: 'Kickoff as 24-hour HH:mm, or empty string if the sheet does not give one' },
          opponent: { type: 'string', description: 'The other team, exactly as written' },
          venue: { type: 'string', enum: ['home', 'away', 'neutral'], description: 'home, away, or neutral. H/A markers usually mean home/away' },
          competition: { type: 'string', description: 'Competition or division as printed, or empty string' },
          location: { type: 'string', description: 'Ground or pitch if given, or empty string' },
          durationMinutes: { type: 'integer', description: 'Total minutes only if the sheet states it. 0 when it does not - never guess' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'How clearly this row could be read' },
        },
        required: ['date', 'time', 'opponent', 'venue', 'competition', 'location', 'durationMinutes', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'fixtures'],
  additionalProperties: false,
} as const;

export const FIXTURES_SYSTEM = [
  'You read football fixture lists off photos, screenshots and PDFs and turn them into structured data.',
  'These are usually shared in team chats: a club schedule, a league table of fixtures, a tournament order of play, or a photo of a printed sheet.',
  'Read every fixture row you can see. Do not invent rows, and do not skip rows because they are hard to read - mark those low confidence instead.',
  'Dates are often written without a year ("Sat 12 Sep"). Use the current date given to you and choose the nearest sensible upcoming date; a fixture list nearly always runs forwards from now.',
  'Times may be 12-hour ("4.30", "4:30pm", "kick off 2pm"). Always return 24-hour HH:mm. If a row genuinely has no time, return an empty string rather than guessing.',
  'H and A, or (H) and (A), mean home and away. So do "vs" for home and "@" or "at" for away. Neutral only when the sheet says so.',
  'The opponent is the other team, never the player\'s own. If the row reads "Riverside FC v Oakwood United" and the sheet belongs to Riverside, the opponent is Oakwood United.',
  'Only set durationMinutes when the sheet states a length. Otherwise return 0.',
  'If the image is not a fixture list at all, say so in the summary and return no fixtures.',
].join(' ');

export function fixturesPrompt(today: string, teamNames: string[]): string {
  return [
    `Today's date is ${today}.`,
    teamNames.length > 0
      ? `The player turns out for: ${teamNames.join(', ')}. Any of these appearing in a row is their own team, so the opponent is the other side.`
      : 'The player\'s own team is not known, so use the sheet itself to work out which side is theirs.',
    '',
    'Read every fixture in this document.',
  ].join('\n');
}

/** A parsed fixture once it has been checked against the calendar already there. */
export interface ReviewRow extends ParsedFixture {
  key: string;
  include: boolean;
  /** Id of the match this appears to duplicate, if any. */
  duplicateOf: string | null;
  /** Why this row cannot be imported as it stands. Empty when it is fine. */
  problem: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Real calendar date, not just the right shape - 2026-02-31 must not pass. */
export function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Anything that would land a nonsense fixture on the calendar. A model reading a
 * blurry photo can misread a year or drop a digit, and a silent bad row is worse
 * than one that says what is wrong with it.
 */
export function problemWith(fixture: ParsedFixture, today: string): string {
  if (!isRealDate(fixture.date)) return 'The date could not be read';
  if (fixture.time !== '' && !TIME_PATTERN.test(fixture.time)) return 'The kickoff time could not be read';
  if (fixture.opponent.trim() === '') return 'No opponent on this row';
  const away = daysBetween(today, fixture.date);
  if (away < -370) return 'That date is over a year ago';
  if (away > 730) return 'That date is more than two years away';
  return '';
}

/** Club names vary by row - "Oakwood Utd U16" and "Oakwood United" are one team. */
export function normaliseOpponent(name: string): string {
  return name
    .toLowerCase()
    // Dots and apostrophes join rather than separate, so "F.C." reads as "fc"
    // and can then be stripped as the suffix it is.
    .replace(/[.'\u2019]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(fc|afc|cf|sc|utd|united|club|academy|colts|juniors|youth)\b/g, ' ')
    .replace(/\bu\s?\d{1,2}s?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same day, same opponent - almost certainly the fixture already in the calendar. */
export function findDuplicate(fixture: ParsedFixture, matches: Match[]): Match | null {
  const opponent = normaliseOpponent(fixture.opponent);
  if (opponent === '') return null;
  return (
    matches.find((match) => match.date === fixture.date && normaliseOpponent(match.opponent) === opponent) ?? null
  );
}

/**
 * Everything the review screen needs, worked out up front: what is wrong with a
 * row, what it duplicates, and whether it should start ticked. Duplicates and
 * broken rows start unticked so the safe thing happens if someone taps straight
 * through.
 */
export function buildRows(fixtures: ParsedFixture[], matches: Match[], today: string): ReviewRow[] {
  return fixtures.map((fixture, index) => {
    const problem = problemWith(fixture, today);
    const duplicate = problem === '' ? findDuplicate(fixture, matches) : null;
    return {
      ...fixture,
      key: `row-${index}`,
      problem,
      duplicateOf: duplicate?.id ?? null,
      include: problem === '' && duplicate === null,
    };
  });
}

/** Rows that would actually be added if the button were pressed now. */
export function importable(rows: ReviewRow[]): ReviewRow[] {
  return rows.filter((row) => row.include && row.problem === '');
}

/**
 * Match the competition text off the sheet to one already set up, so a whole
 * term of fixtures lands under the right colour without picking it row by row.
 */
export function matchCompetition(
  printed: string,
  competitions: { id: string; name: string }[],
): string | null {
  const wanted = normaliseOpponent(printed);
  if (wanted === '') return null;
  const exact = competitions.find((c) => normaliseOpponent(c.name) === wanted);
  if (exact) return exact.id;
  const partial = competitions.find((c) => {
    const name = normaliseOpponent(c.name);
    return name !== '' && (name.includes(wanted) || wanted.includes(name));
  });
  return partial?.id ?? null;
}

/** The fields addMatch needs. Kickoff defaults only when the sheet gave none. */
export function toMatchInput(
  row: ReviewRow,
  options: { teamId: string | null; competitionId: string | null; defaultTime: string; defaultLength: number },
) {
  return {
    competitionId: options.competitionId,
    teamId: options.teamId,
    opponent: row.opponent.trim(),
    date: row.date,
    time: row.time || options.defaultTime,
    venue: row.venue,
    location: row.location.trim(),
    durationMinutes: row.durationMinutes && row.durationMinutes > 0 ? row.durationMinutes : options.defaultLength,
    notes: '',
  };
}
