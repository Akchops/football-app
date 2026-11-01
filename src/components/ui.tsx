import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, m, useDragControls, useMotionValue, useTransform, type PanInfo } from 'motion/react';
import { prefersReducedMotion, sheetOpened, springs } from '../lib/motion';

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
  if (!open) return null;
  // On <body>, not inside the app: the app shrinks back while a sheet is up,
  // and a sheet inside it would shrink with it.
  return createPortal(
    <SheetFrame title={title} subtitle={subtitle} onClose={onClose} footer={footer} dismissible={dismissible}>
      {children}
    </SheetFrame>,
    document.body,
  );
}

/**
 * The iOS sheet: rises on a spring while the screen behind sinks back, and
 * follows a finger pulled down from its top - let go past a third of the way,
 * or with a flick, and it carries on down at that speed; otherwise it springs
 * back. However it closes, it slides away rather than vanishing.
 */
function SheetFrame({
  title,
  subtitle,
  onClose,
  children,
  footer,
  dismissible,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  dismissible: boolean;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);
  const y = useMotionValue(0);
  const drag = useDragControls();
  // The dimming lifts as the sheet is pulled down, so the gesture reads as "putting it away".
  const height = () => panelRef.current?.offsetHeight ?? 600;
  const dim = useTransform(y, (v) => 1 - Math.min(1, Math.max(0, v) / height()) * 0.9);

  // Slide down and away, then hand over. Starts from the finger's speed when there is one.
  const leave = (velocity = 0) => {
    if (leaving.current) return;
    leaving.current = true;
    if (prefersReducedMotion()) return onClose();
    animate(y, height(), { ...springs.smooth, velocity }).then(onClose);
  };

  useEffect(() => {
    const done = sheetOpened();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) leave();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      done();
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissible]);

  // Closed from outside (saved, or another sheet took over): slide a copy of
  // what was on screen away, so it never just blinks out.
  useLayoutEffect(() => {
    const backdrop = backdropRef.current;
    return () => {
      if (leaving.current || !backdrop || prefersReducedMotion()) return;
      ghostAway(backdrop);
    };
  }, []);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (!dismissible) return;
    if (info.offset.y > height() / 3 || info.velocity.y > 650) leave(info.velocity.y);
    else animate(y, 0, { ...springs.snappy, velocity: info.velocity.y });
  };

  return (
    <div className="sheet-layer">
      <m.div
        ref={backdropRef}
        className="sheet-backdrop"
        style={{ opacity: dim }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={springs.smooth}
        onClick={dismissible ? () => leave() : undefined}
      />
      <m.div
        ref={panelRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ y }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={springs.smooth}
        drag={dismissible ? 'y' : false}
        dragListener={false}
        dragControls={drag}
        dragConstraints={{ top: 0, bottom: 0 }}
        // Pulling up gives a little and stops, like the real thing; pulling down follows the finger.
        dragElastic={{ top: 0.04, bottom: 1 }}
        dragMomentum={false}
        onDragEnd={onDragEnd}
      >
        <div
          className="sheet-head"
          onPointerDown={dismissible ? (e) => drag.start(e) : undefined}
          style={dismissible ? { touchAction: 'none' } : undefined}
        >
          <div className="sheet-grip" />
          <div className="sheet-titles">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {dismissible && (
            <button
              className="icon-btn"
              onClick={() => leave()}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </m.div>
    </div>
  );
}

/** A still copy of a closing sheet, slid off screen and dropped - the exit for sheets closed from outside. */
function ghostAway(backdrop: HTMLElement): void {
  const layer = backdrop.parentElement;
  const panel = layer?.querySelector<HTMLElement>('.sheet');
  if (!layer || !panel) return;
  const copy = layer.cloneNode(true) as HTMLElement;
  // Typed text lives on the elements, not in the markup a copy is made from.
  const from = layer.querySelectorAll<HTMLInputElement>('input, textarea, select');
  copy.querySelectorAll<HTMLInputElement>('input, textarea, select').forEach((el, i) => {
    if (from[i]) el.value = from[i].value;
  });
  copy.setAttribute('aria-hidden', 'true');
  copy.removeAttribute('role');
  copy.querySelectorAll('[role="dialog"]').forEach((el) => el.removeAttribute('role'));
  copy.style.pointerEvents = 'none';
  copy.classList.add('sheet-ghost');
  document.body.appendChild(copy);
  const ghostPanel = copy.querySelector<HTMLElement>('.sheet');
  const ghostBackdrop = copy.querySelector<HTMLElement>('.sheet-backdrop');
  const ease = 'cubic-bezier(0.32, 0.72, 0, 1)';
  ghostBackdrop?.animate([{ opacity: getComputedStyle(backdrop).opacity }, { opacity: 0 }], { duration: 320, easing: ease, fill: 'forwards' });
  const run = ghostPanel?.animate(
    [{ transform: getComputedStyle(panel).transform === 'none' ? 'translateY(0)' : getComputedStyle(panel).transform }, { transform: 'translateY(100%)' }],
    { duration: 380, easing: ease, fill: 'forwards' },
  );
  const drop = () => copy.remove();
  if (run) run.onfinish = drop;
  window.setTimeout(drop, 600);
}

/**
 * A labelled form field. `group` is for a row of buttons rather than one
 * input: a <label> passes a tap anywhere on its text to the first button
 * inside it, so a group gets a plain labelled container instead.
 */
export function Field({
  label,
  hint,
  group = false,
  children,
}: {
  label: string;
  hint?: string;
  group?: boolean;
  children: ReactNode;
}) {
  const body = (
    <>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </>
  );
  return group ? (
    <div className="field" role="group" aria-label={label}>
      {body}
    </div>
  ) : (
    <label className="field">{body}</label>
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
  // One sliding pill per control, so two segmented controls on a screen don't trade theirs.
  const pill = useId();
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
          {o.value === value && <m.span layoutId={pill} className="seg-pill" transition={springs.snappy} />}
          <span className="seg-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * A number that rolls to its new value like a scoreboard: up when it goes up,
 * down when it goes down. The plain value is what assistive tech and tests
 * read; the rolling copy is decoration.
 */
export function RollingNumber({ value, className }: { value: number | string; className?: string }) {
  const previous = useRef(value);
  const [direction, setDirection] = useState(1);
  if (previous.current !== value) {
    setDirection(Number(value) >= Number(previous.current) ? 1 : -1);
    previous.current = value;
  }
  return (
    <span className={className ? `rolling ${className}` : 'rolling'}>
      <span className="sr-only">{value}</span>
      <span className="rolling-track" aria-hidden="true">
        <AnimatePresence initial={false} custom={direction}>
          <m.span
            key={String(value)}
            className="rolling-digit"
            custom={direction}
            variants={{
              enter: (d: number) => ({ y: d > 0 ? '70%' : '-70%', opacity: 0 }),
              still: { y: 0, opacity: 1 },
              leave: (d: number) => ({ y: d > 0 ? '-70%' : '70%', opacity: 0 }),
            }}
            initial="enter"
            animate="still"
            exit="leave"
            transition={springs.snappy}
          >
            {value}
          </m.span>
        </AnimatePresence>
      </span>
    </span>
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
        <RollingNumber value={value} className="stepper-number" />
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

/** Match length in minutes: quick presets plus anything else you want to type. */
export function DurationPicker({
  value,
  onChange,
  presets,
}: {
  value: number;
  onChange: (minutes: number) => void;
  presets: number[];
}) {
  return (
    <div className="duration-picker">
      <div className="chip-wrap">
        {presets.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className={minutes === value ? 'filter-chip on' : 'filter-chip'}
            onClick={() => onChange(minutes)}
          >
            {minutes} min
          </button>
        ))}
      </div>
      <div className="duration-custom">
        <input
          className="input"
          type="number"
          min={1}
          max={200}
          step={5}
          value={value}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onChange(Math.max(1, Math.min(200, next)));
          }}
          aria-label="Match length in minutes"
        />
        <span className="duration-unit">minutes</span>
      </div>
    </div>
  );
}
