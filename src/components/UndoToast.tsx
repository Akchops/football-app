import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useStore } from '../store/AppStore';
import type { Match, TrainingSession } from '../types';
import { springs } from '../lib/motion';

interface Offer {
  id: number;
  message: string;
  undo: () => void;
}

interface UndoValue {
  /** Shows "message · Undo" for a few seconds; Undo runs `undo`. */
  offer: (message: string, undo: () => void) => void;
}

const UndoContext = createContext<UndoValue>({ offer: () => {} });
const SHOW_MS = 5000;

/**
 * Undo instead of "Are you sure?": deleting or calling off happens at once,
 * and a toast offers to take it back - the way Mail and Photos work.
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Offer | null>(null);
  const timer = useRef<number | null>(null);
  const seq = useRef(0);

  const offer = useCallback((message: string, undo: () => void) => {
    seq.current += 1;
    setCurrent({ id: seq.current, message, undo });
  }, []);

  useEffect(() => {
    if (!current) return;
    timer.current = window.setTimeout(() => setCurrent(null), SHOW_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [current]);

  return (
    <UndoContext.Provider value={{ offer }}>
      {children}
      <AnimatePresence>
        {current && (
          <m.div
            key={current.id}
            className="undo-toast"
            role="status"
            initial={{ opacity: 0, y: 30, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={springs.snappy}
          >
            <span>{current.message}</span>
            <button
              type="button"
              onClick={() => {
                current.undo();
                setCurrent(null);
              }}
            >
              Undo
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </UndoContext.Provider>
  );
}

/**
 * The toast, for anything that wants to offer an Undo. Do the thing first,
 * then `offer` what puts it back: a newer offer replaces an older one, as in Mail.
 */
export function useUndo(): UndoValue {
  return useContext(UndoContext);
}

/**
 * Deleting and calling off matches, each with an Undo that puts back exactly
 * what was there. A deleted match comes back as a later edit than the delete,
 * so the other phones in the family get it back too.
 */
export function useMatchActions() {
  const { offer } = useUndo();
  const { deleteMatch, undeleteMatch, cancelMatch, updateMatch } = useStore();
  const name = (match: Match) => match.opponent || 'the match';
  return {
    remove(match: Match) {
      deleteMatch(match.id);
      offer('Match deleted', () => undeleteMatch(match.id));
    },
    callOff(match: Match) {
      const before = { status: match.status, result: match.result, remindAfter: match.remindAfter };
      cancelMatch(match.id);
      offer(`${name(match)} called off`, () => updateMatch(match.id, before));
    },
  };
}

/** Deleting a training session, with the same Undo. */
export function useTrainingActions() {
  const { offer } = useUndo();
  const { deleteTraining, undeleteTraining } = useStore();
  return {
    remove(session: TrainingSession) {
      deleteTraining(session.id);
      offer('Session deleted', () => undeleteTraining(session.id));
    },
  };
}
