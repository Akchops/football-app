import { COMPETITION_TYPE_LABEL, type Competition, type Match, type PositionGroup, type Profile, type Team } from '../types';
import { formatDateLong, formatDateShort } from './date';
import { positionStatCards } from './metrics';
import { STAGE_SHORT, bracketOf, stageName } from './stage';
import { computeStats, outcomeOf, playedMatches, recordSummary, scoreline } from './stats';
import { loadImage, roundRect } from './share';

/** The match card's look, so the two sit together in a camera roll. */
const W = 1080;
const PAD = 72;
const INK = '#0b1220';
const SURFACE = '#141f34';
const LINE = '#26344f';
const TEXT = '#e9effb';
const MUTED = '#8ea0c6';
const FONT = '-apple-system, "Segoe UI", Roboto, sans-serif';
const OUTCOME_COLOR = { W: '#29d17c', D: '#f0b429', L: '#f2685f' } as const;

/** A podium finish gets its medal and its metal. */
const PODIUM: Record<string, { medal: string; color: string }> = {
  Winners: { medal: '🏆', color: '#f5c542' },
  'Runners-up': { medal: '🥈', color: '#cfd8e6' },
  'Third place': { medal: '🥉', color: '#e39a5d' },
};

const TILES_TOP = 720;
const TILE_H = 148;
const TILE_GAP = 20;
const ROW_H = 76;
const MAX_ROWS = 8;
const FOOTER = 132;

/** Cut down to fit `max` pixels in the current font, with an ellipsis. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** The player's photo, name and a line under it - the top of every card. */
export async function drawPlayer(ctx: CanvasRenderingContext2D, profile: Profile, line: string, y: number) {
  const photo = await loadImage(profile.photo);
  if (photo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(PAD + 44, y + 30, 44, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const side = Math.min(photo.width, photo.height);
    ctx.drawImage(photo, (photo.width - side) / 2, (photo.height - side) / 2, side, side, PAD, y - 14, 88, 88);
    ctx.restore();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(PAD + 44, y + 30, 44, 0, Math.PI * 2);
    ctx.stroke();
  }
  const left = photo ? PAD + 112 : PAD;
  ctx.fillStyle = TEXT;
  ctx.font = `700 42px ${FONT}`;
  ctx.fillText(fitText(ctx, profile.name || 'Matchday', W - left - PAD), left, y + 26);
  ctx.fillStyle = MUTED;
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(fitText(ctx, line, W - left - PAD), left, y + 68);
}

/** "SF", "Plate final", "Group B" - short enough for the start of a results row. */
function stageTag(match: Match): string {
  if (!match.stage) return '';
  if (match.stage === 'group' || match.stage === 'round') return stageName(match.stage, match.stageDetail);
  return [bracketOf(match.stageDetail), STAGE_SHORT[match.stage]].filter(Boolean).join(' ');
}

export interface TournamentCardInput {
  competition: Competition;
  /** Every match in it, whatever state it's in - the card shows the ones played. */
  matches: Match[];
  team: Team | null;
  profile: Profile;
  /** The position played most in it, which decides the stats shown. */
  group: PositionGroup;
}

/**
 * One picture of a whole tournament: how far the team got, the record, the
 * player's own numbers for their position, and every result. Drawn on a canvas,
 * so it works with no signal.
 */
export async function renderTournamentCard({ competition, matches, team, profile, group }: TournamentCardInput): Promise<Blob | null> {
  const played = playedMatches(matches).reverse();
  const stats = computeStats(matches);
  const podium = PODIUM[competition.placing];
  const accent = podium?.color ?? competition.color ?? '#29d17c';

  const cards = positionStatCards(group, {
    appearances: stats.appearances,
    played: stats.played,
    minutes: stats.minutes,
    cleanSheetsPlayed: stats.cleanSheetsPlayed,
    goalsAgainst: stats.goalsAgainst,
    totals: stats.totals,
  });
  const tiles = [
    { label: 'Avg match score', value: stats.averageScore !== null ? String(Math.round(stats.averageScore)) : '–' },
    ...cards.slice(0, stats.motm > 0 ? 4 : 5),
    ...(stats.motm > 0 ? [{ label: 'Man of the match', value: `${stats.motm}×` }] : []),
  ];
  const cols = 3;
  const tileRows = Math.ceil(tiles.length / cols);
  const resultsTop = TILES_TOP + tileRows * TILE_H + (tileRows - 1) * TILE_GAP + 96;
  const rows = played.slice(0, MAX_ROWS);
  const more = played.length - rows.length;
  const H = resultsTop + rows.length * ROW_H + (more > 0 ? 56 : 0) + FOOTER;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const wash = ctx.createRadialGradient(W / 2, 420, 40, W / 2, 420, 900);
  wash.addColorStop(0, `${accent}2a`);
  wash.addColorStop(1, '#0b122000');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  await drawPlayer(
    ctx,
    profile,
    [profile.position, team?.name, competition.ageGroup || profile.ageGroup].filter(Boolean).join(' · '),
    96,
  );

  // The tournament.
  const first = played[0]?.date ?? (competition.startDate || '');
  const last = played[played.length - 1]?.date ?? first;
  const when = !first ? '' : first === last ? formatDateLong(first) : `${formatDateShort(first)} – ${formatDateShort(last)}`;
  ctx.fillStyle = MUTED;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(fitText(ctx, [when, competition.location].filter(Boolean).join(' · ').toUpperCase(), W - PAD * 2), PAD, 268);
  ctx.fillStyle = TEXT;
  ctx.font = `800 66px ${FONT}`;
  ctx.fillText(fitText(ctx, competition.name, W - PAD * 2), PAD, 350);
  ctx.fillStyle = competition.color || MUTED;
  ctx.beginPath();
  ctx.arc(PAD + 10, 397, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MUTED;
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText(COMPETITION_TYPE_LABEL[competition.type].toUpperCase(), PAD + 32, 407);

  // How far they got.
  const finished = competition.archived;
  const placing = competition.placing || (finished ? 'Finished' : 'In progress');
  let x = PAD;
  if (podium) {
    ctx.font = `400 84px ${FONT}`;
    ctx.fillText(podium.medal, x, 540);
    x += ctx.measureText(podium.medal).width + 24;
  }
  ctx.fillStyle = competition.placing ? accent : MUTED;
  ctx.font = `800 ${competition.placing ? 76 : 56}px ${FONT}`;
  ctx.fillText(fitText(ctx, placing.toUpperCase(), W - x - PAD), x, 534);

  // The record - goals for isn't a keeper's job, so a keeper's line leaves it out.
  const keeper = group === 'goalkeeper';
  const record = [
    recordSummary(stats),
    keeper ? null : `${stats.goalsFor} scored`,
    `${stats.goalsAgainst} conceded`,
    stats.cleanSheets > 0 ? `${stats.cleanSheets} clean sheet${stats.cleanSheets === 1 ? '' : 's'}` : null,
    stats.shootoutWins > 0 ? `${stats.shootoutWins} won on pens` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  ctx.fillStyle = TEXT;
  ctx.font = `700 36px ${FONT}`;
  ctx.fillText(fitText(ctx, record, W - PAD * 2), PAD, 620);

  // The player's numbers.
  const tileW = (W - PAD * 2 - TILE_GAP * (cols - 1)) / cols;
  tiles.forEach((tile, i) => {
    const tx = PAD + (i % cols) * (tileW + TILE_GAP);
    const ty = TILES_TOP + Math.floor(i / cols) * (TILE_H + TILE_GAP);
    ctx.fillStyle = SURFACE;
    roundRect(ctx, tx, ty, tileW, TILE_H, 24);
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = i === 0 ? accent : TEXT;
    ctx.font = `800 56px ${FONT}`;
    ctx.fillText(fitText(ctx, tile.value, tileW - 40), tx + 26, ty + 76);
    ctx.fillStyle = MUTED;
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(fitText(ctx, tile.label, tileW - 40), tx + 26, ty + 116);
  });

  // Every result, in the order they were played.
  ctx.fillStyle = MUTED;
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText('RESULTS', PAD, resultsTop - 28);
  rows.forEach((match, i) => {
    const top = resultsTop + i * ROW_H;
    const mid = top + ROW_H / 2 + 12;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, top);
    ctx.lineTo(W - PAD, top);
    ctx.stroke();

    const tag = stageTag(match);
    ctx.fillStyle = MUTED;
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(fitText(ctx, tag, 170), PAD, mid);
    const outcome = outcomeOf(match.result);
    const score = scoreline(match.result);
    ctx.font = `800 34px ${FONT}`;
    const scoreW = ctx.measureText(score).width;
    ctx.fillStyle = TEXT;
    ctx.font = `600 34px ${FONT}`;
    const opponent = `${match.venue === 'away' ? '@' : 'vs'} ${match.opponent || 'TBC'}`;
    ctx.fillText(fitText(ctx, opponent, W - PAD * 2 - 190 - scoreW - 96), PAD + 190, mid);
    ctx.textAlign = 'right';
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText(score, W - PAD - 64, mid);
    ctx.textAlign = 'center';
    ctx.fillStyle = OUTCOME_COLOR[outcome];
    ctx.beginPath();
    ctx.arc(W - PAD - 22, mid - 12, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText(outcome, W - PAD - 22, mid - 3);
    ctx.textAlign = 'left';
  });
  if (more > 0) {
    ctx.fillStyle = MUTED;
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(`+ ${more} more`, PAD, resultsTop + rows.length * ROW_H + 40);
  }

  ctx.fillStyle = MUTED;
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText('Tracked with Matchday', PAD, H - 60);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
