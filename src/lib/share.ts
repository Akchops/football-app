import {
  METRIC_BY_ID, type Competition, type Match, type MatchResult, type MetricId, type Profile, type Team,
} from '../types';
import { formatDateLong } from './date';
import { matchScore, scoreBand, scoreVerdict } from './score';
import { outcomeOf, scoreline } from './stats';

const W = 1080;
/** Where the stat tiles start; the card's height grows from here. */
const TILES_TOP = 812;
const TILE_H = 148;
const TILE_GAP = 20;
const FOOTER = 132;

const INK = '#0b1220';
const SURFACE = '#141f34';
const LINE = '#26344f';
const TEXT = '#e9effb';
const MUTED = '#8ea0c6';
const BAND: Record<string, string> = {
  great: '#29d17c',
  good: '#4cc9f0',
  ok: '#f0b429',
  poor: '#f2685f',
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export interface ShareCardInput {
  match: Match & { result: MatchResult };
  team: Team | null;
  competition: Competition | null;
  profile: Profile;
}

/**
 * Draws a square-ish card of one performance, sized for a phone screenshot or
 * an Instagram story. Everything is drawn on a canvas so it works offline.
 */
export async function renderShareCard({ match, team, competition, profile }: ShareCardInput): Promise<Blob | null> {
  const result = match.result;
  const performance = matchScore(result, match.durationMinutes);
  const accent = BAND[scoreBand(performance.score)] ?? BAND.ok;
  const outcome = outcomeOf(result);

  // Whatever was actually recorded, in the order it matters for the position.
  const entries: { label: string; value: string }[] = [];
  const push = (id: MetricId) => {
    const value = result.metrics[id] ?? 0;
    if (value) entries.push({ label: METRIC_BY_ID[id]?.short ?? id, value: String(value) });
  };
  if (result.positionGroup === 'goalkeeper') {
    if (result.goalsAgainst === 0) entries.push({ label: 'Clean sheet', value: '✓' });
    push('saves');
    push('penaltiesSaved');
    push('claims');
  } else {
    push('goals');
    push('assists');
    push('tackles');
    push('interceptions');
    push('chancesCreated');
    push('shotsOnTarget');
  }
  entries.push({ label: 'Minutes', value: `${result.minutes}` });
  if (result.motm) entries.push({ label: 'MOTM', value: '🏅' });

  const tiles = entries.slice(0, 6);
  const cols = 3;
  const rows = Math.max(1, Math.ceil(tiles.length / cols));
  // No dead space at the bottom when there are only a few stats to show.
  const H = TILES_TOP + rows * TILE_H + (rows - 1) * TILE_GAP + FOOTER;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background with a soft wash of the score colour.
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const wash = ctx.createRadialGradient(W / 2, 240, 40, W / 2, 240, 900);
  wash.addColorStop(0, `${accent}22`);
  wash.addColorStop(1, '#0b122000');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  const pad = 72;
  let y = 96;

  // Player line, with photo if there is one.
  const photo = await loadImage(profile.photo);
  if (photo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pad + 44, y + 30, 44, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const side = Math.min(photo.width, photo.height);
    ctx.drawImage(photo, (photo.width - side) / 2, (photo.height - side) / 2, side, side, pad, y - 14, 88, 88);
    ctx.restore();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pad + 44, y + 30, 44, 0, Math.PI * 2);
    ctx.stroke();
  }

  const textLeft = photo ? pad + 112 : pad;
  ctx.fillStyle = TEXT;
  ctx.font = '700 42px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(profile.name || 'Matchday', textLeft, y + 26);
  ctx.fillStyle = MUTED;
  ctx.font = '500 28px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(
    [result.position, team?.name, profile.ageGroup].filter(Boolean).join(' · '),
    textLeft,
    y + 68,
  );

  // Fixture.
  y = 268;
  ctx.fillStyle = MUTED;
  ctx.font = '600 30px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(formatDateLong(match.date).toUpperCase(), pad, y);
  if (competition) {
    ctx.fillStyle = competition.color;
    ctx.fillText(competition.name.toUpperCase(), pad, y + 44);
  }

  y = 400;
  ctx.fillStyle = TEXT;
  ctx.font = '800 62px -apple-system, "Segoe UI", Roboto, sans-serif';
  const opponent = `${match.venue === 'away' ? '@' : 'vs'} ${match.opponent || 'TBC'}`;
  ctx.fillText(opponent.length > 22 ? `${opponent.slice(0, 21)}…` : opponent, pad, y);

  // Scoreline.
  y = 500;
  ctx.fillStyle = accent;
  ctx.font = '800 128px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(scoreline(result), pad, y + 96);
  ctx.fillStyle = MUTED;
  ctx.font = '600 34px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(outcome === 'W' ? 'WIN' : outcome === 'L' ? 'DEFEAT' : 'DRAW', pad, y + 150);

  // Score dial.
  const cx = W - pad - 110;
  const cy = y + 46;
  ctx.lineWidth = 20;
  ctx.strokeStyle = SURFACE;
  ctx.beginPath();
  ctx.arc(cx, cy, 100, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, 100, -Math.PI / 2, -Math.PI / 2 + (performance.score / 100) * Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'center';
  ctx.font = '800 74px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(String(performance.score), cx, cy + 22);
  ctx.fillStyle = MUTED;
  ctx.font = '600 24px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('OUT OF 100', cx, cy + 58);
  ctx.textAlign = 'left';

  // Verdict strip.
  y = 760;
  ctx.fillStyle = accent;
  ctx.font = '700 40px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(scoreVerdict(performance.score), pad, y);

  const tileW = (W - pad * 2 - TILE_GAP * (cols - 1)) / cols;
  y = TILES_TOP;
  tiles.forEach((tile, i) => {
    const tx = pad + (i % cols) * (tileW + TILE_GAP);
    const ty = y + Math.floor(i / cols) * (TILE_H + TILE_GAP);
    ctx.fillStyle = SURFACE;
    roundRect(ctx, tx, ty, tileW, TILE_H, 24);
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = TEXT;
    ctx.font = '800 56px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(tile.value, tx + 26, ty + 76);
    ctx.fillStyle = MUTED;
    ctx.font = '600 26px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(tile.label, tx + 26, ty + 116);
  });

  // Footer.
  ctx.fillStyle = MUTED;
  ctx.font = '600 26px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Tracked with Matchday', pad, H - 60);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

/** Share the card through the OS share sheet, falling back to a download. */
export async function shareCard(blob: Blob, filename: string, text: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/png' });
  const shareData = { files: [file], text };
  if (navigator.canShare?.(shareData) && navigator.share) {
    try {
      await navigator.share(shareData);
      return 'shared';
    } catch {
      // Cancelled or unsupported - fall through to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
