import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * A new version has been deployed. The reload is offered rather than forced,
 * so it can never interrupt someone mid-way through logging a result.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

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
