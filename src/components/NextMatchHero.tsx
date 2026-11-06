import { useEffect, useState } from 'react';
import { m } from 'motion/react';
import { useStore } from '../store/AppStore';
import type { Match } from '../types';
import { formatDateShort, formatTime, kickoffAt } from '../lib/date';
import { stageName } from '../lib/stage';
import { details, press, rememberOrigin, springs } from '../lib/motion';

/** Days, hours, minutes and seconds to kick-off - for the ticking countdown. */
function untilKickoff(at: Date, now: number): { d: number; h: number; m: number; s: number } {
  const left = Math.max(0, Math.floor((at.getTime() - now) / 1000));
  return { d: Math.floor(left / 86400), h: Math.floor((left % 86400) / 3600), m: Math.floor((left % 3600) / 60), s: left % 60 };
}

/**
 * The top of Matches: the next game, big, with a countdown that ticks every
 * second and the team's colour glowing behind it. Tap to open the match.
 */
export function NextMatchHero({ match, onOpen }: { match: Match; onOpen: () => void }) {
  const { competitionOf, teamOf } = useStore();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const at = kickoffAt(match.date, match.time);
  const left = untilKickoff(at, now);
  const competition = competitionOf(match);
  const team = teamOf(match);
  const eyebrow = ['Next up', competition?.name, stageName(match.stage, match.stageDetail)].filter(Boolean).join(' · ');
  const units: [number, string][] = [
    [left.d, 'days'],
    [left.h, 'hrs'],
    [left.m, 'min'],
    [left.s, 'sec'],
  ];

  return (
    <m.button
      type="button"
      className="hero"
      style={{ ['--glow' as string]: team?.color || 'var(--accent)' }}
      onClick={(e) => {
        rememberOrigin(e.currentTarget);
        onOpen();
      }}
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={springs.smooth}
      whileTap={{ scale: press, transition: { duration: 0 } }}
    >
      {/* The details settle in order: what it is, who, how long, where. */}
      <m.span className="hero-eyebrow" {...details(0)}>{eyebrow}</m.span>
      <m.span className="hero-title" {...details(1)}>
        <span className="vs">{match.venue === 'away' ? '@' : 'vs'}</span> {match.opponent || 'TBC'}
      </m.span>
      <m.span {...details(2)} className="hero-count" aria-label={`Kick-off in ${left.d} days, ${left.h} hours and ${left.m} minutes`}>
        {units.map(([value, label]) => (
          <span key={label} className="hero-unit" aria-hidden="true">
            <span className="hero-num">{String(value).padStart(2, '0')}</span>
            <span className="hero-label">{label}</span>
          </span>
        ))}
      </m.span>
      <m.span className="hero-meta" {...details(3)}>
        {[formatDateShort(match.date), formatTime(match.time), match.location].filter(Boolean).join(' · ')}
      </m.span>
    </m.button>
  );
}
