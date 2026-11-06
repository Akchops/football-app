import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'motion/react';
import { arc, exitOf, press, springs } from '../lib/motion';
import { PlusIcon } from './icons';

export interface AddItem {
  label: string;
  hint: string;
  Icon: () => JSX.Element;
  run: () => void;
}

const HOLD_MS = 450;

/**
 * The big + in the middle of the tab bar - adding matches is what the app is
 * for. A tap springs open a menu above it; holding it goes straight to a new
 * match (or whatever comes first), the most common thing to add.
 */
export function AddButton({ items, onHold }: { items: AddItem[]; onHold?: () => void }) {
  const [open, setOpen] = useState(false);
  // Where the + sits, so the menu grows out of it and folds back into it.
  const [from, setFrom] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const held = useRef<number | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const startHold = () => {
    fired.current = false;
    held.current = window.setTimeout(() => {
      fired.current = true;
      setOpen(false);
      (onHold ?? items[0].run)();
    }, HOLD_MS);
  };
  const endHold = () => {
    if (held.current !== null) window.clearTimeout(held.current);
    held.current = null;
  };

  const pick = (run: () => void) => () => {
    setOpen(false);
    run();
  };

  return (
    <>
      <div className="add-slot">
        <m.button
          type="button"
          className={open ? 'add-btn open' : 'add-btn'}
          aria-label={open ? 'Close the add menu' : 'Add'}
          aria-expanded={open}
          aria-haspopup="menu"
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onContextMenu={(e) => e.preventDefault()}
          ref={buttonRef}
          onClick={() => {
            if (fired.current) return;
            const box = buttonRef.current?.getBoundingClientRect();
            if (box) setFrom({ x: box.left + box.width / 2, y: box.top });
            setOpen((o) => !o);
          }}
          whileTap={{ scale: press, transition: { duration: 0 } }}
          transition={springs.snappy}
        >
          <m.span className="add-btn-icon" animate={{ rotate: open ? 45 : 0 }} transition={springs.snappy}>
            <PlusIcon />
          </m.span>
        </m.button>
      </div>
      {createPortal(
        <AnimatePresence>
          {open && (
            <div className="add-layer" key="layer">
              <m.div
                className="add-scrim"
                onClick={() => setOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitOf({ duration: 0.2 }) }}
                transition={{ duration: 0.2 }}
              />
              <m.div
                className="add-menu"
                role="menu"
                aria-label="Add"
                ref={(el) => {
                  // Grow from the + itself, wherever the menu ends up on screen.
                  // Its own place on the page, not where an animation has it right now.
                  if (!el || !from) return;
                  el.style.transformOrigin = `${from.x - el.offsetLeft}px ${from.y - el.offsetTop}px`;
                }}
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12, transition: exitOf(springs.menu) }}
                transition={springs.menu}
              >
                {items.map(({ label, hint, Icon, run }, i) => (
                  <m.button
                    key={label}
                    type="button"
                    role="menuitem"
                    className="add-item"
                    onClick={pick(run)}
                    // Fanning up out of the +, on a curve.
                    initial={{ opacity: 0, y: 18, x: from ? Math.sign(from.x - window.innerWidth / 2) * 6 - 10 : -10 }}
                    animate={{ opacity: 1, y: 0, x: 0 }}
                    transition={arc(springs.snappy, 0.03 * (items.length - i))}
                  >
                    <span className="add-item-icon">
                      <Icon />
                    </span>
                    <span className="add-item-text">
                      <strong>{label}</strong>
                      <span>{hint}</span>
                    </span>
                  </m.button>
                ))}
              </m.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
