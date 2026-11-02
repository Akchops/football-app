import { describe, expect, it } from 'vitest';
import { createBackStack, type BackStack } from './backStack';

/**
 * A browser history to drive by hand. Like the real one, going back is not
 * instant: the page arrives (and popstate fires) a moment later, which is the
 * window in which a sheet handing over to another can go wrong.
 */
function fakeBrowser() {
  const entries: unknown[] = [null];
  let index = 0;
  const arrivals: (() => void)[] = [];
  let stack: BackStack;
  const history = {
    get state() {
      return entries[index];
    },
    pushState(data: unknown) {
      entries.splice(index + 1);
      entries.push(data);
      index += 1;
    },
    go(delta: number) {
      arrivals.push(() => {
        index = Math.max(0, Math.min(entries.length - 1, index + delta));
        stack.popped(entries[index]);
      });
    },
  };
  stack = createBackStack(history);
  return {
    stack,
    /** The phone's back button. */
    back: () => history.go(-1),
    forward: () => history.go(1),
    /** Lets everything waiting happen: queued tidying, then any page arriving, until it's all still. */
    async settle() {
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
        const next = arrivals.shift();
        if (next) next();
      }
    },
    /** How many steps back are left before the app itself would close. */
    get behind() {
      return index;
    },
  };
}

/** A sheet as the Sheet component uses it: closes on back, releases its entry when closed some other way. */
function sheet(stack: BackStack, dismissible = () => true) {
  const s = { closedByBack: false, release: () => {} };
  s.release = stack.open(() => {
    if (!dismissible()) return false;
    s.closedByBack = true;
    s.release();
    return true;
  });
  return s;
}

describe('the back button and sheets', () => {
  it('gives an open sheet one history entry, and back closes it', async () => {
    const page = fakeBrowser();
    const detail = sheet(page.stack);
    await page.settle();
    expect(page.behind).toBe(1);

    page.back();
    await page.settle();
    expect(detail.closedByBack).toBe(true);
    expect(page.behind).toBe(0);
  });

  it('takes the entry back off when the sheet is closed with ✕, the backdrop or Escape', async () => {
    const page = fakeBrowser();
    const detail = sheet(page.stack);
    await page.settle();

    detail.release();
    await page.settle();
    expect(page.behind).toBe(0);
    expect(detail.closedByBack).toBe(false);
  });

  it('closes a sheet over a sheet first, then the one beneath', async () => {
    const page = fakeBrowser();
    const match = sheet(page.stack);
    await page.settle();
    const picker = sheet(page.stack);
    await page.settle();
    expect(page.behind).toBe(2);

    page.back();
    await page.settle();
    expect(picker.closedByBack).toBe(true);
    expect(match.closedByBack).toBe(false);
    expect(page.behind).toBe(1);

    page.back();
    await page.settle();
    expect(match.closedByBack).toBe(true);
    expect(page.behind).toBe(0);
  });

  it('closing the top sheet with ✕ leaves back working for the one beneath', async () => {
    const page = fakeBrowser();
    const match = sheet(page.stack);
    await page.settle();
    const picker = sheet(page.stack);
    await page.settle();

    picker.release();
    await page.settle();
    expect(page.behind).toBe(1);

    page.back();
    await page.settle();
    expect(match.closedByBack).toBe(true);
    expect(page.behind).toBe(0);
  });

  it('lets one sheet hand over to another without touching history', async () => {
    const page = fakeBrowser();
    const detail = sheet(page.stack);
    await page.settle();

    // "Enter result" from a match: one closes as the other opens, in the same moment.
    detail.release();
    const result = sheet(page.stack);
    await page.settle();
    expect(page.behind).toBe(1);

    page.back();
    await page.settle();
    expect(result.closedByBack).toBe(true);
    expect(page.behind).toBe(0);
  });

  it('waits for its own step back to land before giving a new sheet an entry', async () => {
    const page = fakeBrowser();
    const form = sheet(page.stack);
    await page.settle();

    form.release();
    // The tidy-up runs and starts going back, but the page hasn't arrived yet...
    await Promise.resolve();
    // ...when the sheet it returns to opens.
    const competition = sheet(page.stack);
    await page.settle();
    expect(page.behind).toBe(1);

    page.back();
    await page.settle();
    expect(competition.closedByBack).toBe(true);
    expect(page.behind).toBe(0);
  });

  it('keeps a sheet that cannot be dismissed, and its entry, so back does not close the app', async () => {
    const page = fakeBrowser();
    let busy = true;
    const reading = sheet(page.stack, () => !busy);
    await page.settle();

    page.back();
    await page.settle();
    expect(reading.closedByBack).toBe(false);
    expect(page.behind).toBe(1);

    busy = false;
    page.back();
    await page.settle();
    expect(reading.closedByBack).toBe(true);
    expect(page.behind).toBe(0);
  });

  it('leaves nothing behind after many sheets come and go', async () => {
    const page = fakeBrowser();
    for (let i = 0; i < 5; i++) {
      const s = sheet(page.stack);
      await page.settle();
      if (i % 2) s.release();
      else page.back();
      await page.settle();
    }
    expect(page.behind).toBe(0);
  });

  it('undoes forward onto a sheet that is no longer open', async () => {
    const page = fakeBrowser();
    sheet(page.stack);
    await page.settle();
    page.back();
    await page.settle();

    page.forward();
    await page.settle();
    expect(page.behind).toBe(0);
  });

  it('counts a release twice as once', async () => {
    const page = fakeBrowser();
    const match = sheet(page.stack);
    await page.settle();
    const picker = sheet(page.stack);
    await page.settle();

    picker.release();
    picker.release();
    await page.settle();
    expect(page.behind).toBe(1);
    expect(match.closedByBack).toBe(false);
  });
});
