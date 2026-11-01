import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, m, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useStore } from '../store/AppStore';
import { playerCard, type CardTier } from '../lib/playerCard';
import { prefersReducedMotion, springs } from '../lib/motion';
import { Avatar } from './Avatar';

const SEEN_KEY = 'matchday.card.v1';
const TIER_NAME: Record<CardTier, string> = {
  none: 'No rating yet',
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  inform: 'In form',
};

function lastSeen(): { rating: number | null; tier: CardTier } | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as { rating: number | null; tier: CardTier }) : null;
  } catch {
    return null;
  }
}

function remember(rating: number | null, tier: CardTier): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ rating, tier }));
  } catch {
    // Private mode or full storage: the card just won't celebrate next time.
  }
}

/**
 * The player's card, in the style of the game's Ultimate Team cards: the
 * rating is their average match score, the six stats are their own totals,
 * the trim is their team's kit colour.
 *
 * Its moments: it leans toward a finger dragged across it; when a new result
 * moves the rating, the number rolls there and a light sweeps across; going up
 * a tier turns the card over to reveal the new one.
 */
export function PlayerCard() {
  const { matches, profile, teams } = useStore();
  const card = useMemo(() => playerCard(matches, profile), [matches, profile]);
  const kit = teams[0]?.color || 'var(--accent)';

  // What the player saw last time decides whether there's anything to celebrate.
  const before = useRef(lastSeen());
  const [shown, setShown] = useState<number | null>(before.current?.rating ?? card.rating);
  const [sweep, setSweep] = useState(0);
  const flip = useMotionValue(0);

  useEffect(() => {
    const was = before.current;
    before.current = { rating: card.rating, tier: card.tier };
    remember(card.rating, card.tier);
    if (!was || was.rating === card.rating || card.rating === null || prefersReducedMotion()) {
      setShown(card.rating);
      return;
    }
    // Roll from the old rating to the new one, then the light sweep.
    const from = was.rating ?? card.rating;
    const run = animate(from, card.rating, {
      ...springs.smooth,
      visualDuration: 0.8,
      onUpdate: (v) => setShown(Math.round(v)),
    });
    setSweep((n) => n + 1);
    if (was.tier !== card.tier && card.tier !== 'none') {
      flip.set(180);
      animate(flip, 0, springs.bouncy);
    }
    return () => run.stop();
  }, [card.rating, card.tier, flip]);

  // Leans toward the finger, springing back when it lets go.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const tiltX = useSpring(useTransform(py, [0, 1], [7, -7]), springs.snappy);
  const tiltY = useSpring(useTransform(px, [0, 1], [-9, 9]), springs.snappy);
  const rotateY = useTransform([tiltY, flip], ([t, f]: number[]) => t + f);
  const glareX = useTransform(px, [0, 1], ['10%', '90%']);
  const glareY = useTransform(py, [0, 1], ['0%', '100%']);
  const track = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion()) return;
    const box = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - box.left) / box.width);
    py.set((e.clientY - box.top) / box.height);
  };
  const settle = () => {
    px.set(0.5);
    py.set(0.5);
  };

  const label = card.rating === null
    ? `${profile.name || 'Your'} card: no rating yet. Log a match to get one.`
    : `${profile.name || 'Your'} card: ${TIER_NAME[card.tier]}, rated ${card.rating}, ${card.position}. ` +
      card.stats.map((s) => `${s.value} ${s.label}`).join(', ');

  return (
    <div className="player-card-stage" onPointerMove={track} onPointerLeave={settle} onPointerUp={settle}>
      <m.div
        className={`player-card tier-${card.tier}`}
        style={{ rotateX: tiltX, rotateY, ['--kit' as string]: kit }}
        role="img"
        aria-label={label}
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springs.smooth}
      >
        <m.div className="player-card-glare" style={{ ['--gx' as string]: glareX, ['--gy' as string]: glareY }} aria-hidden="true" />
        {sweep > 0 && <span key={sweep} className="player-card-sweep" aria-hidden="true" />}
        <div className="player-card-top" aria-hidden="true">
          <div className="player-card-rating">
            <span className="player-card-ovr">{shown ?? '–'}</span>
            <span className="player-card-pos">{card.position}</span>
            <span className="player-card-kit" />
          </div>
          <div className="player-card-photo">
            <Avatar photo={profile.photo} name={profile.name} size={92} />
          </div>
        </div>
        <div className="player-card-name" aria-hidden="true">
          {profile.name || 'Player'}
        </div>
        <dl className="player-card-stats" aria-hidden="true">
          {card.stats.map((s) => (
            <div key={s.code}>
              <dd>{s.value}</dd>
              <dt>{s.code}</dt>
            </div>
          ))}
        </dl>
        <div className="player-card-foot" aria-hidden="true">
          {card.rating === null ? 'Log a match to get your rating' : `${TIER_NAME[card.tier]} · ${card.appearances} apps`}
        </div>
      </m.div>
    </div>
  );
}

/** The card in miniature, for the Calendar's header: rating, position, tier colour. */
export function PlayerCardMini({ onOpen }: { onOpen?: () => void }) {
  const { matches, profile } = useStore();
  const card = useMemo(() => playerCard(matches, profile), [matches, profile]);
  return (
    <button
      type="button"
      className={`player-card-mini tier-${card.tier}`}
      onClick={onOpen}
      aria-label={card.rating === null ? 'Your card - no rating yet' : `Your card: rated ${card.rating}, ${TIER_NAME[card.tier]}`}
    >
      <span className="player-card-mini-ovr">{card.rating ?? '–'}</span>
      <span className="player-card-mini-pos">{card.position}</span>
    </button>
  );
}
