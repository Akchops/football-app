import type { StaffAcademy } from '../../lib/academy';
import { can } from '../../lib/academy';
import { claimsFor, toCheck, waitingForResult } from '../../lib/checks';
import { useAcademy } from '../../store/AcademyProvider';
import { useSync } from '../../store/SyncProvider';
import { useLoad } from './parts';
import { useSquadData } from './useSquadData';

/**
 * How many players' results are waiting for this person to check - under a
 * result they've entered, or logged with no result of theirs yet - and how
 * many results the academy has. Null until known.
 */
export function useCheckWork(academy: StaffAcademy, on: boolean): { toCheck: number | null; results: number | null } {
  const { api } = useAcademy();
  const sync = useSync();
  const me = sync.account?.id ?? '';
  const data = useSquadData(academy);
  const results = useLoad(api && on ? () => api.squadMatches(academy.id) : null, academy.id);
  if (!on) return { toCheck: 0, results: 0 };
  if (data.loading || !results.data) return { toCheck: results.error || data.error ? 0 : null, results: results.error ? 0 : null };
  const mine = can(academy.role, 'run-squads') ? undefined : data.squads.filter((s) => s.coachIds.includes(me)).map((s) => s.id);
  const visible = mine ? results.data.filter((r) => r.squadId && mine.includes(r.squadId)) : results.data;
  const under = visible.reduce((n, r) => n + toCheck(claimsFor(r, data.players), data.checkMap).length, 0);
  const loose = waitingForResult(data.players, results.data, data.checkMap, { squadIds: mine }).reduce((n, w) => n + w.claims.length, 0);
  return { toCheck: under + loose, results: results.data.length };
}
