import { useState } from 'react';
import { useInstall } from '../lib/install';

/**
 * Nudge to install to the home screen, so it opens like any other app -
 * full screen, own icon, and works with no signal.
 */
export function InstallBanner() {
  const install = useInstall();
  const [showSteps, setShowSteps] = useState(false);

  if (install.installed || install.dismissed) return null;
  if (!install.canPrompt && !install.needsManualSteps) return null;

  return (
    <div className="install-banner">
      <div className="install-row">
        <span className="install-icon" aria-hidden="true">
          ⚽
        </span>
        <div className="install-text">
          <strong>Add Matchday to your home screen</strong>
          <span>Opens full screen, with its own icon, and works without signal.</span>
        </div>
        <button className="icon-btn" onClick={install.dismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>

      {install.canPrompt ? (
        <button className="primary-btn small" onClick={() => void install.install()}>
          Install app
        </button>
      ) : (
        <button className="ghost-btn" onClick={() => setShowSteps((s) => !s)}>
          {showSteps ? 'Hide steps' : 'How to add it'}
        </button>
      )}

      {showSteps && (
        <ol className="install-steps">
          <li>
            Tap the <strong>Share</strong> button at the bottom of Safari
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong>
          </li>
          <li>
            Tap <strong>Add</strong> — Matchday appears with your other apps
          </li>
        </ol>
      )}
    </div>
  );
}
