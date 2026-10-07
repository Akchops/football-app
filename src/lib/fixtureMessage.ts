import type { MatchStage, Venue } from '../types';
import { normaliseOpponent, type ParsedFixture } from './fixtures';

/**
 * A fixture read out of a message - the coach's WhatsApp, a text from another
 * parent - shared into the app or pasted in. It's read on the phone with
 * patterns rather than sent anywhere, so it works with no signal and answers
 * straight away. Nothing is added from here: what was found fills the match
 * form, where it can be checked, so a miss is a field left to fill in rather
 * than a wrong match on the calendar.
 */
export interface MessageFixture {
  /** 'YYYY-MM-DD', or null when the message doesn't say. */
  date: string | null;
  /** Kick-off, 'HH:mm'. */
  time: string | null;
  opponent: string | null;
  venue: Venue | null;
  location: string | null;
  stage: MatchStage | null;
  stageDetail: string;
  durationMinutes: number | null;
  /** When to be there, 'HH:mm'. A match has no field for it, so it goes in the notes. */
  meet: string | null;
  /** One of the player's competitions, when the message names it ("Easter 7s"). */
  competitionId: string | null;
}

export interface MessageContext {
  /** 'YYYY-MM-DD'. A date written without a year is the next one from here. */
  today: string;
  /** The player's own teams: in "Wanderers v Oakfield" the other side is the opponent. */
  teamNames: string[];
  competitions: { id: string; name: string }[];
  /** Dates written month first, 10/17 for 17 October - as phones set up for the US do. */
  monthFirst: boolean;
}

/** Whether this phone writes dates month first. */
export function monthFirstLocale(locale?: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric' }).formatToParts(
      new Date(2000, 11, 31),
    );
    return parts.findIndex((p) => p.type === 'month') < parts.findIndex((p) => p.type === 'day');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- cleaning up

/** The message as plain lines: no emoji, no WhatsApp formatting, no sender stamps. */
function tidy(raw: string): string {
  return (
    raw
      .replace(/\r\n?/g, '\n')
      // A run of copied WhatsApp messages starts each one "[17/10/2026, 18:32] Coach Dave:",
      // and an exported chat "17/10/2026, 18:32 - Coach Dave:". Neither is part of the fixture.
      .replace(/^\[[^\]\n]{4,40}\]\s*[^:\n]{1,40}:\s*/gm, '')
      .replace(/^\d{1,2}\/\d{1,2}\/\d{2,4},? \d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]m)? [-–] [^:\n]{1,40}:\s*/gim, '')
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[   ]/g, ' ')
      .replace(/🆚/gu, ' vs ')
      // The pin always comes before the place.
      .replace(/📍/gu, '\nVenue: ')
      .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍⃣]/gu, ' ')
      // *bold*, _italic_ and ~struck out~.
      .replace(/[*_~]/g, ' ')
      // "St. Mary's" isn't the end of a sentence.
      .replace(/\b(St|Ft|Mt)\.\s/g, '$1 ')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
  );
}

// ---------------------------------------------------------------- dates

const MONTH = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
// "sat" and "sun" are words too: "sat on the bench", "sun cream".
const WEEKDAY = String.raw`(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday|(?!\s+(?:on|in|out|down|with|there)\b))|sun(?:day|(?!\s*(?:cream|hat|block|screen|glasses|tan|shine)\b)))`;
const WEEKDAY_TOKEN = /^(?:mon|tues?|wed|thu|fri|sat|sun)[a-z]*\.?,?$/i;
const MONTH_TOKEN = new RegExp(`^${MONTH}\\.?,?$`, 'i');

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const monthOf = (word: string) => MONTH_KEYS.indexOf(word.slice(0, 3).toLowerCase()) + 1;
const weekdayOf = (word: string | undefined) => (word ? WEEKDAY_KEYS.indexOf(word.slice(0, 3).toLowerCase()) : -1);

const pad2 = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

function isValid(y: number, m: number, d: number): boolean {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Days since 1970 - plain arithmetic, so a clock change can't shift a date. */
function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function fromDayNumber(n: number): string {
  const t = new Date(n * 86_400_000);
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

const dayOfWeek = (date: string) => new Date(dayNumber(date) * 86_400_000).getUTCDay();

/**
 * A day and month without a year: this year's, unless that went by over a
 * month ago - a fixture is nearly always still to come, but a match from last
 * week might be getting logged. A weekday alongside settles it.
 */
function resolveMonthDay(month: number, day: number, today: string, weekday: number, year: number | null): string | null {
  if (year !== null) return isValid(year, month, day) ? iso(year, month, day) : null;
  const t = dayNumber(today);
  const thisYear = Number(today.slice(0, 4));
  const options = [thisYear - 1, thisYear, thisYear + 1]
    .filter((y) => isValid(y, month, day))
    .map((y) => iso(y, month, day));
  const soon = options.filter((o) => dayNumber(o) >= t - 31);
  const pool = soon.length > 0 ? soon : options;
  if (weekday >= 0) {
    const matching = pool.find((o) => dayOfWeek(o) === weekday);
    if (matching) return matching;
  }
  return pool[0] ?? null;
}

/** 10/11 is the 10th of November or October the 11th: the weekday decides, then the phone's habit. */
function resolveNumeric(a: number, b: number, year: number | null, ctx: MessageContext, weekday: number): string | null {
  const dayFirst = resolveMonthDay(b, a, ctx.today, weekday, year);
  const monthFirst = resolveMonthDay(a, b, ctx.today, weekday, year);
  if (dayFirst && monthFirst && dayFirst !== monthFirst) {
    if (weekday >= 0) {
      const dayFirstFits = dayOfWeek(dayFirst) === weekday;
      if (dayFirstFits !== (dayOfWeek(monthFirst) === weekday)) return dayFirstFits ? dayFirst : monthFirst;
    }
    return ctx.monthFirst ? monthFirst : dayFirst;
  }
  return dayFirst ?? monthFirst;
}

/** "The 17th": the next 17th to come - or, with "Sat", the next one that's a Saturday. */
function resolveDayOnly(day: number, today: string, weekday: number): string | null {
  const t = dayNumber(today);
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  const upcoming: string[] = [];
  while (upcoming.length < 3) {
    if (isValid(y, m, day) && dayNumber(iso(y, m, day)) >= t) upcoming.push(iso(y, m, day));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (y > Number(today.slice(0, 4)) + 2) break;
  }
  if (weekday >= 0) {
    const matching = upcoming.find((o) => dayOfWeek(o) === weekday);
    if (matching) return matching;
  }
  return upcoming[0] ?? null;
}

/** "Saturday" is the coming one - today, if today is Saturday, unless it says "next". */
function resolveWeekday(weekday: number, today: string, next: boolean): string {
  let ahead = (weekday - dayOfWeek(today) + 7) % 7;
  if (ahead === 0 && next) ahead = 7;
  return fromDayNumber(dayNumber(today) + ahead);
}

interface Span {
  index: number;
  end: number;
}

interface DateHit extends Span {
  date: string;
}

type DateReader = (m: RegExpMatchArray, ctx: MessageContext, text: string) => string | null;

/** Most specific first: "Sat 17th Oct" is one date, not a Saturday plus a 17th plus October. */
const DATE_PATTERNS: [RegExp, DateReader][] = [
  // 2026-10-17
  [
    /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g,
    (m) => (isValid(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : null),
  ],
  // Sat 17th Oct, Saturday 17 October 2026, the 17th of October
  [
    new RegExp(String.raw`\b(?:${WEEKDAY}\.?,?\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?${MONTH}\b\.?(?:,?\s+(20\d{2})\b)?`, 'gi'),
    (m, ctx) => resolveMonthDay(monthOf(m[3]), +m[2], ctx.today, weekdayOf(m[1]), m[4] ? +m[4] : null),
  ],
  // Oct 17, Saturday October 17th, 2026
  [
    new RegExp(String.raw`\b(?:${WEEKDAY}\.?,?\s+)?${MONTH}\.?\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(20\d{2})\b)?`, 'gi'),
    (m, ctx) => resolveMonthDay(monthOf(m[2]), +m[3], ctx.today, weekdayOf(m[1]), m[4] ? +m[4] : null),
  ],
  // 17/10, Sun 18/10/26, 10/17 in the US
  [
    new RegExp(String.raw`\b(?:${WEEKDAY}\.?,?\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b(?![:.\/]\d)`, 'gi'),
    (m, ctx) => resolveNumeric(+m[2], +m[3], m[4] ? fullYear(m[4]) : null, ctx, weekdayOf(m[1])),
  ],
  // 17.10.26, 17-10-2026 - only with a year: "10.30" is a kick-off and "3-1" a score.
  [
    new RegExp(String.raw`\b(?:${WEEKDAY}\.?,?\s+)?(\d{1,2})([.\-])(\d{1,2})\3(\d{4}|\d{2})\b`, 'gi'),
    (m, ctx) => resolveNumeric(+m[2], +m[4], fullYear(m[5]), ctx, weekdayOf(m[1])),
  ],
  // Sat 17th, the 17th - but not "3rd/4th", "1st half" or "2nd round".
  [
    new RegExp(
      String.raw`\b(?:${WEEKDAY}\.?,?\s+)?(?:the\s+)?(\d{1,2})(st|nd|rd|th)\b(?!\s*(?:\/|&|and\b|place|round|half|halves|minute|min|time|goal|team|year|birthday|kit|game|match|leg))`,
      'gi',
    ),
    (m, ctx, text) => {
      const before = text.slice(Math.max(0, (m.index ?? 0) - 2), m.index);
      return /[\/&]\s*$/.test(before) ? null : resolveDayOnly(+m[2], ctx.today, weekdayOf(m[1]));
    },
  ],
  // today, tomorrow
  [
    /\b(today|tonight|tomorrow|tmrw|tmr|tomoz|2moro|2morrow)\b/gi,
    (m, ctx) => fromDayNumber(dayNumber(ctx.today) + (/^to(day|night)$/i.test(m[1]) ? 0 : 1)),
  ],
  // Saturday, this Sat, next Sunday
  [
    new RegExp(String.raw`\b(?:(this|next|on)\s+)?${WEEKDAY}\b`, 'gi'),
    (m, ctx, text) =>
      text[(m.index ?? 0) - 1] === "'" ? null : resolveWeekday(weekdayOf(m[2]), ctx.today, m[1]?.toLowerCase() === 'next'),
  ],
];

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

const overlaps = (a: Span, spans: Span[]) => spans.some((b) => a.index < b.end && b.index < a.end);

function findDates(text: string, ctx: MessageContext): DateHit[] {
  const hits: DateHit[] = [];
  for (const [pattern, read] of DATE_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      const span = { index: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
      if (overlaps(span, hits)) continue;
      const date = read(m, ctx, text);
      if (date) hits.push({ ...span, date });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------- times

interface TimeHit extends Span {
  time: string;
  /** Kick-off, when to be there, when it's over - or not said. */
  kind: 'kickoff' | 'meet' | 'other' | 'plain';
}

/** 'HH:mm' from a clock reading. With no am or pm, 1 to 6 is the afternoon - nobody kicks off at 2am. */
function clock(hour: number, minute: number, half: string | undefined): string | null {
  let h = hour;
  const ampm = half?.toLowerCase();
  if (ampm === 'a') h = h === 12 ? 0 : h;
  else if (ampm === 'p') h = h < 12 ? h + 12 : h;
  else if (h >= 1 && h <= 6) h += 12;
  if (h > 23 || minute > 59) return null;
  return `${pad2(h)}:${pad2(minute)}`;
}

const TIME_PATTERNS: [RegExp, (m: RegExpMatchArray) => string | null][] = [
  // 10:30, 10.30, 2.15pm, 14:00
  [/\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*([ap])\.?\s?m\b\.?)?(?![.:]?\d)/gi, (m) => clock(+m[1], +m[2], m[3])],
  // 2pm, 11 am
  [/\b(1[0-2]|0?[1-9])\s*([ap])\.?\s?m\b\.?/gi, (m) => clock(+m[1], 0, m[2])],
  [/\b(?:noon|midday|mid-day)\b/gi, () => '12:00'],
  // KO 2, kick off 1030
  [
    /\b(?:ko|k\.o\.?|kick[\s-]?off|kickoff|kicks off|starts?|starting|start time)\s*(?:is|at|@|:|-|time)?\s*(\d{1,2})(\d{2})?\b(?![:.\/]\d)/gi,
    (m) => clock(+m[1], m[2] ? +m[2] : 0, undefined),
  ],
  // "Saturday at 10" - but not "at 10 Mill Lane" or "at 3 different grounds".
  [
    /\b(?:at|@)\s*(\d{1,2})(?:\s*o'?clock)?\b(?![:.\/]\d|\s*(?:st|nd|rd|th|[ap]\.?m)\b|\s+[a-z])/gi,
    (m) => clock(+m[1], 0, undefined),
  ],
];

const KICKOFF_BEFORE = /\b(?:ko|k\.o\.?|kick[\s-]?off|kickoff|kicks off|starts?|starting|start time|game time|match time)\b\W*(?:is|at|@|time)?\W*$/;
const MEET_BEFORE =
  /\b(?:meet(?:ing)?|arrive|arrival|be there|there (?:for|by|at)|warm[\s-]?up|report(?:ing)?|assemble|be ready|get there|leave|leaving|depart(?:ing|ure)?)\b\W*(?:at|by|for|@|from)?\W*$/;
const OTHER_BEFORE = /\b(?:finish(?:es|ing)?|ends?|until|till|til|back (?:by|at)|done by|over by|pick[\s-]?up|collect(?:ion)?)\b\W*(?:at|by|@)?\W*$/;

function findTimes(text: string, taken: Span[]): TimeHit[] {
  const hits: TimeHit[] = [];
  for (const [pattern, read] of TIME_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      const span = { index: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
      if (overlaps(span, hits) || overlaps(span, taken)) continue;
      // Prices and distances aren't kick-offs.
      if (/[£$€]$/.test(text.slice(0, span.index)) || /^\s*(?:km|k\b|miles?|mi\b|%|kg)/i.test(text.slice(span.end))) continue;
      const time = read(m);
      if (!time) continue;
      const before = text.slice(Math.max(0, span.index - 28), span.index).toLowerCase().split('\n').pop() ?? '';
      const after = text.slice(span.end, span.end + 14).toLowerCase();
      const kind: TimeHit['kind'] =
        KICKOFF_BEFORE.test(before) || /^\s*(?:ko|k\.o|kick[\s-]?off)\b/.test(after) || /^\b(?:ko|kick|start)/.test(m[0].toLowerCase())
          ? 'kickoff'
          : MEET_BEFORE.test(before) || /^\s*(?:meet|arrival|arrive)\b/.test(after)
            ? 'meet'
            : OTHER_BEFORE.test(before)
              ? 'other'
              : 'plain';
      hits.push({ ...span, time, kind });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------- teams

const PRONOUN = /^(?:them|us|they|we|it|you|him|her|ourselves|each other|whoever)$/i;
const TIMEISH = /^\d{1,2}(?:[:.]\d{2}|\s*[ap]\.?m\b)/i;

/** Where a team's name stops: "vs Oakfield on Saturday, KO 10:30" is Oakfield. */
const TEAM_STOP = new RegExp(
  [
    String.raw`\s+(?:at|@|on|kick|kicks|ko|k\.o|this|next|tomorrow|today|tonight|home|away|from|for|starts?|starting|meet|meeting|in|venue|ground|please|pls|plz|which|who|is|was|will|then|game|match|fixture|by|with|before|after|if|so|but|and we|we|i)\b`,
    String.raw`\s+\d{1,2}(?:[:.]\d{2}|\s*[ap]\.?m\b|st\b|nd\b|rd\b|th\b|\/\d)`,
    String.raw`\s+(?:mon|tues?|weds?|thu|thurs?|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b`,
    String.raw`\s+[-–—|]\s*`,
    String.raw`\s*[,;!?()\[\]"]`,
    String.raw`\.(?:\s|$)`,
  ].join('|'),
  'i',
);

function cutTeam(raw: string): string | null {
  let s = raw.replace(/^[\s:.\-–—]+/, '');
  if (TIMEISH.test(s) || /^(?:at|@|on|home|away|the same|tbc\?)\b/i.test(s)) return null;
  const stop = s.search(TEAM_STOP);
  if (stop >= 0) s = s.slice(0, stop);
  s = s
    // Everyone in the game is the same age group: "Hove Albion U14" is Hove Albion.
    .replace(/\s+(?:u\s?\d{1,2}s?|under[\s-]?\d{1,2}s?)$/i, '')
    .replace(/^(?:[Tt]he|a)\s+/, '')
    .replace(/[\s.:'"-]+$/, '')
    .trim();
  if (!s || PRONOUN.test(s) || s.length > 40 || s.split(/\s+/).length > 6 || /^\d+$/.test(s)) return null;
  return /^(?:tbc|tba|tbd)$/i.test(s) ? 'TBC' : s;
}

/** Words that come before a team's name in a sentence but aren't part of it. */
const FILLER = new Set(
  (
    "next this our the game games match matches fixture fixtures is are its it's we we're were playing play plays " +
    'ko kick off kickoff at on today tomorrow tonight reminder hi hey all everyone guys team folks hello morning ' +
    'afternoon evening please pls update confirmed rearranged and & - – — vs v'
  ).split(' '),
);

function isFiller(word: string): boolean {
  const w = word.toLowerCase().replace(/[.,:!]+$/, '');
  return (
    w === '' ||
    FILLER.has(w) ||
    /^\d{1,2}(?:st|nd|rd|th)?$/.test(w) ||
    /^\d{1,2}[:.]\d{2}(?:[ap]m)?$/.test(w) ||
    /^\d{1,2}[ap]m$/.test(w) ||
    /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(w) ||
    WEEKDAY_TOKEN.test(w) ||
    MONTH_TOKEN.test(w)
  );
}

/** The team before "v": "Sat 17th Hove Albion" is Hove Albion. */
function teamBefore(raw: string): string | null {
  const words = raw.trim().split(/\s+/);
  while (words.length > 0 && isFiller(words[0])) words.shift();
  return cutTeam(words.join(' '));
}

function makeIsOurs(teamNames: string[]) {
  const ours = teamNames.map(normaliseOpponent).filter((n) => n !== '');
  return (name: string) => {
    const n = normaliseOpponent(name);
    return n !== '' && ours.some((o) => n === o || ` ${n} `.includes(` ${o} `));
  };
}

const VS = /(^|[\s,(:;])(vs?\.?|versus|against)\s+/gi;
/** What separates one thing from the next on a line, so the team before "v" starts after it. */
const CLAUSE = /[:;,|([]|\s[-–—]\s/g;

interface OpponentHit {
  opponent: string;
  venue: Venue | null;
  /** Where in the message it was found. */
  at: number;
}

function clauseBefore(text: string, at: number): string {
  const lineStart = text.lastIndexOf('\n', at - 1) + 1;
  const left = text.slice(lineStart, at);
  let start = 0;
  for (const m of left.matchAll(CLAUSE)) start = (m.index ?? 0) + m[0].length;
  return left.slice(start);
}

function restOfLine(text: string, from: number): string {
  const end = text.indexOf('\n', from);
  return text.slice(from, end === -1 ? undefined : end);
}

function findOpponent(text: string, isOurs: (name: string) => boolean): OpponentHit | null {
  for (const m of text.matchAll(VS)) {
    const markerAt = (m.index ?? 0) + m[1].length;
    const right = cutTeam(restOfLine(text, (m.index ?? 0) + m[0].length));
    const left = teamBefore(clauseBefore(text, markerAt));
    if (right && isOurs(right)) {
      // "Hove Albion v Wanderers": they're at home, so it's away.
      if (left && !isOurs(left)) return { opponent: left, venue: 'away', at: markerAt };
      continue;
    }
    if (right) return { opponent: right, venue: left && isOurs(left) ? 'home' : null, at: markerAt };
  }

  // "Away at Hillcrest", "@ Dockside Rovers", "home to Barton".
  for (const [pattern, venue] of [
    [/(?:\baway\s+(?:at|to|v|vs|against)\b|(?:^|\s)@)\s*/gim, 'away'],
    [/\b(?:at\s+)?home\s+(?:to|v|vs|against)\s+/gi, 'home'],
    [/\b(?:opponents?|opposition|playing)\s*[:\-]?\s+/gi, null],
  ] as [RegExp, Venue | null][]) {
    for (const m of text.matchAll(pattern)) {
      const team = cutTeam(restOfLine(text, (m.index ?? 0) + m[0].length));
      if (team && !isOurs(team)) return { opponent: team, venue, at: m.index ?? 0 };
    }
  }

  // A fixture-list row: "Sat 17 Oct - Oakfield (A) 10:30".
  for (const m of text.matchAll(/([^\n,;:()]+?)\s*\((h|a|home|away)\)/gi)) {
    const team = teamBefore(m[1]);
    if (team && !isOurs(team)) {
      return { opponent: team, venue: m[2].toLowerCase().startsWith('a') ? 'away' : 'home', at: m.index ?? 0 };
    }
  }
  return null;
}

// ---------------------------------------------------------------- venue and ground

/** Kit is "home" or "away" too, so only the ways of saying where the game is count. */
const HOME =
  /\((?:h|home)\)|\[(?:h|home)\]|\bat home\b|\bhome\s+(?:game|match|fixture|tie|to|v|vs|versus|against)\b|^home\b(?!\s+(?:kit|strip|shirts?|colou?rs|socks|top))|\b(?:venue|location|ground)\s*[:\-]?\s*home\b|\bat ours\b|\bour (?:place|ground|pitch|patch)\b/im;
const AWAY =
  /\((?:a|away)\)|\[(?:a|away)\]|\baway\s+(?:game|match|fixture|tie|day|at|to|v|vs|versus|against|trip)\b|^away\b(?!\s+(?:kit|strip|shirts?|colou?rs|socks|top))|\b(?:venue|location|ground)\s*[:\-]?\s*away\b|\bat theirs\b|\btheir (?:place|ground|pitch|patch)\b|\bwe(?:'re| are) away\b/im;
const NEUTRAL = /\((?:n|neutral)\)|\bneutral\b/i;

function findVenue(text: string): Venue | null {
  if (NEUTRAL.test(text)) return 'neutral';
  const home = HOME.exec(text);
  const away = AWAY.exec(text);
  if (home && away) return home.index < away.index ? 'home' : 'away';
  return home ? 'home' : away ? 'away' : null;
}

const LABELLED_PLACE = /\b(?:venue|location|address|ground|where|pitch location)\s*[:\-–]\s*([^\n]+)/i;
const LABELLED_STOP = /\s*[;!?\n]|\.(?:\s|$)|\s+(?:ko|k\.o|kick|kicks|meet|meeting)\b|\s+\d{1,2}(?:[:.]\d{2}|\s*[ap]\.?m\b)/i;
const PLACE_STOP =
  /\s*[;!?\n]|\s*,(?!\s*(?:pitch|field)\b)|\.(?:\s|$)|\s+[-–—](?!\s*(?:pitch|field)\b)\s|\s+(?:ko|k\.o|kick|kicks|meet|meeting|on|this|next|for|from|at\s+\d|@\s*\d|please|pls|vs?\.?|versus|against|tomorrow|today|tonight)\b|\s+\d{1,2}(?:[:.]\d{2}|\s*[ap]\.?m\b)|\s+\((?:h|a|n)\)/i;

function cutPlace(raw: string, stopAt: RegExp): string | null {
  let s = raw;
  const stop = s.search(stopAt);
  if (stop >= 0) s = s.slice(0, stop);
  s = s.replace(/[\s.,:;-]+$/, '').trim();
  return s && s.length <= 60 ? s : null;
}

function findLocation(text: string, opponent: string | null): string | null {
  let place: string | null = null;
  const labelled = LABELLED_PLACE.exec(text);
  if (labelled) place = cutPlace(labelled[1], LABELLED_STOP);
  if (!place) {
    // "at Riverside Park", "@ Central Fields" - capitalised, so "at home" and "at 10" aren't places.
    const at = /(?:\b[Aa]t|@)\s+(?!home\b|theirs\b|ours\b|their\b|our\b|the same\b|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z']*\b)([A-Z]|\d{1,4}\s+[A-Z][a-z])/g;
    for (const m of text.matchAll(at)) {
      const rest = restOfLine(text, (m.index ?? 0) + m[0].length - m[1].length);
      let candidate = cutPlace(rest, PLACE_STOP);
      if (!candidate || TIMEISH.test(candidate)) continue;
      if (/^(?:pitch|field|court)\b/i.test(candidate) && rest.includes(',')) {
        const ground = cutPlace(rest.slice(rest.indexOf(',') + 1).trim(), PLACE_STOP);
        if (ground) candidate = `${ground}, ${candidate}`;
      }
      // "Away at Hillcrest FC" named the opponent, not the ground.
      if (opponent && normaliseOpponent(candidate) === normaliseOpponent(opponent)) continue;
      place = candidate;
      break;
    }
  }
  // "Away - Northside Rec": the first word was where the game is, not the ground.
  if (place) place = place.replace(/^(?:home|away|neutral)\b\s*[-–—:,]?\s*/i, '').trim() || null;

  // A pitch written on its own: "Pitch 3".
  const pitch = /\b(pitch|field)\s*(?:no\.?\s*)?(\d{1,2}[a-z]?)\b/i.exec(text);
  if (pitch && !(place && new RegExp(`\\b${pitch[1]}\\s*(?:no\\.?\\s*)?${pitch[2]}\\b`, 'i').test(place))) {
    const label = `${pitch[1][0].toUpperCase()}${pitch[1].slice(1).toLowerCase()} ${pitch[2].toUpperCase()}`;
    place = place ? `${place}, ${label}` : label;
  }
  return place;
}

// ---------------------------------------------------------------- stage, length, competition

const STAGE_PATTERNS: [RegExp, MatchStage, ((m: RegExpMatchArray) => string)?][] = [
  [/\b(?:group|grp|pool)\s*([a-h]|\d{1,2})\b/gi, 'group', (m) => m[1].toUpperCase()],
  [/\bgroup\s+(?:stage|games?|matches|phase)\b/gi, 'group'],
  [/\b(?:3rd|third)\s*(?:\/|&|and|-|v)\s*4th\b|\b(?:3rd|third)[\s-]*place\b/gi, 'third'],
  [/\b(?:semi[\s-]?finals?|semis?|sf)\b/gi, 'semi'],
  [/\b(?:quarter[\s-]?finals?|quarters|qf)\b/gi, 'quarter'],
  [/\b(?:last|round of)\s*16\b/gi, 'last16'],
  [
    /\bfinal\b(?!\s+(?:reminder|details|whistle|call|score|result|instructions|info|update|word|game of|match of|training|session|day|week|one))/gi,
    'final',
  ],
  [/\b(?:round|rd)\s*(\d)\b/gi, 'round', (m) => m[1]],
];

function findStage(text: string): { stage: MatchStage; detail: string } | null {
  let best: { index: number; stage: MatchStage; detail: string } | null = null;
  for (const [pattern, stage, detail] of STAGE_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      const index = m.index ?? 0;
      // The "final" of a semi-final is the semi.
      if (stage === 'final' && /(?:semi|quarter)[\s-]?$/i.test(text.slice(Math.max(0, index - 8), index))) continue;
      if (!best || index < best.index) best = { index, stage, detail: detail ? detail(m) : '' };
      break;
    }
  }
  if (!best) return null;
  // The bracket of a knockout round: the Plate semi, the Shield final.
  if (best.stage !== 'group' && best.stage !== 'round') {
    const bracket = /\b(plate|shield|bowl|vase|trophy)\b/i.exec(text);
    if (bracket) best.detail = `${bracket[1][0].toUpperCase()}${bracket[1].slice(1).toLowerCase()}`;
  }
  return { stage: best.stage, detail: best.detail };
}

/** Only when the message says how long the games are - never guessed from "15 mins before". */
function findDuration(text: string): number | null {
  const halves = /\b([2-4])\s*[x×]\s*(\d{1,2})\s*(?:mins?|minutes?|m)?\b/i.exec(text);
  if (halves && +halves[2] >= 5 && +halves[2] <= 45) return +halves[1] * +halves[2];
  const halvesOf = /\b(?:two\s+)?halves\s+of\s+(\d{1,2})\b/i.exec(text) ?? /\b(\d{1,2})\s*(?:mins?|minutes?)\s+(?:each\s+way|halves|a\s+half|per\s+half)\b/i.exec(text);
  if (halvesOf && +halvesOf[1] >= 5 && +halvesOf[1] <= 45) return 2 * +halvesOf[1];
  const games = /\b(\d{2})[\s-]?(?:mins?|minutes?)\s+(?:games?|matches)\b/i.exec(text) ?? /\b(?:games?|matches)\s+(?:are|will be|is)\s+(\d{2})\s*(?:mins?|minutes?)\b/i.exec(text);
  if (games && +games[1] >= 10 && +games[1] <= 90) return +games[1];
  return null;
}

const nameKey = (s: string) => ` ${s.toLowerCase().replace(/[.'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;

function findCompetition(text: string, competitions: MessageContext['competitions']): string | null {
  const hay = nameKey(text);
  let best: { id: string; length: number } | null = null;
  for (const c of competitions) {
    const key = nameKey(c.name);
    if (key.trim().length >= 3 && hay.includes(key) && (!best || key.length > best.length)) best = { id: c.id, length: key.length };
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------- putting it together

/** The hit closest to `anchor` - the first one when there's nothing to measure from. */
function nearest<T extends Span>(hits: T[], anchor: number | null): T | null {
  if (hits.length === 0) return null;
  if (anchor === null) return hits[0];
  const gap = (h: Span) => (h.end <= anchor ? anchor - h.end : h.index >= anchor ? h.index - anchor : 0);
  return hits.reduce((best, h) => (gap(h) < gap(best) ? h : best));
}

function readOne(text: string, ctx: MessageContext, isOurs: (name: string) => boolean): MessageFixture {
  const opponent = findOpponent(text, isOurs);
  const anchor = opponent?.at ?? null;
  const dates = findDates(text, ctx);
  const times = findTimes(text, dates);
  const kickoff = times.find((t) => t.kind === 'kickoff') ?? nearest(times.filter((t) => t.kind === 'plain'), anchor);
  const meet = times.find((t) => t.kind === 'meet') ?? null;
  const stage = findStage(text);
  return {
    date: nearest(dates, anchor)?.date ?? null,
    time: kickoff?.time ?? null,
    opponent: opponent?.opponent ?? null,
    venue: findVenue(text) ?? opponent?.venue ?? null,
    location: findLocation(text, opponent?.opponent ?? null),
    stage: stage?.stage ?? null,
    stageDetail: stage?.detail ?? '',
    durationMinutes: findDuration(text),
    meet: meet && meet.time !== kickoff?.time ? meet.time : null,
    competitionId: findCompetition(text, ctx.competitions),
  };
}

function hasAnything(f: MessageFixture): boolean {
  return Boolean(f.date || f.time || f.opponent || f.location || f.stage);
}

/** "09:00 v Oakfield, 09:40 v Vale" is two games on one line. */
function splitList(line: string): string[] {
  const parts = line.split(/\s*[;,]\s*|\s+\|\s+/).filter(Boolean);
  const games = parts.filter((p) => new RegExp(VS.source, 'i').test(p)).length;
  return parts.length > 1 && games >= 2 ? parts : [line];
}

/** A line that is a game in its own right, rather than the date or ground for the games under it. */
function isGame(part: string, isOurs: (name: string) => boolean): boolean {
  for (const m of part.matchAll(VS)) {
    if (cutTeam(restOfLine(part, (m.index ?? 0) + m[0].length))) return true;
  }
  const timed = findTimes(part, findDates(part, NO_CONTEXT)).length > 0;
  if (!timed) return false;
  return findStage(part) !== null || /(?:^|\s)@\s*[A-Z]|\((?:h|a|home|away)\)/i.test(part) || findOpponent(part, isOurs) !== null;
}

/** Only for telling dates apart from times while deciding what a line is. */
const NO_CONTEXT: MessageContext = { today: '2000-01-01', teamNames: [], competitions: [], monthFirst: false };

/**
 * Every game in the message. Usually that's one, with its details spread over
 * a few lines. A list - a tournament's order of play - is one game a line,
 * with the date, ground or group above applying to the games under it.
 */
export function readFixtureMessage(raw: string, ctx: MessageContext): MessageFixture[] {
  const text = tidy(raw);
  if (!text) return [];
  const isOurs = makeIsOurs(ctx.teamNames);
  const lines = text.split('\n').map((line) => ({ line, parts: splitList(line) }));
  const games = lines.reduce((n, { parts }) => n + parts.filter((p) => isGame(p, isOurs)).length, 0);

  if (games < 2) {
    const one = readOne(text, ctx, isOurs);
    return hasAnything(one) ? [one] : [];
  }

  const competitionId = findCompetition(text, ctx.competitions);
  const durationMinutes = findDuration(text);
  const above: { date: string | null; stage: { stage: MatchStage; detail: string } | null; location: string | null; venue: Venue | null } = {
    date: null,
    stage: null,
    location: null,
    venue: null,
  };
  const fixtures: MessageFixture[] = [];
  for (const { line, parts } of lines) {
    const inLine = parts.filter((p) => isGame(p, isOurs));
    if (inLine.length === 0) {
      above.date = findDates(line, ctx)[0]?.date ?? above.date;
      if (/\bknock[\s-]?outs?\b/i.test(line)) above.stage = null;
      above.stage = findStage(line) ?? above.stage;
      above.location = findLocation(line, null) ?? above.location;
      above.venue = findVenue(line) ?? above.venue;
      continue;
    }
    const lineStage = findStage(line);
    for (const part of inLine) {
      const game = readOne(part, ctx, isOurs);
      const stage = game.stage ? { stage: game.stage, detail: game.stageDetail } : lineStage ?? above.stage;
      fixtures.push({
        ...game,
        date: game.date ?? above.date,
        stage: stage?.stage ?? null,
        stageDetail: stage?.detail ?? '',
        location: game.location ?? above.location,
        venue: game.venue ?? above.venue,
        durationMinutes: game.durationMinutes ?? durationMinutes,
        competitionId: game.competitionId ?? competitionId,
      });
    }
  }
  return fixtures;
}

/**
 * Several games from one message, as rows for the import review - the same
 * check-before-adding screen a photographed schedule gets. A game the message
 * gave no day for goes on `fallback.date`, and says so.
 */
export function asScheduleRows(
  found: MessageFixture[],
  fallback: { date: string; venue: Venue; location: string },
): ParsedFixture[] {
  return found.map((f) => ({
    date: f.date ?? fallback.date,
    time: f.time ?? '',
    opponent: f.opponent ?? (f.stage ? 'TBC' : ''),
    venue: f.venue ?? fallback.venue,
    competition: '',
    location: f.location ?? fallback.location,
    durationMinutes: f.durationMinutes,
    confidence: 'high',
    stage: f.stage ?? 'none',
    stageDetail: f.stageDetail,
  }));
}
