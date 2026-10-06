import { Sheet } from './ui';

/**
 * Once, early in January: last year's Wrapped is ready. Either answer puts it
 * away for good - it stays on the Stats page whenever it's wanted again.
 */
export function WrappedInvite({ year, onWatch, onLater }: { year: number; onWatch: () => void; onLater: () => void }) {
  return (
    <Sheet
      open
      title={`Your ${year} Wrapped is here`}
      subtitle="Your year on the pitch, a slide at a time."
      onClose={onLater}
      footer={
        <>
          <button className="ghost-btn wide" onClick={onLater}>
            Later
          </button>
          <button className="primary-btn wide" onClick={onWatch}>
            ▶ Watch it
          </button>
        </>
      }
    >
      <p className="prompt-lead">
        Every match, your best game, your tournaments and the player type your numbers add up to. It's on the Stats page
        any time.
      </p>
    </Sheet>
  );
}
