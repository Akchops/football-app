import { useStore } from '../store/AppStore';
import type { Match } from '../types';
import { formatDateShort, formatTime, relativeDayLabel } from '../lib/date';
import { Sheet } from './ui';

const SNOOZE_MINUTES = 180;

/**
 * The post-kickoff nudge: as soon as a scheduled match's kickoff (plus the
 * configured delay) has passed, the app asks for the result on next open.
 * Several matches can be waiting at once - a tournament day, or a week away
 * from the app - so they're shown as a queue rather than stacked modals.
 */
export function ResultPrompt({
  pending,
  onEnterResult,
  onDismiss,
}: {
  pending: Match[];
  onEnterResult: (match: Match) => void;
  onDismiss: () => void;
}) {
  const { competitionOf, snoozeMatch, cancelMatch, settings } = useStore();
  if (pending.length === 0) return null;

  const snoozeAll = () => {
    for (const m of pending) snoozeMatch(m.id, SNOOZE_MINUTES);
    onDismiss();
  };

  const first = pending[0];
  const many = pending.length > 1;

  return (
    <Sheet
      open
      title={many ? `${pending.length} matches to log` : 'How did it go?'}
      subtitle={
        many
          ? 'These have kicked off since you were last here.'
          : `${first.venue === 'away' ? 'Away at' : 'vs'} ${first.opponent || 'TBC'} · ${relativeDayLabel(first.date)} at ${formatTime(first.time)}`
      }
      onClose={onDismiss}
      footer={
        <>
          <button className="ghost-btn wide" onClick={snoozeAll}>
            Not now
          </button>
          <button className="primary-btn wide" onClick={() => onEnterResult(first)}>
            {many ? 'Start logging' : 'Enter result'}
          </button>
        </>
      }
    >
      <p className="prompt-lead">
        {many
          ? `Tap a match to add the score${settings.playerName ? ` and ${settings.playerName}'s stats` : ' and your stats'}.`
          : 'Add the score and your stats while it’s fresh — it all feeds the stats page.'}
      </p>

      <div className="list">
        {pending.map((m) => {
          const competition = competitionOf(m);
          return (
            <div key={m.id} className="prompt-row">
              <span className="prompt-rail" style={{ background: competition?.color ?? 'var(--accent)' }} />
              <div className="prompt-info">
                <div className="prompt-opponent">
                  {m.venue === 'away' ? '@' : 'vs'} {m.opponent || 'TBC'}
                </div>
                <div className="prompt-meta">
                  {formatDateShort(m.date)} · {formatTime(m.time)}
                  {competition ? ` · ${competition.name}` : ''}
                </div>
              </div>
              <div className="prompt-actions">
                <button className="mini-btn" onClick={() => onEnterResult(m)}>
                  Result
                </button>
                <button
                  className="mini-btn subtle"
                  onClick={() => cancelMatch(m.id)}
                  title="Match didn't happen"
                >
                  Off
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="muted small">
        “Not now” hides this for a few hours. “Off” marks a match as called off so it stops asking.
      </p>
    </Sheet>
  );
}
