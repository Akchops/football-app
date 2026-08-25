import { useRegisterSW } from 'virtual:pwa-register/react';

const HOURLY = 60 * 60 * 1000;

/**
 * Ask the browser whether a new version has shipped.
 *
 * Browsers only re-check the service worker on a real navigation. An installed
 * app reopened from the home screen or resumed from the app switcher is not a
 * navigation, so on iOS in particular nothing ever asks - and the app can sit on
 * a stale build indefinitely, however many times it is force-quit. Checking each
 * time it comes back to the foreground is what makes a deploy actually arrive.
 */
function watchForUpdates(registration: ServiceWorkerRegistration) {
  const check = () => {
    if (document.visibilityState === 'visible') void registration.update();
  };
  check();
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  // Covers an app left open for days, which a phone on a sideline often is.
  window.setInterval(check, HOURLY);
}

/**
 * A new version has been deployed. The reload is offered rather than forced,
 * so it can never interrupt someone mid-way through logging a result.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) watchForUpdates(registration);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="update-bar" role="status">
      <span>A new version of Matchday is ready.</span>
      <div className="update-actions">
        <button className="ghost-btn" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
        <button className="primary-btn small" onClick={() => void updateServiceWorker(true)}>
          Reload
        </button>
      </div>
    </div>
  );
}
