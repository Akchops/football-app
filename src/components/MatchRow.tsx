import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence, animate, m, useMotionValue, useMotionValueEvent, useTransform,
  type AnimationPlaybackControls, type PanInfo,
} from 'motion/react';
import { useStore } from '../store/AppStore';
import type { Match } from '../types';
import { countdown, kickoffAt } from '../lib/date';
import { isWalkover, outcomeOf, scoreline, shootoutWinner } from '../lib/stats';
import { stageName } from '../lib/stage';
import { prefersReducedMotion, project, rememberOrigin, springs } from '../lib/motion';
import { ChevronIcon, NoEntryIcon, PencilIcon, TrashIcon, WhistleResultIcon } from './icons';
import { useMatchActions } from './UndoToast';

const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const ACTIONS_WIDTH = 168;
const HOLD_MS = 480;

/**
 * One match in a Settings-style list. Tap opens it (the page grows out of the
 * row); swipe left for Called off and Delete, or all the way to delete - past
 * the point of no return Delete swells to fill the row, so letting go there
 * clearly deletes; hold for a menu of everything that can be done to it, the
 * row sinking a little as the hold builds so the menu doesn't come from nowhere.
 */
export function MatchRow({
  match,
  now,
  onOpen,
  onEnterResult,
  onEdit,
}: {
  match: Match;
  now: Date;
  onOpen: () => void;
  onEnterResult: () => void;
  onEdit: () => void;
}) {
  const { competitionOf, colorOf } = useStore();
  const actions = useMatchActions();
  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const scale = useMotionValue(1);
  const revealed = useTransform(x, [-ACTIONS_WIDTH, -40, 0], [1, 0.4, 0]);
  // The buttons stretch to fill whatever the row has uncovered.
  const actionsWidth = useTransform(x, (v) => Math.max(ACTIONS_WIDTH, -v));
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const hold = useRef<number | null>(null);
  const sinking = useRef<AnimationPlaybackControls | null>(null);
  const held = useRef(false);
  const dragged = useRef(false);
  const dragging = useRef(false);
  // Swiped far enough that letting go deletes.
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);
  const rowWidth = () => wrapRef.current?.offsetWidth ?? window.innerWidth;
  useMotionValueEvent(x, 'change', (v) => {
    const now = v < -Math.max(ACTIONS_WIDTH + 30, rowWidth() * 0.55);
    if (now === armedRef.current) return;
    armedRef.current = now;
    setArmed(now);
    // A tick under the finger as it crosses the line, both ways (where phones allow it).
    if (dragging.current) navigator.vibrate?.(8);
  });

  const competition = competitionOf(match);
  const kickoff = kickoffAt(match.date, match.time);
  const date = new Date(`${match.date}T00:00:00`);
  const awaiting = match.status === 'scheduled' && kickoff.getTime() <= now.getTime();
  const upcoming = match.status === 'scheduled' && !awaiting;
  const meta = [competition?.name, stageName(match.stage, match.stageDetail), match.venue === 'away' ? 'Away' : match.venue === 'home' ? 'Home' : 'Neutral']
    .filter(Boolean)
    .join(' · ');

  const close = () => animate(x, 0, springs.snappy);
  // Where the row goes is decided by where it is and where the flick was taking
  // it - not by how far this one drag moved, so pushing an open row further
  // open keeps it open. Every way out carries on at the finger's speed.
  const onDragEnd = (_: unknown, info: PanInfo) => {
    dragging.current = false;
    const v = info.velocity.x;
    if (armedRef.current && v < 300) {
      // Let go past the line (and not flicking back): all the way across, then delete, as in Mail.
      animate(x, -rowWidth(), { ...springs.smooth, velocity: v }).then(() => actions.remove(match));
    } else if (x.get() + project(v, 0.99) < -ACTIONS_WIDTH / 2) {
      animate(x, -ACTIONS_WIDTH, { ...springs.release, velocity: v });
    } else {
      animate(x, 0, { ...springs.release, velocity: v });
    }
    window.setTimeout(() => (dragged.current = false), 50);
  };

  const openMenu = () => {
    sinking.current?.stop();
    scale.set(1);
    if (wrapRef.current) setMenu(wrapRef.current.getBoundingClientRect());
  };
  const startHold = () => {
    held.current = false;
    // After a beat (so a quick tap doesn't flinch), the row sinks while the hold builds.
    if (!prefersReducedMotion()) {
      sinking.current = animate(scale, 0.97, { delay: 0.12, duration: (HOLD_MS - 120) / 1000, ease: 'easeOut' });
    }
    hold.current = window.setTimeout(() => {
      held.current = true;
      openMenu();
    }, HOLD_MS);
  };
  const endHold = () => {
    if (hold.current !== null) window.clearTimeout(hold.current);
    hold.current = null;
    if (!held.current && scale.get() !== 1) {
      sinking.current?.stop();
      animate(scale, 1, springs.snappy);
    }
  };

  const result = match.result;
  const outcome = result ? outcomeOf(result) : null;
  const pens = result ? shootoutWinner(result) : null;

  const face = (
    <>
      <span className="row-date" aria-hidden="true">
        <span className="row-weekday">{WEEKDAY[date.getDay()]}</span>
        <span className="row-day">{date.getDate()}</span>
      </span>
      <span className="row-body">
        <span className="row-title">
          <span className="row-dot" style={{ background: colorOf(match) }} aria-hidden="true" />
          <span className="vs">{match.venue === 'away' ? '@' : 'vs'}</span> {match.opponent || 'TBC'}
        </span>
        <span className="row-meta">{meta}</span>
      </span>
      <span className="row-end">
        {match.status === 'cancelled' && <span className="row-pill off">Off</span>}
        {result && outcome && (
          <span className={`row-pill outcome-${outcome.toLowerCase()}`}>
            {outcome === 'D' && pens === 'us' ? 'D+' : outcome} {isWalkover(result) ? 'W/O' : scoreline(result).replace('-', '–').replace(/ \(.*\)/, '')}
          </span>
        )}
        {upcoming && <span className="row-countdown">{countdown(kickoff, now)}</span>}
        {awaiting && <span className="row-pill ask">Result?</span>}
        <span className="row-chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </span>
    </>
  );

  return (
    <div ref={wrapRef} className={match.status === 'cancelled' ? 'row-wrap is-cancelled' : 'row-wrap'} data-match={match.id}>
      {/* Behind the row: what a swipe uncovers. */}
      <m.div
        className={armed ? 'row-actions armed' : 'row-actions'}
        style={{ opacity: revealed, width: actionsWidth }}
        aria-hidden="true"
      >
        <button
          type="button"
          tabIndex={-1}
          className="row-action off"
          onClick={() => {
            close();
            actions.callOff(match);
          }}
        >
          <NoEntryIcon />
          <span>Called off</span>
        </button>
        <button type="button" tabIndex={-1} className="row-action delete" onClick={() => actions.remove(match)}>
          <TrashIcon />
          <span>Delete</span>
        </button>
      </m.div>
      <m.div
        ref={rowRef}
        className="match-row"
        style={{ x, scale }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -ACTIONS_WIDTH, right: 0 }}
        dragElastic={{ left: 0.5, right: 0.05 }}
        dragMomentum={false}
        onDragStart={() => {
          dragged.current = true;
          dragging.current = true;
          endHold();
        }}
        onDragEnd={onDragEnd}
      >
        <button
          type="button"
          className="match-row-main"
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onContextMenu={(e) => {
            e.preventDefault();
            openMenu();
          }}
          onClick={() => {
            if (held.current || dragged.current) return;
            if (x.get() < -5) return void close();
            rememberOrigin(rowRef.current);
            if (awaiting) onEnterResult();
            else onOpen();
          }}
        >
          {face}
        </button>
      </m.div>

      {createPortal(
        <AnimatePresence>
          {menu && (
            <RowMenu
              key="menu"
              rect={menu}
              face={face}
              items={[
                ...(match.status !== 'cancelled'
                  ? [{ label: match.result ? 'Edit result' : 'Enter result', Icon: WhistleResultIcon, run: onEnterResult }]
                  : []),
                { label: 'Edit match', Icon: PencilIcon, run: onEdit },
                ...(match.status !== 'cancelled'
                  ? [{ label: 'Called off', Icon: NoEntryIcon, run: () => actions.callOff(match) }]
                  : []),
                { label: 'Delete', Icon: TrashIcon, run: () => actions.remove(match), danger: true },
              ]}
              onClose={() => setMenu(null)}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

/**
 * The long-press menu, as on iOS: the row lifts out of the list over a
 * blurred screen, with its actions underneath.
 */
function RowMenu({
  rect,
  face,
  items,
  onClose,
}: {
  rect: DOMRect;
  face: React.ReactNode;
  items: { label: string; Icon: () => JSX.Element; run: () => void; danger?: boolean }[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Keep the lifted row and its menu on screen, moving them up if the row was low.
  const menuHeight = items.length * 50 + 12;
  const top = Math.min(rect.top, window.innerHeight - rect.height - menuHeight - 40);
  return (
    <div className="row-menu-layer">
      <m.div
        className="row-menu-scrim"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={springs.smooth}
      />
      <m.div
        className="match-row lifted"
        style={{ top, left: rect.left, width: rect.width }}
        initial={{ y: rect.top - top, scale: 0.97 }}
        animate={{ y: 0, scale: 1.03 }}
        exit={{ y: rect.top - top, scale: 1, opacity: 0 }}
        transition={springs.snappy}
        aria-hidden="true"
      >
        <span className="match-row-main">{face}</span>
      </m.div>
      <m.div
        className="row-menu"
        role="menu"
        style={{ top: top + rect.height + 12, left: rect.left + 8 }}
        initial={{ opacity: 0, scale: 0.7, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: -6 }}
        transition={springs.snappy}
      >
        {items.map(({ label, Icon, run, danger }) => (
          <button
            key={label}
            type="button"
            role="menuitem"
            className={danger ? 'row-menu-item danger' : 'row-menu-item'}
            onClick={() => {
              onClose();
              run();
            }}
          >
            <span>{label}</span>
            <Icon />
          </button>
        ))}
      </m.div>
    </div>
  );
}
