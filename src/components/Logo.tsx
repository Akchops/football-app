import { useId } from 'react';

const PANELS = [
  '666.1,444.6 782.7,408.4 819.0,592.3 680.8,713.2 603.1,621.7',
  '603.1,621.7 680.8,713.2 512.4,814.3 353.5,721.0 420.0,621.7',
  '420.0,621.7 353.5,721.0 205.0,592.3 245.6,401.5 359.6,444.6',
  '359.6,444.6 245.6,401.5 323.3,231.3 510.7,209.7 512.4,337.6',
  '512.4,337.6 666.1,444.6 603.1,621.7 420.0,621.7 359.6,444.6',
];
const LIT = '512.4,337.6 666.1,444.6 782.7,408.4 711.9,220.1 510.7,209.7';

/**
 * Matchday's mark: a faceted ball with one panel lit green. The same artwork as
 * the app icon (docs/brand/matchday-logo.svg), drawn inline and cropped to the
 * ball, without the black tile - so it's sharp at any size, on either theme.
 */
export function Logo({ size = '1em', className }: { size?: number | string; className?: string }) {
  // Gradient ids are page-wide, so each copy of the mark needs its own.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const body = `logo-body-${id}`;
  const lit = `logo-lit-${id}`;
  const halo = `logo-halo-${id}`;
  return (
    <svg
      className={className ? `logo ${className}` : 'logo'}
      viewBox="176 176 672 672"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={body} gradientUnits="userSpaceOnUse" x1="0" y1="209.7" x2="0" y2="814.3">
          <stop offset="0" stopColor="#23272c" />
          <stop offset="1" stopColor="#16191d" />
        </linearGradient>
        <linearGradient id={lit} gradientUnits="userSpaceOnUse" x1="0" y1="209.7" x2="0" y2="814.3">
          <stop offset="0" stopColor="#48E597" />
          <stop offset="1" stopColor="#30D27C" />
        </linearGradient>
        <filter id={halo} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>
      <polygon points={LIT} fill="#30D27C" opacity="0.55" filter={`url(#${halo})`} />
      <g stroke="#000000" strokeWidth="15" strokeLinejoin="round">
        <polygon points={LIT} fill={`url(#${lit})`} />
        {PANELS.map((points) => (
          <polygon key={points} points={points} fill={`url(#${body})`} />
        ))}
      </g>
    </svg>
  );
}
