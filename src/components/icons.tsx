/**
 * Icons drawn in the manner of Apple's SF Symbols: one 2px rounded stroke,
 * simple geometry, and a filled variant for the selected tab (`on`), as iOS
 * does. Sized by font-size and coloured by currentColor.
 */
type IconProps = { on?: boolean };

const base = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};
const solid = { fill: 'currentColor', stroke: 'none' };

export function CalendarIcon({ on }: IconProps = {}) {
  return (
    <svg {...base}>
      <rect x="3.5" y="4.5" width="17" height="16" rx="3.5" fill={on ? 'currentColor' : 'none'} />
      <path d="M3.5 9.5h17" stroke={on ? 'var(--tab-cut, #fff)' : 'currentColor'} />
      <path d="M8 2.8v3.4M16 2.8v3.4" />
      <g {...solid} fill={on ? 'var(--tab-cut, #fff)' : 'currentColor'}>
        <circle cx="8.3" cy="13.6" r="1.25" />
        <circle cx="12" cy="13.6" r="1.25" />
        <circle cx="15.7" cy="13.6" r="1.25" />
        <circle cx="8.3" cy="17.2" r="1.25" />
        <circle cx="12" cy="17.2" r="1.25" />
      </g>
    </svg>
  );
}

export function BallIcon({ on }: IconProps = {}) {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" fill={on ? 'currentColor' : 'none'} />
      <g stroke={on ? 'var(--tab-cut, #fff)' : 'currentColor'} strokeWidth="1.7">
        <path d="M12 7.6l3.5 2.5-1.3 4.1H9.8l-1.3-4.1z" fill={on ? 'var(--tab-cut, #fff)' : 'none'} />
        <path d="M12 3.4v4.2M4 10.2l4.5-.1M20 10.2l-4.5-.1M7.4 19.3l2.4-5.1M16.6 19.3l-2.4-5.1" />
      </g>
    </svg>
  );
}

export function ChartIcon({ on }: IconProps = {}) {
  const fill = on ? 'currentColor' : 'none';
  return (
    <svg {...base}>
      <rect x="4" y="12.5" width="4" height="7.5" rx="1.4" fill={fill} />
      <rect x="10" y="8" width="4" height="12" rx="1.4" fill={fill} />
      <rect x="16" y="3.8" width="4" height="16.2" rx="1.4" fill={fill} />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg {...base}>
      <path d="M10.3 3.2h3.4l.6 2.4 1.7.9 2.3-.9 1.7 2.9-1.8 1.7v1.9l1.8 1.6-1.7 3-2.3-.9-1.7.9-.6 2.5h-3.4l-.6-2.5-1.7-.9-2.3.9-1.7-3 1.8-1.6v-1.9L3.5 8.5l1.7-2.9 2.3.9 1.7-.9z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

export function MediaIcon({ on }: IconProps = {}) {
  return (
    <svg {...base}>
      <rect x="2.8" y="5" width="18.4" height="14" rx="3.5" fill={on ? 'currentColor' : 'none'} />
      <path d="M10.2 9.4v5.2l4.6-2.6z" {...solid} fill={on ? 'var(--tab-cut, #fff)' : 'currentColor'} />
    </svg>
  );
}

export function CoachIcon({ on }: IconProps = {}) {
  // A whistle: the coach.
  return (
    <svg {...base}>
      <path
        d="M4 11.5a5.5 5.5 0 1011 0v-.5h4.5a1.5 1.5 0 001.5-1.5V8.5a1.5 1.5 0 00-1.5-1.5H9.5A5.5 5.5 0 004 11.5z"
        fill={on ? 'currentColor' : 'none'}
      />
      <circle cx="9.5" cy="12" r="1.6" {...solid} fill={on ? 'var(--tab-cut, #fff)' : 'currentColor'} />
      <path d="M8 4.2l1 2" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...base} strokeWidth={2.6}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function TrophyIcon() {
  return (
    <svg {...base}>
      <path d="M7.5 4h9v5a4.5 4.5 0 01-9 0z" />
      <path d="M7.5 6H4.5a3 3 0 003 4M16.5 6h3a3 3 0 01-3 4M12 13.5V17M8.5 20h7M9.5 17h5" />
    </svg>
  );
}

export function RunIcon() {
  return (
    <svg {...base}>
      <circle cx="14.5" cy="4.5" r="1.8" {...solid} />
      <path d="M8 20.5l3-5 3 2.5 1-6 3 3h2.5M12.5 9.5L9 8.5 6 11M14 11.5l-3 4" />
    </svg>
  );
}

export function PasteIcon() {
  return (
    <svg {...base}>
      <rect x="5" y="4.5" width="14" height="16.5" rx="3" />
      <path d="M9 4.5V3.8A1.3 1.3 0 0110.3 2.5h3.4A1.3 1.3 0 0115 3.8v.7M9 11h6M9 15h4" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg {...base} strokeWidth={2.4}>
      <path d="M9.5 6l6 6-6 6" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg {...base}>
      <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13M10 10.5v6M14 10.5v6" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg {...base}>
      <path d="M15.5 4.5l4 4L9 19H5v-4z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

export function NoEntryIcon() {
  // "Called off": a circle with a bar.
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M7.5 12h9" />
    </svg>
  );
}

export function WhistleResultIcon() {
  // "Enter result": a scoreboard.
  return (
    <svg {...base}>
      <rect x="3" y="5.5" width="18" height="13" rx="3" />
      <path d="M12 8.5v7M7.2 10.5l1-1v5M15 10.2a1.6 1.6 0 113 .6l-3 3.7h3" />
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg {...base}>
      <path d="M12 3l7.5 3v5.5c0 4.7-3.3 8.1-7.5 9.5-4.2-1.4-7.5-4.8-7.5-9.5V6z" />
      <path d="M12 7.5v9M8.5 11h7" strokeWidth="1.7" />
    </svg>
  );
}

export function HomeIcon({ on }: IconProps = {}) {
  return (
    <svg {...base}>
      <path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 01-1.5 1.5h-4v-6h-5v6h-4A1.5 1.5 0 014 19z" fill={on ? 'currentColor' : 'none'} />
    </svg>
  );
}

export function PeopleIcon({ on }: IconProps = {}) {
  const fill = on ? 'currentColor' : 'none';
  return (
    <svg {...base}>
      <circle cx="9" cy="8" r="3.3" fill={fill} />
      <path d="M2.8 19.5c.6-3.4 3.1-5.3 6.2-5.3s5.6 1.9 6.2 5.3z" fill={fill} />
      <circle cx="16.8" cy="9" r="2.6" />
      <path d="M17.2 14.3c2.3.3 3.7 1.9 4.1 4.6" />
    </svg>
  );
}

export function ShirtIcon({ on }: IconProps = {}) {
  return (
    <svg {...base}>
      <path
        d="M9 3.5l3 2 3-2 5.5 3-1.8 4.3-2.2-.9V20.5h-9V9.9l-2.2.9L3.5 6.5z"
        fill={on ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

export function TableIcon({ on }: IconProps = {}) {
  return (
    <svg {...base}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" fill={on ? 'currentColor' : 'none'} />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" stroke={on ? 'var(--tab-cut, #fff)' : 'currentColor'} />
    </svg>
  );
}

export function SyncIcon() {
  return (
    <svg {...base}>
      <path d="M19.5 9A7.8 7.8 0 005.6 7M4.5 15a7.8 7.8 0 0013.9 2" />
      <path d="M19.8 4.5V9h-4.5M4.2 19.5V15h4.5" />
    </svg>
  );
}

export function SendIcon() {
  // Messages' send: an arrow up.
  return (
    <svg {...base} strokeWidth={2.6}>
      <path d="M12 19V5.5M6 11l6-6 6 6" />
    </svg>
  );
}

export function ComposeIcon() {
  // A pencil on a page: a new conversation.
  return (
    <svg {...base}>
      <path d="M12 4.5H7a3 3 0 00-3 3v9.5a3 3 0 003 3h9.5a3 3 0 003-3V12" />
      <path d="M17.6 3.6a1.9 1.9 0 012.8 2.8L12.5 14.3l-3.5.9.9-3.5z" />
    </svg>
  );
}

export function FilmIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="4" width="18" height="16" rx="3.5" />
      <path d="M7.5 4v16M16.5 4v16M3 9.5h4.5M3 14.5h4.5M16.5 9.5H21M16.5 14.5H21" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...base} strokeWidth={2.6}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function StarIcon({ on }: IconProps = {}) {
  return (
    <svg {...base}>
      <path
        d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"
        fill={on ? 'currentColor' : 'none'}
      />
    </svg>
  );
}
