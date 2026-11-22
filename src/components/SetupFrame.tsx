import type { ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Logo } from './Logo';

export type SetupScreenKey = 'opening' | 'welcome' | 'signin' | 'checking' | 'who' | 'setup';

/** Screens that show the brand big themselves, so the small one in the corner steps aside. */
const HERO: SetupScreenKey[] = ['welcome', 'signin'];

/**
 * One frame for everything before the app: opening, signing in, looking for
 * the account's player, who it's for, and setup. The brand stays put while
 * what's under it cross-fades, so getting started reads as one place rather
 * than five pages. Every screen returns it from the same spot in App, so React
 * keeps this one and only the screen inside changes.
 */
export function SetupFrame({ screen, children }: { screen: SetupScreenKey; children: ReactNode }) {
  return (
    <div className="onboarding">
      <div className="onboard-top">
        <m.div
          className="onboard-brand"
          initial={false}
          animate={{ opacity: HERO.includes(screen) ? 0 : 1 }}
          transition={{ duration: 0.25 }}
          aria-hidden={HERO.includes(screen) || undefined}
        >
          <Logo />
          Matchday
        </m.div>
      </div>
      <div className="onboard-stage">
        <AnimatePresence initial={false}>
          <m.div
            key={screen}
            className="onboard-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.3, ease: 'easeOut' } }}
            // The old screen gets out of the way quicker than the new one arrives, so the two never muddle.
            exit={{ opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } }}
          >
            {children}
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
