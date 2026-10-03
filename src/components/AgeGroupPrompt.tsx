import { useStore } from '../store/AppStore';
import type { AgeGroupCheck } from '../lib/date';
import { Sheet } from './ui';

/**
 * Once a year, the first time the app is opened after New Year: move up an age
 * group? It never moves by itself - the player might be playing a year up - and
 * asking here keeps the home screen for the calendar.
 */
export function AgeGroupPrompt({
  check,
  onDismiss,
  onOpenSetup,
}: {
  check: AgeGroupCheck;
  /** Not now: it asks again next time the app is opened. */
  onDismiss: () => void;
  onOpenSetup: () => void;
}) {
  const { teams, confirmAgeGroup } = useStore();
  const moving = teams.filter((t) => t.ageGroup === check.from);

  return (
    <Sheet
      open
      title={`New season ${check.year}`}
      subtitle={`Moving up to ${check.to}?`}
      onClose={onDismiss}
      footer={
        <>
          <button className="ghost-btn wide" onClick={() => confirmAgeGroup(check.from, check.year)}>
            Stay {check.from}
          </button>
          <button className="primary-btn wide" onClick={() => confirmAgeGroup(check.to, check.year)}>
            Move up to {check.to}
          </button>
        </>
      }
    >
      <p className="prompt-lead">
        You're down as {check.from}.
        {moving.length > 0 &&
          ` ${moving.map((t) => t.name).join(' and ')} ${moving.length === 1 ? 'moves' : 'move'} up with you.`}
      </p>
      <button className="link-btn" onClick={onOpenSetup}>
        Playing in a different age group? Pick it in Setup
      </button>
    </Sheet>
  );
}
