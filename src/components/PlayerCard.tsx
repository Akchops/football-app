import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, m, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useStore } from '../store/AppStore';
import { playerCard, type CardTier } from '../lib/playerCard';
import { formatDateShort } from '../lib/date';
import { details, prefersReducedMotion, press, springs } from '../lib/motion';
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
    // Private mode or full storage: the pass just won't celebrate next time.
  }
}

/** The rating in a ring, Activity-style: the ring fills to the rating out of 100. */
function RatingRing({ value, size = 92 }: { value: number | null; size?: number }) {
  const stroke = size * 0.11;
  const r = (size - stroke) / 2;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
      <m.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="ring-fill"
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: (value ?? 0) / 100 }}
        transition={{ ...springs.smooth, visualDuration: 0.9 }}
      />
    </svg>
  );
}

/**
 * The player's pass, in the manner of a Wallet pass: their average match
 * score as a ring, six stats from their own logs, the team's colour glowing
 * through. It leans toward a finger, rolls to a new rating with a sweep of
 * light, and turns over when tapped to show the season so far.
 */
export function PlayerCard() {
  const { matches, profile, teams } = useStore();
  const card = useMemo(() => playerCard(matches, profile), [matches, profile]);
  const team = teams[0];

  const before = useRef(lastSeen());
  const [shown, setShown] = useState<number | null>(before.current?.rating ?? card.rating);
  const [sweep, setSweep] = useState(0);
  const [back, setBack] = useState(false);
  const flip = useMotionValue(0);

  useEffect(() => {
    const was = before.current;
    before.current = { rating: card.rating, tier: card.tier };
    remember(card.rating, card.tier);
    if (!was || was.rating === card.rating || card.rating === null || prefersReducedMotion()) {
      setShown(card.rating);
      return;
    }
    const run = animate(was.rating ?? card.rating, card.rating, {
      ...springs.smooth,
      visualDuration: 0.9,
      onUpdate: (v) => setShown(Math.round(v)),
    });
    setSweep((n) => n + 1);
    // A new tier: one full turn, landing on the front.
    if (was.tier !== card.tier && card.tier !== 'none') {
      flip.set(-360);
      animate(flip, 0, springs.bouncy);
    }
    return () => run.stop();
  }, [card.rating, card.tier, flip]);

  useEffect(() => {
    animate(flip, back ? 180 : 0, springs.smooth);
  }, [back, flip]);

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const tiltX = useSpring(useTransform(py, [0, 1], [6, -6]), springs.snappy);
  const tiltY = useSpring(useTransform(px, [0, 1], [-8, 8]), springs.snappy);
  const rotateY = useTransform([tiltY, flip], ([t, f]: number[]) => t + f);
  const glareX = useTransform(px, [0, 1], ['0%', '100%']);
  const glareY = useTransform(py, [0, 1], ['0%', '100%']);
  const track = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion()) return;
    const box = e.currentTarget.getBoundingClientRect();
    // Leans a little past the edge, then gives no further (a soft clamp).
    const clamp = (v: number) => Math.max(-0.1, Math.min(1.1, v));
    const x = clamp((e.clientX - box.left) / box.width);
    const y = clamp((e.clientY - box.top) / box.height);
    px.set(x);
    py.set(y);
    // Under a finger it follows exactly - nothing eases while it's held.
    if (e.buttons > 0 || e.pointerType === 'touch') {
      tiltX.jump(6 - 12 * y);
      tiltY.jump(-8 + 16 * x);
    }
  };
  const settle = () => {
    px.set(0.5);
    py.set(0.5);
  };

  const label =
    card.rating === null
      ? `${profile.name || 'Your'} pass: no rating yet. Log a match to get one.`
      : `${profile.name || 'Your'} pass: ${TIER_NAME[card.tier]}, rated ${card.rating}, ${card.position}. ` +
        card.stats.map((s) => `${s.value} ${s.label}`).join(', ');

  return (
    <div className="pass-stage" onPointerMove={track} onPointerLeave={settle} onPointerUp={settle}>
      <m.button
        type="button"
        className={`pass tier-${card.tier}`}
        style={{ rotateX: tiltX, rotateY, ['--gx' as string]: glareX, ['--gy' as string]: glareY }}
        aria-label={`${label}. Tap to turn it over.`}
        aria-pressed={back}
        onClick={() => setBack((b) => !b)}
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springs.smooth}
        whileTap={{ scale: press, transition: { duration: 0 } }}
      >
        {/* Front */}
        <span className="pass-face pass-front" aria-hidden="true">
          <span className="pass-glare" />
          {sweep > 0 && <span key={sweep} className="pass-sweep" />}
          <m.span className="pass-top" {...details(0, 0.12)}>
            <span className="pass-brand">MATCHDAY</span>
            <span className="pass-tier">{TIER_NAME[card.tier]}</span>
          </m.span>
          <m.span className="pass-main" {...details(1, 0.12)}>
            <span className="pass-ring">
              <RatingRing value={shown} />
              <span className="pass-ovr">{shown ?? '–'}</span>
            </span>
            <span className="pass-who">
              <span className="pass-name">{profile.name || 'Player'}</span>
              <span className="pass-sub">{[card.position, profile.ageGroup, team?.name].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="pass-photo">
              <Avatar photo={profile.photo} name={profile.name} size={46} />
            </span>
          </m.span>
          <span className="pass-stats">
            {card.stats.map((s, i) => (
              <m.span key={s.code} className="pass-stat" {...details(2 + i * 0.4, 0.12)}>
                <span className="pass-stat-value">{s.value}</span>
                <span className="pass-stat-code">{s.code}</span>
              </m.span>
            ))}
          </span>
        </span>

        {/* Back */}
        <span className="pass-face pass-back" aria-hidden="true">
          <span className="pass-top">
            <span className="pass-brand">THE SEASON SO FAR</span>
            <span className="pass-tier">{card.back.record}</span>
          </span>
          <span className="pass-back-row">
            <span className="pass-back-label">Form</span>
            <span className="pass-form">
              {card.back.form.length === 0
                ? '–'
                : card.back.form.map((o, i) => (
                    <span key={i} className={`pass-form-pill outcome-${o.toLowerCase()}`}>
                      {o}
                    </span>
                  ))}
            </span>
          </span>
          <span className="pass-back-row">
            <span className="pass-back-label">Best game</span>
            <span>
              {card.back.best
                ? `${card.back.best.score} vs ${card.back.best.opponent} · ${formatDateShort(card.back.best.date)}`
                : 'Log a match to see it'}
            </span>
          </span>
          <span className="pass-back-row">
            <span className="pass-back-label">Apps</span>
            <span>{card.appearances}</span>
          </span>
          <span className="pass-hint">Tap to turn back</span>
        </span>
      </m.button>
    </div>
  );
}

/** The pass in miniature, for the Calendar's header: the rating ring. */
export function PlayerCardMini({ onOpen }: { onOpen?: () => void }) {
  const { matches, profile } = useStore();
  const card = useMemo(() => playerCard(matches, profile), [matches, profile]);
  return (
    <button
      type="button"
      className="player-card-mini"
      onClick={onOpen}
      aria-label={card.rating === null ? 'Your pass - no rating yet' : `Your pass: rated ${card.rating}, ${TIER_NAME[card.tier]}`}
    >
      <RatingRing value={card.rating} size={50} />
      <span className="player-card-mini-ovr">{card.rating ?? '–'}</span>
    </button>
  );
}
