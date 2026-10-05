import { useCallback } from 'react';
import type { AcademyPlayer, Squad, StaffAcademy, StaffMember } from '../../lib/academy';
import { useAcademy } from '../../store/AcademyProvider';
import { useLoad } from './parts';

export interface Roster {
  squads: Squad[] | null;
  players: AcademyPlayer[] | null;
  staff: StaffMember[] | null;
  error: string;
  reload: () => Promise<void>;
}

/** An academy's squads, everyone on its books and its staff, loaded together. */
export function useRoster(academy: StaffAcademy): Roster {
  const { api } = useAcademy();
  const squads = useLoad(api ? () => api.squads(academy.id) : null, academy.id);
  const players = useLoad(api ? () => api.players(academy.id) : null, academy.id);
  const staff = useLoad(api ? () => api.staff(academy.id) : null, academy.id);
  const reloadSquads = squads.reload;
  const reloadPlayers = players.reload;
  const reloadStaff = staff.reload;

  const reload = useCallback(async () => {
    await Promise.all([reloadSquads(), reloadPlayers(), reloadStaff()]);
  }, [reloadSquads, reloadPlayers, reloadStaff]);

  return {
    squads: squads.data,
    players: players.data,
    staff: staff.data,
    error: squads.error || players.error || staff.error,
    reload,
  };
}

/** Still on the books: linked, invited, asking, or a name with no app. */
export function isActive(player: AcademyPlayer): boolean {
  return player.status !== 'left' && player.status !== 'declined';
}

/** "GK · U16" - whatever is known about a player, for a line under their name. */
export function playerFacts(player: AcademyPlayer, extra: string[] = []): string {
  return [player.position, player.ageGroup, ...extra].filter(Boolean).join(' · ');
}
