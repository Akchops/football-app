import { FLAG_PENALTY } from '../lib/academyStats';
import { checkState, statLine } from '../lib/checks';
import { useAcademy } from '../store/AcademyProvider';
import type { Match } from '../types';

/**
 * What a coach made of this match's figures, in the player's own app: checked,
 * or denied and put right - and, if they've changed it since, that it goes
 * back to the coach.
 */
export function MatchCheckNote({ match, editing = false }: { match: Match; editing?: boolean }) {
  const { checks } = useAcademy();
  const mine = checks.filter((c) => c.matchId === match.id);
  if (mine.length === 0) return null;
  return (
    <div className="check-notes">
      {mine.map((c) => {
        const state = checkState(c, match);
        const who = `@${c.reviewedBy || 'your coach'} at ${c.academyName}`;
        if (editing) {
          return (
            <p key={c.id} className="notice">
              {state === 'denied'
                ? `${who} corrected this result. Change it again and it goes back to them to check.`
                : `${who} has checked this result. If you change it, it goes back to them to check again.`}
            </p>
          );
        }
        return (
          <div key={c.id} className={`check-note ${state}`}>
            {state === 'approved' && (
              <>
                <strong>✓ Checked by your coach</strong>
                <span>{who} agreed with your figures.</span>
              </>
            )}
            {state === 'denied' && (
              <>
                <strong>🚩 Your coach didn&apos;t agree</strong>
                <span>
                  {who} denied the figures you put in{c.corrected ? ' and put in theirs - they are what show now' : ''}.
                  {c.claimed ? ` You had said: ${statLine(c.claimed)}.` : ''}
                </span>
                {c.note && <span className="check-note-quote">“{c.note}”</span>}
                {c.flagActive && (
                  <span className="small">
                    You&apos;re flagged at {c.academyName} until a coach there takes it off. While you are, academies see your
                    match score {FLAG_PENALTY} points lower.
                  </span>
                )}
              </>
            )}
            {state === 'changed' && (
              <>
                <strong>Changed since your coach checked it</strong>
                <span>{who} will see it needs checking again.</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
