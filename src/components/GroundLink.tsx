import { directionsUrl } from '../lib/maps';

/**
 * The ground, tappable straight into the phone's maps app. Just the name when
 * there's nothing a map could find, like a bare "Pitch 3".
 */
export function GroundLink({ location, className = 'link-btn' }: { location: string; className?: string }) {
  const url = directionsUrl(location);
  if (!url) return <>{location}</>;
  return (
    <a className={`${className} ground-link`} href={url} target="_blank" rel="noopener noreferrer">
      <span aria-hidden="true">📍</span> {location}
      <span className="sr-only"> (opens in Maps)</span>
    </a>
  );
}
