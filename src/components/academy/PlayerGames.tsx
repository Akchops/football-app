import { useMemo, useState } from 'react';
import { describeAcademyError, type MatchCheck } from '../../lib/academy';
import { FLAG_PENALTY, ratingOf, type SquadPlayer } from '../../lib/academyStats';
import { activeFlags, checkKey, checkState, checksByMatch, statLine, type CheckState } from '../../lib/checks';
import { formatDateShort } from '../../lib/date';
import { matchScore } from '../../lib/score';
import { STAGE_SHORT } from '../../lib/stage';
import { computeStats, isWalkover, outcomeOf, playedMatches, scoreline } from '../../lib/stats';
import { useAcademy } from '../../store/AcademyProvider';
import type { Match, MatchResult } from '../../types';
import { LoadingLine, StatTile } from '../ui';
import { useLoad } from './parts';

const STATE_LABEL: Record<CheckState, string> = {
  approved: 'Checked',
  denied: 'Denied',
  changed: 'Changed since checked',
};

/** A verdict as a small chip: ✓ checked, 🚩 denied, ! changed since. */
export function CheckChip({ state }: { state: CheckState | null }) {
  if (!state) return <span className="check-chip none">Not checked</span>;
  return (
    <span className={`check-chip ${state}`}>
      {state === 'approved' ? '✓ ' : state === 'denied' ? '🚩 ' : '! '}
      {STATE_LABEL[state]}
    </span>
  );
}

/**
 * Every game a player has logged, newest first: the score, their rating, and
 * whether a coach has checked it. Tap one for its whole line.
 */
export function PlayerGames({
  player,
  checks,
  limit = 6,
}: {
  player: SquadPlayer;
  checks: Map<string, MatchCheck>;
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const games = playedMatches(player.matches);
  if (games.length === 0) {
    return (
      <p className="muted small">
        {player.playerId ? 'No games logged yet.' : 'No games to show - not linked to their Matchday, or not in a squad you coach.'}
      </p>
    );
  }
  const shown = all ? games : games.slice(0, limit);
  const checked = games.filter((m) => player.playerId && checks.has(checkKey(player.playerId, m.id))).length;

  return (
    <>
      <p className="muted small">
        {games.length} game{games.length === 1 ? '' : 's'} logged · {checked} checked by a coach
      </p>
      <ul className="games-list">
        {shown.map((m) => {
          const check = player.playerId ? checks.get(checkKey(player.playerId, m.id)) : undefined;
          const open = openId === m.id;
          return (
            <li key={m.id}>
              <button className="game-row" aria-expanded={open} onClick={() => setOpenId(open ? null : m.id)}>
                <span className="game-when">{formatDateShort(m.date)}</span>
                <span className="game-main">
                  <strong>
                    {m.venue === 'away' ? '@ ' : 'v '}
                    {m.opponent || 'TBC'}
                  </strong>
                  <span className="muted small">{gameFacts(m)}</span>
                </span>
                <span className="game-side">
                  <span className={`game-score outcome-${outcomeOf(m.result).toLowerCase()}`}>{scoreline(m.result)}</span>
                  {check ? <CheckChip state={checkState(check, m)} /> : null}
                </span>
              </button>
              {open && <GameDetail match={m} check={check} />}
            </li>
          );
        })}
      </ul>
      {games.length > limit && (
        <button className="link-btn" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${games.length} games`}
        </button>
      )}
    </>
  );
}

function gameFacts(m: Match & { result: MatchResult }): string {
  return [
    m.stage && m.stage !== 'group' ? STAGE_SHORT[m.stage] : '',
    m.result.didPlay && !isWalkover(m.result) ? `rating ${matchScore(m.result, m.durationMinutes).score}` : 'did not play',
  ]
    .filter(Boolean)
    .join(' · ');
}

function GameDetail({ match, check }: { match: Match & { result: MatchResult }; check?: MatchCheck }) {
  const state = check ? checkState(check, match) : null;
  return (
    <div className="game-detail">
      <p className="small">{statLine(match.result)}</p>
      {check && (
        <p className="muted small">
          {state === 'approved' && `Checked by @${check.reviewedBy || 'a coach'} at ${check.academyName}.`}
          {state === 'denied' &&
            `Denied by @${check.reviewedBy || 'a coach'} at ${check.academyName}${check.corrected ? ', who put in the right figures' : ''}.`}
          {state === 'changed' && `Checked at ${check.academyName}, but the player has changed it since - it needs checking again.`}
          {check.verdict === 'denied' && check.claimed && ` They had said: ${statLine(check.claimed)}.`}
          {check.note && ` “${check.note}”`}
        </p>
      )}
      {!check && <p className="muted small">Logged by the player; no coach has checked it.</p>}
    </div>
  );
}

/**
 * A player's flag: how many results a coach denied, what it costs them, and -
 * for those who may - taking it off.
 */
export function FlagNotice({
  academyId,
  player,
  checks,
  canClear,
  onCleared,
}: {
  academyId: string;
  player: Pick<SquadPlayer, 'name' | 'playerId'>;
  checks: MatchCheck[];
  canClear: boolean;
  onCleared: () => Promise<void>;
}) {
  const { api } = useAcademy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const flags = activeFlags(checks, player.playerId);
  if (flags.length === 0) return null;
  const ours = flags.filter((f) => f.academyId === academyId);
  const elsewhere = [...new Set(flags.filter((f) => f.academyId !== academyId).map((f) => f.academyName))];

  const clear = async () => {
    if (!api || !player.playerId) return;
    if (!confirm(`Take the flag off ${player.name}? The denied results stay denied, but stop counting against them.`)) return;
    setBusy(true);
    setError('');
    try {
      await api.clearFlags(academyId, player.playerId);
      await onCleared();
    } catch (e) {
      setError(describeAcademyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flag-notice" role="status">
      <strong>🚩 Flagged for false results</strong>
      <p className="small">
        {ours.length > 0 && `A coach here denied ${ours.length} of ${player.name}'s results. `}
        {elsewhere.length > 0 && `Denied at ${elsewhere.join(', ')} too. `}
        While flagged, their match score counts {FLAG_PENALTY} points lower in your rankings and team picks.
      </p>
      {error && <p className="notice warn">{error}</p>}
      {canClear && ours.length > 0 && (
        <button className="ghost-btn small" disabled={busy} onClick={() => void clear()}>
          Take the flag off
        </button>
      )}
    </div>
  );
}

/**
 * One player's games and their numbers, loaded when their page opens - for
 * the Players tab, where the rest of the academy's records aren't loaded.
 */
export function PlayerRecord({
  academy,
  player,
  squadIds,
  mayClear,
}: {
  academy: { id: string };
  player: { name: string; position: string; ageGroup: string; playerId: string };
  squadIds: string[];
  mayClear: boolean;
}) {
  const { api } = useAcademy();
  const records = useLoad(api ? () => api.playerRecords([player.playerId]) : null, player.playerId);
  const checks = useLoad(api ? () => api.matchChecks([player.playerId]) : null, player.playerId);
  const checkList = checks.data ?? [];
  const map = useMemo(() => checksByMatch(checkList, academy.id), [checks.data, academy.id]);

  if (records.error) return <p className="notice warn">{records.error}</p>;
  if (!records.data) return <LoadingLine>Loading their games…</LoadingLine>;
  const rec = records.data.find((r) => r.playerId === player.playerId);
  if (!rec) {
    return <p className="muted small">You can&apos;t see {player.name}&apos;s games - they&apos;re not in a squad you coach.</p>;
  }
  const flagged = activeFlags(checkList, player.playerId).length > 0;
  const sp: SquadPlayer = {
    id: player.playerId,
    name: player.name,
    position: rec.profile?.position || player.position,
    positionGroup: rec.profile?.positionGroup ?? 'midfielder',
    ageGroup: rec.profile?.ageGroup || player.ageGroup,
    squadIds,
    matches: rec.matches,
    competitions: rec.competitions,
    playerId: player.playerId,
    flagged,
  };
  const stats = computeStats(rec.matches);
  const rating = ratingOf(stats.averageScore, flagged);

  return (
    <>
      <FlagNotice
        academyId={academy.id}
        player={sp}
        checks={checkList}
        canClear={mayClear}
        onCleared={async () => {
          await checks.reload();
        }}
      />
      {stats.played > 0 && (
        <div className="tile-grid">
          <StatTile label="Appearances" value={stats.appearances} sub={`${stats.minutes} min`} />
          <StatTile label="Match score" value={rating === null ? '–' : Math.round(rating)} sub={flagged ? `average · −${FLAG_PENALTY} flag` : 'average'} />
          <StatTile label="Record" value={`${stats.wins}-${stats.draws}-${stats.losses}`} sub="won-drawn-lost" />
        </div>
      )}
      <PlayerGames player={sp} checks={map} />
      {checks.error && <p className="notice warn">{checks.error}</p>}
    </>
  );
}
