import { directionsUrl } from '../lib/maps';
import { PinIcon } from './icons';

/**
 * The ground, tappable straight into the phone's maps app. Just the name when
 * there's nothing a map could find, like a bare "Pitch 3".
 */
export function GroundLink({ location, className = 'link-btn' }: { location: string; className?: string }) {
  const url = directionsUrl(location);
  if (!url) return <>{location}</>;
  return (
    <a className={`${className} ground-link`} href={url} target="_blank" rel="noopener noreferrer">
      <PinIcon /> {location}
      <span className="sr-only"> (opens in Maps)</span>
    </a>
  );
}
