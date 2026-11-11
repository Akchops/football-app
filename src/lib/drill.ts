/**
 * The outage drill: a switch in Setup that makes this one phone behave as if
 * Matchday's account server were down, so what everyone would see - the banner,
 * the details behind it, changes waiting and then catching up - can be tried
 * out on a quiet afternoon rather than discovered during the real thing.
 *
 * It works at the lowest level there is: every request to the account server
 * fails the way it does when that server can't be reached (src/lib/supabase.ts).
 * Nothing else is touched, and switching it off is all it takes to catch up.
 */

const KEY = 'matchday.outageDrill';
const EVENT = 'matchday:drill';

export function drillOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setDrill(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: there's no drill to run, and no harm in that.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function onDrillChange(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
