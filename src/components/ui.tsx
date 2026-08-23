import { useEffect, type ReactNode } from 'react';

export function Sheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  dismissible = true,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={dismissible ? onClose : undefined}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-grip" />
          <div className="sheet-titles">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {dismissible && (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'seg on' : 'seg'}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  accent,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  accent?: boolean;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className={accent ? 'stepper accent' : 'stepper'}>
      <span className="stepper-label">{label}</span>
      <div className="stepper-controls">
        <button type="button" onClick={() => onChange(clamp(value - step))} aria-label={`Decrease ${label}`}>
          −
        </button>
        <span className="stepper-value">{value}</span>
        <button type="button" onClick={() => onChange(clamp(value + step))} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: string;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function StatTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: 'win' | 'loss' | 'draw' }) {
  return (
    <div className={tone ? `tile tone-${tone}` : 'tile'}>
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
