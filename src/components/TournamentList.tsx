import { formatDateShort } from '../lib/date';
import { placingLabel, recordSummary, type TournamentBreakdown } from '../lib/stats';

/**
 * Tournaments as a list: every one on the Matches tab, the ones with results on
 * Stats. A row opens the tournament's page; one that's still going can be
 * finished straight from its row, and the button stands out once every match
 * has a result.
 */
export function TournamentList({
  rows,
  now,
  onOpen,
  onFinish,
}: {
  rows: TournamentBreakdown[];
  now: Date;
  onOpen: (id: string) => void;
  onFinish: (id: string) => void;
}) {
  // Tournaments pile up over the years, so anything not from this one says which.
  const day = (iso: string) =>
    iso.startsWith(String(now.getFullYear())) ? formatDateShort(iso) : `${formatDateShort(iso)} ${iso.slice(0, 4)}`;

  return (
    <div className="tourney-list">
      {rows.map((row) => {
        const { competition } = row;
        const status = {
          finished: placingLabel(competition.placing) || 'Finished',
          played: 'All played',
          playing: `${row.played} of ${row.fixtures} played`,
          upcoming: row.fixtures ? 'Coming up' : 'No matches yet',
        }[row.status];
        const when = !row.from ? '' : row.from === row.to ? day(row.from) : `${day(row.from)} – ${day(row.to)}`;

        return (
          <div key={competition.id} className="tourney-row">
            <button type="button" className="tourney-main" onClick={() => onOpen(competition.id)}>
              <span className="swatch" style={{ background: competition.color }} />
              <span className="tourney-text">
                <span className="tourney-name">{competition.name}</span>
                <span className="tourney-meta">{[status, competition.ageGroup, when].filter(Boolean).join(' · ')}</span>
              </span>
              {row.played > 0 && <span className="tourney-record">{recordSummary(row)}</span>}
            </button>
            {row.status !== 'finished' && row.played > 0 && (
              <button
                type="button"
                className={row.status === 'played' ? 'mini-btn' : 'mini-btn subtle'}
                onClick={() => onFinish(competition.id)}
                aria-label={`Finish ${competition.name}`}
              >
                Finish
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
