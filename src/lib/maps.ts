/**
 * Directions to a ground. The ground is free text - "Central Playing Fields,
 * Pitch 3" - so it goes to the phone's maps app as a search, which shows the
 * place before anyone sets off, rather than as a route to whatever a map
 * guessed it meant.
 */

/** "Pitch 3", "pitch: 4b", "Field 2", "Pitches 1-4" - which pitch, not where the ground is. */
const PITCH = /^(pitch(es)?|field|court)\b\s*[:#.]?\s*(no\.?\s*)?[0-9a-z]{1,3}([-–][0-9a-z]{1,3})?$/i;

/**
 * What to search a map for. The pitch number is dropped: a map knows the
 * fields but not which pitch, and "Pitch 3" on its own would find a pitch
 * anywhere. Empty when there's nothing left to search for.
 */
export function mapsQuery(location: string): string {
  const parts = location
    .replace(/[()]/g, ',')
    .split(/\s*,\s*|\s+[-–—]\s+/)
    .map((part) => part.trim())
    .filter((part) => part !== '' && !PITCH.test(part));
  return parts.join(', ');
}

export type MapsApp = 'apple' | 'google';

/** Apple Maps on iPhones, iPads and Macs - its links open the Maps app there; Google Maps everywhere else. */
export function preferredMapsApp(): MapsApp {
  if (typeof navigator === 'undefined') return 'google';
  const ua = navigator.userAgent;
  // iPadOS asks for desktop sites, so it says "Macintosh" - which Apple Maps also suits.
  return /iPhone|iPad|iPod|Macintosh/.test(ua) ? 'apple' : 'google';
}

/** A link that opens the ground in the maps app, or null when there's no ground to find. */
export function directionsUrl(location: string, app: MapsApp = preferredMapsApp()): string | null {
  const query = mapsQuery(location);
  if (!query) return null;
  const q = encodeURIComponent(query);
  return app === 'apple'
    ? `https://maps.apple.com/?q=${q}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
}
