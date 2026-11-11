import { useMemo } from 'react';
import type { MatchCheck, Squad, StaffAcademy } from '../../lib/academy';
import { groupOfPosition, type SquadPlayer } from '../../lib/academyStats';
import { activeFlags, checksByMatch } from '../../lib/checks';
import { useAcademy } from '../../store/AcademyProvider';
import { useLoad } from './parts';
import { isActive, useRoster } from './useRoster';

export interface SquadData {
  players: SquadPlayer[];
  squads: Squad[];
  /** Every verdict on these players' matches, this academy's and others'. */
  checks: MatchCheck[];
  /** Player and match to its verdict, this academy's first. */
  checkMap: Map<string, MatchCheck>;
  loading: boolean;
  error: string;
  /** Why the checks didn't load, kept apart so the rest still shows. */
  checksError: string;
  reload: () => Promise<void>;
  /** After a verdict: the checks, and the records too when a correction changed one. */
  reloadChecks: (records?: boolean) => Promise<void>;
}

/**
 * Everyone on the academy's books, each with whatever of their own records the
 * viewer may read - all linked players for the owner and managers, the
 * players in their squads for a coach - and the verdicts on them.
 */
export function useSquadData(academy: StaffAcademy): SquadData {
  const { api } = useAcademy();
  const roster = useRoster(academy);
  const active = (roster.players ?? []).filter(isActive);
  const linked = active
    .filter((p) => p.status === 'linked' && p.playerId)
    .map((p) => p.playerId as string)
    .sort();
  const key = `${academy.id}:${linked.join(',')}`;
  const records = useLoad(api && roster.players ? () => api.playerRecords(linked) : null, key);
  const checks = useLoad(api && roster.players ? () => api.matchChecks(linked) : null, key);
  const squads = roster.squads ?? [];
  const checkList = checks.data ?? [];

  const players = useMemo(
    () =>
      active.map((ap): SquadPlayer => {
        const rec = ap.playerId && ap.status === 'linked' ? records.data?.find((r) => r.playerId === ap.playerId) : undefined;
        const position = rec?.profile?.position || ap.position;
        return {
          id: ap.id,
          name: ap.name,
          position,
          positionGroup: rec?.profile?.positionGroup ?? groupOfPosition(position),
          ageGroup: rec?.profile?.ageGroup || ap.ageGroup,
          squadIds: squads.filter((s) => s.memberIds.includes(ap.id)).map((s) => s.id),
          matches: rec?.matches ?? [],
          competitions: rec?.competitions ?? [],
          playerId: rec ? ap.playerId : null,
          flagged: rec ? activeFlags(checkList, ap.playerId).length > 0 : false,
        };
      }),
    // The roster, records and checks are new arrays on each load, which is when this should change.
    [roster.players, roster.squads, records.data, checks.data],
  );
  const checkMap = useMemo(() => checksByMatch(checkList, academy.id), [checks.data, academy.id]);

  return {
    players,
    squads,
    checks: checkList,
    checkMap,
    loading: !roster.players || !roster.squads || (linked.length > 0 && !records.data && !records.error),
    error: roster.error || records.error,
    checksError: checks.error,
    reload: async () => {
      await roster.reload();
      await Promise.all([records.reload(), checks.reload()]);
    },
    reloadChecks: async (withRecords = false) => {
      await Promise.all([checks.reload(), withRecords ? records.reload() : Promise.resolve()]);
    },
  };
}
