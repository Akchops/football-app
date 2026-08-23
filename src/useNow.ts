import { useEffect, useState } from 'react';

/**
 * A clock that ticks every `intervalMs` and immediately re-reads the time when
 * the app is brought back to the foreground - that's what makes the result
 * prompt appear the moment you reopen the app after kickoff.
 */
export function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, [intervalMs]);

  return now;
}
