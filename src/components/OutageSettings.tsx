import { useStatus } from '../store/StatusProvider';
import { useSync } from '../store/SyncProvider';
import { Section } from './ui';

/**
 * Setup's outage drill: this phone acts as if Matchday's server were down, so
 * the banner, what it says and the catching up afterwards can be seen for real
 * without waiting for a real outage. Only in a build with an account server -
 * without one there's nothing to go down.
 */
export function OutageSettings() {
  const sync = useSync();
  const status = useStatus();
  if (!sync.available) return null;

  return (
    <Section grouped title="If Matchday's server goes down">
      <p className="muted small">
        The app carries on: everything you log is saved on this phone and syncs once the server is back. A banner at
        the top says what&apos;s going on and what still works, and the app checks again every 30 seconds by itself.
      </p>
      <label className="toggle-row">
        <input type="checkbox" checked={status.drill} onChange={(e) => status.setDrill(e.target.checked)} />
        <span>Practise it on this phone</span>
      </label>
      <p className="muted small">
        {status.drill
          ? 'This phone is acting as if the server were down. Nothing else is affected, and nothing is lost - switch it off and everything catches up.'
          : "Makes this phone act as if the server were down, until you switch it off. Other phones aren't affected."}
      </p>
    </Section>
  );
}
