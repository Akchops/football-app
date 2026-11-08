import type { AppMode } from '../store/AcademyProvider';
import { useSync } from '../store/SyncProvider';
import { BallIcon, ShieldIcon } from './icons';
import { Logo } from './Logo';

/**
 * The very first question on a new phone, once academies exist: one player's
 * matches, or an academy's whole set-up. Either can add the other later.
 */
export function WhoIsThisFor({ onPick }: { onPick: (mode: AppMode) => void }) {
  const sync = useSync();
  return (
    <div className="onboarding">
      <div className="onboard-top">
        <div className="onboard-brand">
          <Logo />
          Matchday
        </div>
      </div>
      <div className="onboard-body">
        <h1>Who&apos;s this for?</h1>
        <p className="onboard-lead">Pick one to start. You can add the other later.</p>

        <button type="button" className="who-card" onClick={() => onPick('player')}>
          <span className="who-icon">
            <BallIcon />
          </span>
          <span className="who-text">
            <span className="who-name">Me or my child</span>
            <span className="who-blurb">
              One player&apos;s matches, training and stats.
            </span>
          </span>
        </button>

        <button type="button" className="who-card" onClick={() => onPick('academy')}>
          <span className="who-icon">
            <ShieldIcon />
          </span>
          <span className="who-text">
            <span className="who-name">An academy</span>
            <span className="who-blurb">
              Squads, league tables and players&apos; stats for picking teams, shared with your coaches.
            </span>
          </span>
        </button>

        {sync.account && (
          <p className="muted small">
            Signed in as {sync.account.email} ·{' '}
            <button className="link-btn inline" onClick={() => void sync.signOut()}>
              Use a different email
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
