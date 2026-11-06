import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'motion/react';
import { springs } from '../lib/motion';
import { sheetBackStack } from '../lib/backStack';

export interface MenuItem {
  label: string;
  /** A quiet second line, e.g. the day it will go on. */
  detail?: string;
  Icon: () => JSX.Element;
  run: () => void;
}

const ITEM_HEIGHT = 54;
const MENU_WIDTH = 230;
/** Clear of the tab bar and the big + at the foot of the screen. */
const FOOT = 110;

/**
 * A button that drops a small menu from itself - iOS's pull-down button. It
 * opens under the button, or over it when there's no room below. A tap
 * outside, Escape or the phone's back button puts it away; choosing an item
 * puts it away and does it.
 */
export function MenuButton({ label, className, items }: { label: string; className?: string; items: MenuItem[] }) {
  const button = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const open = anchor !== null;
  const close = () => setAnchor(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    const release = sheetBackStack().open(() => {
      close();
      return true;
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      release();
    };
  }, [open]);

  const height = items.length * ITEM_HEIGHT;
  const below = anchor ? anchor.bottom + 8 + height <= window.innerHeight - FOOT : true;
  const top = anchor ? (below ? anchor.bottom + 8 : anchor.top - 8 - height) : 0;
  const left = anchor ? Math.max(16, Math.min(anchor.left, window.innerWidth - MENU_WIDTH - 16)) : 0;

  return (
    <>
      <button
        ref={button}
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setAnchor(open ? null : (button.current?.getBoundingClientRect() ?? null))}
      >
        {label}
      </button>
      {createPortal(
        <AnimatePresence>
          {anchor && (
            <div className="pull-menu-layer" key="layer">
              <div className="pull-menu-scrim" onClick={close} />
              <m.div
                className="row-menu pull-menu"
                role="menu"
                aria-label={label}
                style={{ top, left, width: MENU_WIDTH, transformOrigin: below ? '12% 0' : '12% 100%' }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={springs.snappy}
              >
                {items.map(({ label: name, detail, Icon, run }) => (
                  <button
                    key={name}
                    type="button"
                    role="menuitem"
                    className="row-menu-item"
                    onClick={() => {
                      close();
                      run();
                    }}
                  >
                    <span className="pull-menu-text">
                      <span>{name}</span>
                      {detail && <span className="pull-menu-detail">{detail}</span>}
                    </span>
                    <Icon />
                  </button>
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
