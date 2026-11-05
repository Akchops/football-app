import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, m, useDragControls, useMotionValue, useTransform, type PanInfo } from 'motion/react';
import { prefersReducedMotion, sheetOpened, springs, takeOrigin } from '../lib/motion';
import {
  BallIcon, CalendarIcon, ChartIcon, ChevronIcon, MediaIcon, NoEntryIcon, PencilIcon, RunIcon, ShieldIcon, ShirtIcon, TrophyIcon,
} from './icons';

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
  // Opened from a tapped match: grow out of that row rather than rise from the bottom.
  const [from] = useState(() => (prefersReducedMotion() ? null : takeOrigin()));
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

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!from || !panel) return;
    const to = panel.getBoundingClientRect();
    const inset = [
      Math.max(0, from.top - to.top),
      Math.max(0, to.right - from.right),
      Math.max(0, to.bottom - from.bottom),
      Math.max(0, from.left - to.left),
    ];
    animate(
      panel,
      // Ends on the sheet's own shape (round on top, square at the foot), so nothing is cut off.
      { clipPath: [`inset(${inset.map((v) => `${v}px`).join(' ')} round 16px)`, 'inset(0px 0px 0px 0px round 14px 14px 0px 0px)'] },
      springs.smooth,
    ).then(() => requestAnimationFrame(() => panel.style.removeProperty('clip-path')));
    const body = panel.querySelectorAll<HTMLElement>('.sheet-head, .sheet-body, .sheet-foot');
    animate(body, { opacity: [0.2, 1] }, { duration: 0.35, ease: 'easeOut' });
  }, [from]);

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
        initial={from ? false : { y: '100%' }}
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

/** Emoji the screens already pass in, drawn as the app's own symbols instead. */
const EMPTY_ICONS: Record<string, () => JSX.Element> = {
  '🎬': () => <MediaIcon on />,
  '⚽': () => <BallIcon on />,
  '📅': () => <CalendarIcon on />,
  '🏆': TrophyIcon,
  '📊': () => <ChartIcon on />,
  '👕': () => <ShirtIcon on />,
  '📝': PencilIcon,
  '🔎': ChartIcon,
};

/** Apple's "content unavailable" view: a symbol, a line, a way forward. */
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
  const Icon = EMPTY_ICONS[icon];
  return (
    <m.div
      className="empty"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={springs.smooth}
    >
      <m.div
        className="empty-icon"
        aria-hidden="true"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...springs.bouncy, delay: 0.06 }}
      >
        {Icon ? <Icon /> : icon}
      </m.div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </m.div>
  );
}

/**
 * A coloured symbol per kind of stat, the way Health colours its categories:
 * goals red, defending green, keeping blue, time orange, discipline yellow.
 */
const TILE_KINDS: { match: RegExp; color: string; Icon: () => JSX.Element }[] = [
  { match: /goal diff|win|point|record/i, color: '#bf5af2', Icon: TrophyIcon },
  { match: /clean sheet|conced|against|save|claim|sweep|pen/i, color: '#0a84ff', Icon: ShieldIcon },
  { match: /goal|shot|target/i, color: '#ff375f', Icon: BallIcon },
  { match: /assist|chance|pass/i, color: '#ff9f0a', Icon: RunIcon },
  { match: /tackle|intercept|clear|block|duel/i, color: '#30d158', Icon: ShieldIcon },
  { match: /minute|session|training|apps|appearance/i, color: '#64d2ff', Icon: CalendarIcon },
  { match: /card|yellow|red|discipline/i, color: '#ffd60a', Icon: NoEntryIcon },
];

/** Labels whose numbers have already counted up this session - they only do it once. */
const counted = new Set<string>();

/** A number that counts up from zero the first time it's seen in a session. */
function CountUp({ value, id }: { value: number; id: string }) {
  const first = !counted.has(id) && !prefersReducedMotion() && value > 0;
  const [shown, setShown] = useState(first ? 0 : value);
  useEffect(() => {
    if (!first) return void setShown(value);
    counted.add(id);
    const run = animate(0, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => run.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{shown}</>;
}

export function StatTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: 'win' | 'loss' | 'draw' }) {
  const kind = TILE_KINDS.find((k) => k.match.test(label)) ?? { color: '#8e8e93', Icon: ChartIcon };
  return (
    <div className={tone ? `tile tone-${tone}` : 'tile'}>
      <span className="tile-icon" style={{ background: kind.color }} aria-hidden="true">
        <kind.Icon />
      </span>
      <div className="tile-value">{typeof value === 'number' ? <CountUp value={value} id={label} /> : value}</div>
      <div className="tile-label">{label}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  grouped = false,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  /** Settings-style: the section's contents sit together on one card. */
  grouped?: boolean;
}) {
  return (
    <section className={grouped ? 'section grouped' : 'section'}>
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {grouped ? <div className="section-card">{children}</div> : children}
    </section>
  );
}

/**
 * A Settings-style row that opens to show more below it: the chevron turns
 * and the contents grow into place, rather than a link that makes things
 * appear from nowhere.
 */
export function Disclosure({
  label,
  detail,
  open,
  onToggle,
  children,
}: {
  label: string;
  /** What's set inside, shown while it's shut so nothing hides there unseen. */
  detail?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={open ? 'disclosure open' : 'disclosure'}>
      <button type="button" className="disclosure-row" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="disclosure-text">
          <span className="disclosure-label">{label}</span>
          {detail && !open && <span className="disclosure-detail">{detail}</span>}
        </span>
        <m.span
          className="disclosure-chevron"
          animate={{ rotate: open ? 90 : 0 }}
          transition={springs.snappy}
          aria-hidden="true"
        >
          <ChevronIcon />
        </m.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            id={id}
            className="disclosure-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springs.smooth}
          >
            <div className="disclosure-inner">{children}</div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
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

// ---------------------------------------------------------------- loading

/**
 * One grey shape standing in for something on its way: a line of text, a
 * badge, a tile. Shapes are decoration only - the Skeleton around them says
 * "Loading" once, for whoever can't see them.
 */
export function Bone({
  w,
  h,
  r,
  circle = false,
  className,
  style,
}: {
  w?: number | string;
  h?: number | string;
  r?: number | string;
  circle?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className ? `sk ${className}` : 'sk'}
      style={{ width: w, height: h, borderRadius: circle ? '50%' : r, ...style }}
    />
  );
}

/**
 * A screen, or part of one, in outline while it loads. It fades in only after
 * a moment, so a quick load never flashes it. `label` is what a screen reader
 * hears instead of the shapes.
 */
export function Skeleton({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className ? `skeleton ${className}` : 'skeleton'} role="status">
      <span className="sr-only">{label}</span>
      <div className="skeleton-shapes" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

/** Widths that make a column of placeholder lines look like real, uneven text. */
const LINE_WIDTHS = [62, 46, 74, 55, 68, 40];
export const lineWidth = (i: number, less = 0) => `${LINE_WIDTHS[i % LINE_WIDTHS.length] - less}%`;

/**
 * Rows of a grouped list on their way: a leading tile (a coloured square, or a
 * round face for people), a line or two, and what sits at the end of the row.
 */
export function SkeletonRows({
  rows = 3,
  lead = 'square',
  sub = true,
  trail,
}: {
  rows?: number;
  lead?: 'square' | 'circle';
  sub?: boolean;
  trail?: 'chip' | 'count';
}) {
  return (
    <div className={lead === 'circle' ? 'list-group person-group' : 'list-group nav-group'}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk-row">
          {lead === 'circle' ? <Bone w={36} h={36} circle /> : <Bone w={30} h={30} r={8} />}
          <span className="sk-lines">
            <Bone w={lineWidth(i)} h={14} />
            {sub && <Bone w={lineWidth(i + 2, 20)} h={10} />}
          </span>
          {trail === 'chip' && <Bone w={62} h={24} r={12} />}
          {trail === 'count' && <Bone w={24} h={24} r={6} />}
        </div>
      ))}
    </div>
  );
}

/** A section's small heading still loading, over whatever goes under it. */
export function SkeletonSection({ title = 110, children }: { title?: number; children: ReactNode }) {
  return (
    <div className="section">
      <div className="section-head">
        <Bone w={title} h={11} />
      </div>
      {children}
    </div>
  );
}

/** Plain cards stacked up, each a name and a line of detail. */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="sk-cards">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="sk-card">
          <Bone w={lineWidth(i)} h={14} />
          <Bone w={lineWidth(i + 3, 22)} h={10} />
        </div>
      ))}
    </div>
  );
}

export function Spinner({ small = false }: { small?: boolean }) {
  return <span className={small ? 'spinner small' : 'spinner'} aria-hidden="true" />;
}

/** A wait with no shape to show - signing in, reading a schedule: a spinner and what's happening. */
export function Waiting({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="reading-state" role="status">
      <Spinner />
      <p className="muted small">{text}</p>
      {hint && <p className="muted small">{hint}</p>}
    </div>
  );
}

/** A line saying what's happening, with a small spinner in front - for a wait inside a screen. */
export function LoadingLine({ children }: { children: ReactNode }) {
  return (
    <p className="loading-line" role="status">
      <Spinner small />
      <span>{children}</span>
    </p>
  );
}

/**
 * What a button says while it works: a small spinner and the word for it
 * ("Saving…"), so a tap clearly took.
 */
export function BusyLabel({ busy, text, children }: { busy: boolean; text: string; children: ReactNode }) {
  if (!busy) return <>{children}</>;
  return (
    <span className="busy-label">
      <span className="btn-spinner" aria-hidden="true" />
      {text}
    </span>
  );
}
