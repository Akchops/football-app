/** Line icons, sized by font-size and coloured by currentColor. */
const base = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function CalendarIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <circle cx="8.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="17.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BallIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.4l3.6 2.6-1.4 4.3H9.8L8.4 10z" />
      <path d="M12 3.2v4.2M3.6 10.4l4.8-.4M20.4 10.4l-4.8-.4M7.3 19.6l2.5-5.3M16.7 19.6l-2.5-5.3" />
    </svg>
  );
}

export function ChartIcon() {
  return (
    <svg {...base}>
      <path d="M4 20h16" />
      <rect x="5.5" y="12" width="3.4" height="6" rx="1.2" />
      <rect x="10.3" y="7" width="3.4" height="11" rx="1.2" />
      <rect x="15.1" y="4" width="3.4" height="14" rx="1.2" />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.1 14.2a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5v.2a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H1.8a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1A2 2 0 116 2.6l.1.1a1.6 1.6 0 001.8.3H8a1.6 1.6 0 001-1.5V1.4a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V8a1.6 1.6 0 001.5 1h.2a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" transform="translate(0.5 0.5) scale(0.92)" />
    </svg>
  );
}
