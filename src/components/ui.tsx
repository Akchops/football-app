import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence, animate, m, useDragControls, useMotionValue, useMotionValueEvent, useTransform,
  type AnimationPlaybackControlsWithThen, type PanInfo,
} from 'motion/react';
import { onlySheet, prefersReducedMotion, project, setSheetPull, sheetOpened, springs, takeOrigin } from '../lib/motion';
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
 * follows a finger pulled down from its top - or from its contents, once
 * they're scrolled to the top. Let go and it goes where the flick was
 * heading: down past halfway (counting the flick's momentum) and it carries
 * on down at the finger's speed, flicked back up and it springs back. The
 * screen behind comes forward with it the whole way, and a sheet on its way
 * out can be caught again mid-slide.
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
  const layerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Opened from a tapped match: grow out of that row rather than rise from the bottom.
  const [from] = useState(() => (prefersReducedMotion() ? null : takeOrigin()));
  // The exit under way, if there is one. A finger landing on the sheet stops it.
  const leaving = useRef<AnimationPlaybackControlsWithThen | null>(null);
  // Once a finger has moved the sheet, the screen behind follows it rather than its own transition.
  const tracking = useRef(false);
  // Rising from the bottom, it starts below the screen on its very first frame.
  const [rises] = useState(() => !from && !prefersReducedMotion());
  const y = useMotionValue(rises ? window.innerHeight : 0);
  const drag = useDragControls();
  const height = () => panelRef.current?.offsetHeight ?? 600;
  // The dimming lifts as the sheet is pulled down, so the gesture reads as "putting it away".
  const dim = useTransform(y, (v) => 1 - Math.min(1, Math.max(0, v) / height()) * 0.9);

  useMotionValueEvent(y, 'change', (v) => {
    if (tracking.current && onlySheet()) setSheetPull(v / height());
  });

  // Slide down and away at the finger's speed, then hand over. With Reduce
  // Motion, a short fade instead.
  const leave = (velocity = 0) => {
    if (leaving.current) return;
    let run: AnimationPlaybackControlsWithThen;
    if (prefersReducedMotion() && layerRef.current) {
      run = animate(layerRef.current, { opacity: 0 }, { duration: 0.18 });
    } else {
      tracking.current = true;
      run = animate(y, height(), { ...springs.smooth, velocity });
    }
    leaving.current = run;
    run.then(() => {
      if (leaving.current === run) onClose();
    });
  };

  // A finger on a sheet that's sliding away catches it: it stops where it is
  // and follows the finger from there. True if there was something to catch.
  const grab = () => {
    const run = leaving.current;
    if (!run || prefersReducedMotion()) return false;
    leaving.current = null;
    run.stop();
    return true;
  };
  const dragging = useRef(false);

  // Where the sheet goes when let go: which way the finger was moving decides,
  // and how far the flick would have carried it.
  const release = (velocity: number) => {
    if (!dismissible) return;
    const landing = y.get() + project(velocity);
    if (velocity > -200 && landing > height() / 2) leave(velocity);
    else animate(y, 0, { ...springs.release, velocity });
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

  // In: rise from the bottom, or grow out of the tapped row.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    // Rising: the dimming follows the sheet up (it's tied to y), so only the rise needs starting.
    if (rises) {
      animate(y, 0, springs.smooth);
      return;
    }
    const backdrop = backdropRef.current;
    if (prefersReducedMotion()) {
      animate(panel, { opacity: [0, 1] }, { duration: 0.2 });
      if (backdrop) animate(backdrop, { opacity: [0, 1] }, { duration: 0.2 });
      return;
    }
    if (backdrop) animate(backdrop, { opacity: [0, 1] }, springs.smooth);
    if (!from) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from]);

  // Pulling down on the contents, once they're scrolled to the top, moves the
  // sheet instead - as on iOS. Touch only: a mouse has the grip and the ✕.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !dismissible) return;
    let startX = 0;
    let startY = 0;
    let base = 0;
    let state: 'idle' | 'maybe' | 'pulling' = 'idle';
    let samples: { y: number; t: number }[] = [];
    const down = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      samples = [{ y: t.clientY, t: e.timeStamp }];
      // Touching a sheet that's sliding away stops it under the finger, there and then.
      if (e.touches.length === 1 && grab()) {
        state = 'pulling';
        base = y.get();
        return;
      }
      state = e.touches.length === 1 && body.scrollTop <= 0 ? 'maybe' : 'idle';
    };
    const move = (e: TouchEvent) => {
      if (state === 'idle') return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (state === 'maybe') {
        // Sideways or upwards is the contents' own scroll; leave it alone.
        if (dy < 0 || Math.abs(dx) > Math.abs(dy) || body.scrollTop > 0) {
          state = 'idle';
          return;
        }
        // Down at the top would only bounce the contents - hold it while deciding.
        if (e.cancelable) e.preventDefault();
        if (dy < 10) return;
        state = 'pulling';
        grab();
        tracking.current = true;
        // Carry on from wherever the sheet is, so it never jumps to the finger.
        base = y.get() - dy;
      }
      if (e.cancelable) e.preventDefault();
      y.set(Math.max(0, base + dy));
      samples.push({ y: t.clientY, t: e.timeStamp });
      if (samples.length > 5) samples.shift();
    };
    const up = () => {
      if (state !== 'pulling') return void (state = 'idle');
      state = 'idle';
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = last.t - first.t;
      release(dt > 0 ? ((last.y - first.y) / dt) * 1000 : 0);
    };
    body.addEventListener('touchstart', down, { passive: true });
    body.addEventListener('touchmove', move, { passive: false });
    body.addEventListener('touchend', up);
    body.addEventListener('touchcancel', up);
    return () => {
      body.removeEventListener('touchstart', down);
      body.removeEventListener('touchmove', move);
      body.removeEventListener('touchend', up);
      body.removeEventListener('touchcancel', up);
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

  return (
    <div className="sheet-layer" ref={layerRef}>
      <m.div
        ref={backdropRef}
        className="sheet-backdrop"
        style={{ opacity: dim }}
        onClick={dismissible ? () => leave() : undefined}
      />
      <m.div
        ref={panelRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ y }}
        drag={dismissible ? 'y' : false}
        dragListener={false}
        dragControls={drag}
        dragConstraints={{ top: 0, bottom: 0 }}
        // Pulling up gives a little and stops, like the real thing; pulling down follows the finger.
        dragElastic={{ top: 0.04, bottom: 1 }}
        dragMomentum={false}
        onDragStart={() => {
          tracking.current = true;
          dragging.current = true;
        }}
        onDragEnd={(_: unknown, info: PanInfo) => {
          dragging.current = false;
          release(info.velocity.y);
        }}
      >
        <div
          className="sheet-head"
          onPointerDown={
            dismissible
              ? (e) => {
                  // Caught mid-slide and let go without moving: no drag ever starts,
                  // so decide here, or it would stay stopped halfway.
                  if (grab()) {
                    const up = () => {
                      window.removeEventListener('pointerup', up);
                      window.removeEventListener('pointercancel', up);
                      if (!dragging.current) release(0);
                    };
                    window.addEventListener('pointerup', up);
                    window.addEventListener('pointercancel', up);
                  }
                  drag.start(e);
                }
              : undefined
          }
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
        <div className="sheet-body" ref={bodyRef}>
          {children}
        </div>
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
        transition={{ ...springs.smooth, delay: 0.06 }}
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
 * The system colours, so each is a step brighter in dark mode, as on iOS.
 */
const TILE_KINDS: { match: RegExp; color: string; Icon: () => JSX.Element }[] = [
  { match: /goal diff|win|point|record/i, color: 'var(--sys-purple)', Icon: TrophyIcon },
  { match: /clean sheet|conced|against|save|claim|sweep|pen/i, color: 'var(--sys-blue)', Icon: ShieldIcon },
  { match: /goal|shot|target/i, color: 'var(--sys-pink)', Icon: BallIcon },
  { match: /assist|chance|pass/i, color: 'var(--sys-orange)', Icon: RunIcon },
  { match: /tackle|intercept|clear|block|duel/i, color: 'var(--sys-green)', Icon: ShieldIcon },
  { match: /minute|session|training|apps|appearance/i, color: 'var(--sys-cyan)', Icon: CalendarIcon },
  { match: /card|yellow|red|discipline/i, color: 'var(--sys-yellow)', Icon: NoEntryIcon },
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
  const kind = TILE_KINDS.find((k) => k.match.test(label)) ?? { color: 'var(--sys-gray)', Icon: ChartIcon };
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
