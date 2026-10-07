import { POSITION_GROUP_LABEL, type Profile } from '../types';
import { placingLabel } from './stats';
import { roundRect } from './share';
import { drawPlayer, fitText } from './tournamentCard';
import { wrappedTiles, type Wrapped } from './wrapped';

const W = 1080;
/** Story-shaped, so it fills a WhatsApp status or an Instagram story. */
const H = 1920;
const PAD = 72;
const FONT = '-apple-system, "Segoe UI", Roboto, sans-serif';

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, `${color.slice(0, 7)}00`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** The last slide of the story as a picture: the year, the player type and the big numbers. */
export async function renderWrappedCard(w: Wrapped, profile: Profile): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, W, H);
  blob(ctx, 120, 220, 760, '#22c55eaa');
  blob(ctx, 1020, 900, 720, '#a855f799');
  blob(ctx, 180, 1700, 700, '#f9731677');

  ctx.fillStyle = '#ffffffcc';
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText('MATCHDAY WRAPPED', PAD, 150);
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 230px ${FONT}`;
  ctx.fillText(String(w.year), PAD - 8, 370);

  await drawPlayer(
    ctx,
    profile,
    [profile.position || POSITION_GROUP_LABEL[w.group], profile.ageGroup].filter(Boolean).join(' · '),
    460,
  );

  ctx.fillStyle = '#ffffffb3';
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText('PLAYER TYPE', PAD, 680);
  ctx.fillStyle = '#4ade80';
  ctx.font = `900 92px ${FONT}`;
  ctx.fillText(fitText(ctx, w.type.name.toUpperCase(), W - PAD * 2), PAD, 780);
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText(fitText(ctx, w.type.why, W - PAD * 2), PAD, 836);

  const tiles = wrappedTiles(w);

  const gap = 24;
  const tileW = (W - PAD * 2 - gap) / 2;
  const tileH = 190;
  const top = 920;
  tiles.forEach((tile, i) => {
    const x = PAD + (i % 2) * (tileW + gap);
    const y = top + Math.floor(i / 2) * (tileH + gap);
    ctx.fillStyle = '#0b1220b3';
    roundRect(ctx, x, y, tileW, tileH, 28);
    ctx.fill();
    ctx.strokeStyle = '#ffffff22';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 88px ${FONT}`;
    ctx.fillText(fitText(ctx, tile.value, tileW - 56), x + 32, y + 104);
    ctx.fillStyle = '#ffffffb3';
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(fitText(ctx, tile.label, tileW - 56), x + 32, y + 152);
  });

  // The stories in a line each.
  const rows = Math.ceil(tiles.length / 2);
  let y = top + rows * (tileH + gap) + 60;
  const lines = [
    w.tournaments.find((t) => t.placing) &&
      w.tournaments
        .filter((t) => t.placing)
        .slice(0, 2)
        .map((t) => `${placingLabel(t.placing)} · ${t.name}`)
        .join('   '),
    w.rival && `Most played: ${w.rival.name} (${w.rival.played}×)`,
    w.busiestMonth && `Busiest month: ${w.busiestMonth.name}`,
    w.training && `${w.training.sessions} training sessions · ${w.training.hours} hours`,
  ].filter((line): line is string => Boolean(line));
  ctx.font = `600 34px ${FONT}`;
  for (const line of lines.slice(0, 4)) {
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fitText(ctx, line, W - PAD * 2), PAD, y);
    y += 58;
  }

  ctx.fillStyle = '#ffffffb3';
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText('Tracked with Matchday', PAD, H - 80);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
