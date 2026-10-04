import type { AppMode } from '../store/AcademyProvider';
import { BallIcon, ShieldIcon } from './icons';

/**
 * The very first question on a new phone, once academies exist: one player's
 * matches, or an academy's whole set-up. Either can add the other later.
 */
export function WhoIsThisFor({ onPick }: { onPick: (mode: AppMode) => void }) {
  return (
    <div className="onboarding">
      <div className="onboard-top">
        <div className="onboard-brand">Matchday</div>
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
              One player&apos;s matches, training and stats. Works on this phone with no account.
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
              Squads, league tables and players&apos; stats for picking teams, shared with your coaches. Needs an
              account.
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
