import { useLayoutEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/motion';

export interface PillOption {
  value: string;
  label: string;
}

/**
 * One choice from a long list, as a row of the app's pills that scrolls
 * sideways - in place of a dropdown. The chosen pill keeps itself in view,
 * including when the choice is made for you (an age group suggested from a
 * birthday).
 */
export function PillRow({
  options,
  value,
  onChange,
  label,
  className,
  reveal = false,
}: {
  options: PillOption[];
  value: string;
  onChange: (value: string) => void;
  /** For screen readers: what's being chosen. */
  label: string;
  className?: string;
  /** Opened by a tap: bring the row into view if it opened below the fold. */
  reveal?: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const el = row.current;
    if (el && first.current && reveal) {
      el.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
    const on = el?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!el || !on) return;
    const left = on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2;
    // Placed at once when it appears; glides there after.
    el.scrollTo({ left, behavior: first.current || prefersReducedMotion() ? 'auto' : 'smooth' });
    first.current = false;
  }, [value]);

  return (
    <div ref={row} className={className ? `chip-scroll pill-row ${className}` : 'chip-scroll pill-row'} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'filter-chip on' : 'filter-chip'}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
