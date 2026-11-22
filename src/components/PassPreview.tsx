import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { playerCard } from '../lib/playerCard';
import { springs } from '../lib/motion';
import type { PositionGroup } from '../types';

/**
 * The player's pass as it's being made: the same pass the Stats screen shows,
 * filling in from setup as it happens. The name types onto it, picking a
 * position swaps in that position's six stats, and the team arrives with its
 * colour. Decorative - everything on it is in the fields below.
 */
export function PassPreview({
  name,
  group,
  position,
  ageGroup,
  team,
  teamColor,
  issued,
}: {
  name: string;
  group: PositionGroup | null;
  position: string;
  ageGroup: string;
  team: string;
  teamColor: string;
  /** Set as setup finishes: a sweep of light across it, the pass handed over. */
  issued: boolean;
}) {
  const codes = group ? playerCard([], { position, positionGroup: group }).stats.map((s) => s.code) : null;
  const sub = [position, ageGroup].filter(Boolean).join(' · ');
  const hasSub = Boolean(sub || team);

  // A sweep each time something lands on it that it didn't have before.
  const [sweep, setSweep] = useState(0);
  const landed = [Boolean(name.trim()), Boolean(group), Boolean(team)].filter(Boolean).length;
  const [seen, setSeen] = useState(landed);
  useEffect(() => {
    if (landed > seen) setSweep((n) => n + 1);
    setSeen(landed);
  }, [landed, seen]);

  return (
    <div className="pass compact" aria-hidden="true">
      <span className="pass-face pass-front">
        <span className="pass-glare" />
        {sweep > 0 && <span key={sweep} className="pass-sweep quick" />}
        {issued && <span className="pass-sweep issued" />}
        <span className="pass-top">
          <span className="pass-brand">MATCHDAY</span>
          <span className="pass-tier">New signing</span>
        </span>
        <span className="pass-main">
          <span className="pass-ring">
            <svg className="ring" width="52" height="52" viewBox="0 0 52 52">
              <circle cx="26" cy="26" r="23" className="ring-track" strokeWidth="5.5" fill="none" />
            </svg>
            <span className="pass-ovr">–</span>
          </span>
          <span className="pass-who">
            <span className={name.trim() ? 'pass-name' : 'pass-name is-empty'}>{name.trim() || 'Your name'}</span>
            <span className={hasSub ? 'pass-sub' : 'pass-sub is-empty'}>
              {hasSub ? sub : 'Position · Age group · Team'}
              {team && (
                <>
                  {sub && ' · '}
                  <span className="pass-team-dot" style={{ background: teamColor }} />
                  {team}
                </>
              )}
            </span>
          </span>
        </span>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={group ?? 'none'}
            className="pass-stats"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={springs.smooth}
          >
            {(codes ?? ['', '', '', '', '', '']).map((code, i) => (
              <span key={i} className="pass-stat">
                <span className="pass-stat-value">–</span>
                <span className="pass-stat-code">{code || ' '}</span>
              </span>
            ))}
          </m.span>
        </AnimatePresence>
      </span>
    </div>
  );
}
