import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, m, useMotionValue, useTransform, type PanInfo } from 'motion/react';
import { useStore } from '../store/AppStore';
import type { Match } from '../types';
import { countdown, kickoffAt } from '../lib/date';
import { isWalkover, outcomeOf, scoreline, shootoutWinner } from '../lib/stats';
import { stageName } from '../lib/stage';
import { rememberOrigin, springs } from '../lib/motion';
import { ChevronIcon, NoEntryIcon, PencilIcon, TrashIcon, WhistleResultIcon } from './icons';
import { useMatchActions } from './UndoToast';

const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const ACTIONS_WIDTH = 168;
const HOLD_MS = 480;

/**
 * One match in a Settings-style list. Tap opens it (the page grows out of the
 * row); swipe left for Called off and Delete, or all the way to delete; hold
 * for a menu of everything that can be done to it.
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
  const rowRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const revealed = useTransform(x, [-ACTIONS_WIDTH, -40, 0], [1, 0.4, 0]);
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const hold = useRef<number | null>(null);
  const held = useRef(false);
  const dragged = useRef(false);

  const competition = competitionOf(match);
  const kickoff = kickoffAt(match.date, match.time);
  const date = new Date(`${match.date}T00:00:00`);
  const awaiting = match.status === 'scheduled' && kickoff.getTime() <= now.getTime();
  const upcoming = match.status === 'scheduled' && !awaiting;
  const meta = [competition?.name, stageName(match.stage, match.stageDetail), match.venue === 'away' ? 'Away' : match.venue === 'home' ? 'Home' : 'Neutral']
    .filter(Boolean)
    .join(' · ');

  const close = () => animate(x, 0, springs.snappy);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    // All the way across deletes, as in Mail; partway leaves the buttons showing.
    if (info.offset.x < -window.innerWidth * 0.55 || (info.velocity.x < -1400 && info.offset.x < -120)) {
      animate(x, -window.innerWidth, springs.smooth).then(() => actions.remove(match));
    } else if (info.offset.x < -50 || info.velocity.x < -500) {
      animate(x, -ACTIONS_WIDTH, springs.snappy);
    } else close();
    window.setTimeout(() => (dragged.current = false), 50);
  };

  const startHold = () => {
    held.current = false;
    hold.current = window.setTimeout(() => {
      held.current = true;
      if (rowRef.current) setMenu(rowRef.current.getBoundingClientRect());
    }, HOLD_MS);
  };
  const endHold = () => {
    if (hold.current !== null) window.clearTimeout(hold.current);
    hold.current = null;
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
    <div className={match.status === 'cancelled' ? 'row-wrap is-cancelled' : 'row-wrap'} data-match={match.id}>
      {/* Behind the row: what a swipe uncovers. */}
      <m.div className="row-actions" style={{ opacity: revealed }} aria-hidden="true">
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
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -ACTIONS_WIDTH, right: 0 }}
        dragElastic={{ left: 0.5, right: 0.05 }}
        dragMomentum={false}
        onDragStart={() => {
          dragged.current = true;
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
            if (rowRef.current) setMenu(rowRef.current.getBoundingClientRect());
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
        initial={{ y: rect.top - top, scale: 1 }}
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
