import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { animate, m, useMotionValue, useTransform } from 'motion/react';
import { springs } from '../lib/motion';
import { SyncIcon } from './icons';

const TRIGGER = 72;
const MAX = 120;

/**
 * Pull down from the top of a screen to sync with the family's phones, as in
 * Mail. The page follows the finger with some resistance; let go past the
 * line and it holds there with a spinner until the sync is done.
 * Only touch starts it - a mouse wheel just scrolls.
 */
export function PullToRefresh({
  scroller,
  enabled,
  onRefresh,
  children,
}: {
  scroller: RefObject<HTMLElement>;
  enabled: boolean;
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}) {
  const pull = useMotionValue(0);
  const turn = useTransform(pull, [0, TRIGGER], [0, 300]);
  const show = useTransform(pull, [8, TRIGGER * 0.7], [0, 1]);
  const lift = useTransform(pull, (v) => v - 40);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const start = useRef<number | null>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !enabled) return;
    const down = (e: TouchEvent) => {
      start.current = el.scrollTop <= 0 && !busy ? e.touches[0].clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0) return void pull.set(0);
      // Resistance: the further it goes, the harder it pulls back.
      pull.set(Math.min(MAX, dy * 0.5));
    };
    const up = async () => {
      if (start.current === null) return;
      start.current = null;
      if (pull.get() < TRIGGER) return void animate(pull, 0, springs.snappy);
      setBusy(true);
      animate(pull, 56, springs.snappy);
      const started = Date.now();
      try {
        await onRefresh();
      } finally {
        // Long enough to see that something happened.
        await new Promise((r) => setTimeout(r, Math.max(0, 700 - (Date.now() - started))));
        setBusy(false);
        setDone(true);
        animate(pull, 0, springs.smooth);
        window.setTimeout(() => setDone(false), 1500);
      }
    };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
    return () => {
      el.removeEventListener('touchstart', down);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', up);
      el.removeEventListener('touchcancel', up);
    };
  }, [scroller, enabled, busy, onRefresh, pull]);

  return (
    <>
      {enabled && (
        <m.div className="ptr" style={{ opacity: busy ? 1 : show, y: lift }} aria-hidden={!busy}>
          <m.span className={busy ? 'ptr-icon spinning' : 'ptr-icon'} style={{ rotate: turn }}>
            <SyncIcon />
          </m.span>
        </m.div>
      )}
      {done && (
        <m.div className="ptr-done" role="status" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          Synced just now
        </m.div>
      )}
      <m.div style={{ y: pull }}>{children}</m.div>
    </>
  );
}
