/**
 * The phone's back button, for sheets.
 *
 * On Android, back with a sheet up should put the sheet away - not close the
 * whole app, which is what happens when the app has nothing in the browser's
 * history to go back through. So each open sheet owns one history entry: back
 * removes the newest entry, and the sheet that owned it closes. A sheet put
 * away any other way (✕, the backdrop, Escape, saving) takes its entry back off,
 * so nothing is left behind for back to step through later.
 *
 * The history is only ever brought into line after everything that happened in
 * the same moment has happened. That matters because one sheet often hands over
 * to another - the match closes as its result opens - and going back for one
 * and pushing for the other at once is a race the browser settles differently
 * each time. Counted together, a hand-over is no change at all: the new sheet
 * simply inherits the old one's entry.
 */

/** The parts of `window.history` this needs - narrowed so tests can stand in for it. */
export interface BackHistory {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  go(delta: number): void;
}

/** Marks our entries, and how deep each one is: the first sheet's is 1, one opened over it 2. */
const KEY = 'matchdaySheet';

function depthOf(state: unknown): number {
  const depth = (state as Record<string, unknown> | null)?.[KEY];
  return typeof depth === 'number' && depth > 0 ? depth : 0;
}

export interface BackStack {
  /**
   * A sheet has opened. `close` runs when back is pressed while it is the top
   * one; it returns false to stay open (a sheet that can't be dismissed right
   * now). Returns `release`, for when the sheet closes any other way - safe to
   * call more than once.
   */
  open(close: () => boolean): () => void;
  /** Give it every popstate. */
  popped(state: unknown): void;
}

export function createBackStack(
  history: BackHistory,
  schedule: (run: () => void) => void = queueMicrotask,
): BackStack {
  /** The open sheets, oldest first. */
  const sheets: { close: () => boolean }[] = [];
  /** How many of our entries are behind the current page right now. */
  let depth = depthOf(history.state);
  /** We have gone back ourselves and the browser hasn't arrived yet; nothing moves until it does. */
  let returning = false;
  let queued = false;

  function settle() {
    if (returning) return;
    if (sheets.length > depth) {
      while (depth < sheets.length) {
        depth += 1;
        history.pushState({ [KEY]: depth }, '');
      }
    } else if (sheets.length < depth) {
      returning = true;
      history.go(sheets.length - depth);
    }
  }

  function later() {
    if (queued) return;
    queued = true;
    schedule(() => {
      queued = false;
      settle();
    });
  }

  return {
    open(close) {
      const sheet = { close };
      sheets.push(sheet);
      later();
      return () => {
        const at = sheets.indexOf(sheet);
        if (at === -1) return;
        sheets.splice(at, 1);
        later();
      };
    },

    popped(state) {
      depth = depthOf(state);
      if (returning) {
        // Our own step back has landed. Anything that opened meanwhile gets its entry now.
        returning = false;
        later();
        return;
      }
      // Back: the newest sheets above where history now stands close, one per
      // step - so a sheet over a sheet goes first and leaves the one beneath.
      // Off the stack before it's told, so its own release on the way out finds nothing to do.
      while (sheets.length > depth) {
        const top = sheets.pop()!;
        if (!top.close()) {
          sheets.push(top);
          break;
        }
      }
      // A sheet that stayed open gets its entry back, so the next back doesn't
      // close the app; and forward (on a desktop) past a closed sheet is undone.
      later();
    },
  };
}

let shared: BackStack | null = null;

/** The one back stack for the app's sheets, listening to the real browser history. */
export function sheetBackStack(): BackStack {
  if (!shared) {
    const stack = createBackStack(window.history);
    window.addEventListener('popstate', (e) => stack.popped(e.state));
    shared = stack;
  }
  return shared;
}
