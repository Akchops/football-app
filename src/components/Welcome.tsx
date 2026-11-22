import { m } from 'motion/react';
import { springs } from '../lib/motion';
import { AssemblingBall } from './Logo';

/**
 * The brand's big moment, the way the brand board sets it: the ball, the name
 * in condensed capitals, and the line it all follows from. The words rise in
 * once the ball has put itself together.
 */
export function BrandHero({ compact = false }: { compact?: boolean }) {
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { ...springs.smooth, delay },
  });
  return (
    <div className={compact ? 'brand-hero compact' : 'brand-hero'}>
      <AssemblingBall size={compact ? 76 : 116} />
      <m.h1 className="brand-hero-name" {...rise(0.35)}>
        Matchday
      </m.h1>
      <m.p className="brand-hero-line" {...rise(0.5)}>
        The ball is the team.
        <br />
        <span>The lit panel is you.</span>
      </m.p>
    </div>
  );
}

/**
 * The first screen on a phone without accounts: who Matchday is for and what
 * it does, in a line, then straight in. With accounts, signing in is this.
 */
export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <>
      <div className="onboard-body welcome">
        <BrandHero />
        <m.p
          className="welcome-lead"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.7 }}
        >
          Every match, training session and stat in one place, and a player pass that grows with you.
        </m.p>
      </div>
      <div className="onboard-foot stacked">
        <button className="primary-btn wide" onClick={onStart}>
          Get started
        </button>
        <p className="muted small">Takes a minute. Everything stays on this phone.</p>
      </div>
    </>
  );
}
