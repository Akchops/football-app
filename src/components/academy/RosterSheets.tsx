import { useState } from 'react';
import {
  PLAYER_STATUS_LABEL, can, canTakeOutOf, cleanUsername, describeAcademyError, squadsToAddTo, usernameProblem,
  type AcademyPlayer, type PlayerStatus, type Squad, type StaffAcademy, type StaffMember,
} from '../../lib/academy';
import { useAcademy } from '../../store/AcademyProvider';
import { AGE_GROUPS, ALL_POSITIONS } from '../../types';
import { Field, Sheet } from '../ui';
import { StatusChip } from './parts';
import { isActive, playerFacts } from './useRoster';

const STATUS_LINE: Record<PlayerStatus, string> = {
  linked: "Linked to their Matchday - their family said yes, so the academy sees their matches and stats.",
  invited: 'Invited - waiting for their family to say yes. Nothing of theirs is shared until they do.',
  requested: 'Asked to join with the code - waiting for a coach, a manager or the owner to say yes.',
  roster: "A name on your list, with no Matchday linked - so no stats.",
  left: 'Left the academy. Their matches and stats are no longer shared.',
  declined: 'Their family said no.',
};

/** Runs a change, then reloads; keeps any error to show. */
function useChange(onChanged: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (work: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    setError('');
    try {
      await work();
      after?.();
      await onChanged();
    } catch (e) {
      setError(describeAcademyError(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/** A squad: its name, its coaches, and who is in it. */
export function SquadSheet(props: {
  academy: StaffAcademy;
  squad: Squad | null;
  players: AcademyPlayer[];
  staff: StaffMember[];
  me: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onOpenPlayer: (id: string) => void;
}) {
  if (!props.squad) return null;
  // Keyed, so opening another squad starts from that squad's own details.
  return <SquadSheetBody key={props.squad.id} {...props} squad={props.squad} />;
}

function SquadSheetBody({
  academy,
  squad,
  players,
  staff,
  me,
  onClose,
  onChanged,
  onOpenPlayer,
}: {
  academy: StaffAcademy;
  squad: Squad;
  players: AcademyPlayer[];
  staff: StaffMember[];
  me: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onOpenPlayer: (id: string) => void;
}) {
  const { api } = useAcademy();
  const { busy, error, run } = useChange(onChanged);
  const [name, setName] = useState(squad.name);
  const [ageGroup, setAgeGroup] = useState(squad.ageGroup);
  const [query, setQuery] = useState('');

  const role = academy.role;
  const runs = can(role, 'run-squads');
  const takeOut = canTakeOutOf(role, me, squad);
  const members = players.filter((p) => squad.memberIds.includes(p.id) && isActive(p));
  const candidates = players.filter(
    (p) => isActive(p) && !squad.memberIds.includes(p.id) && squadsToAddTo(role, me, [squad], p).length > 0,
  );
  const q = query.trim().toLowerCase();
  const shownCandidates = candidates.filter((p) => !q || p.name.toLowerCase().includes(q));
  // The admin role works on the office side; it never coaches.
  const coachable = staff.filter((m) => m.role !== 'admin');
  const renamed = name.trim() !== squad.name || ageGroup !== squad.ageGroup;

  const remove = () => {
    if (!api || !confirm(`Delete the squad "${squad.name}"? Its players stay on your books.`)) return;
    void run(() => api.deleteSquad(squad.id), onClose);
  };

  return (
    <Sheet
      open
      title={squad.name}
      subtitle={[squad.ageGroup, `${members.length} player${members.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
      onClose={onClose}
    >
      {runs && (
        <>
          <div className="row two">
            <Field label="Squad name">
              <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Age group">
              <select className="input" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
                <option value="">Any</option>
                {AGE_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {renamed && (
            <div className="button-row">
              <button
                className="primary-btn small"
                disabled={busy || !name.trim()}
                onClick={() => api && void run(() => api.updateSquad(squad.id, { name, ageGroup }))}
              >
                Save
              </button>
            </div>
          )}
        </>
      )}

      <Field group label="Coaches" hint={runs ? "They see this squad's players and their stats." : undefined}>
        {runs ? (
          <div className="chip-wrap">
            {coachable.map((m) => {
              const on = squad.coachIds.includes(m.userId);
              return (
                <button
                  key={m.userId}
                  type="button"
                  className={on ? 'filter-chip on' : 'filter-chip'}
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => api && void run(() => api.setSquadCoach(squad.id, m.userId, !on))}
                >
                  @{m.username || 'no username'}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="small">
            {squad.coachIds
              .map((id) => staff.find((m) => m.userId === id)?.username)
              .filter(Boolean)
              .map((n) => `@${n}`)
              .join(', ') || 'No coach yet'}
          </p>
        )}
      </Field>

      {error && <p className="notice warn">{error}</p>}

      <Field group label={`In the squad · ${members.length}`}>
        {members.length === 0 ? (
          <p className="muted small">Nobody yet.</p>
        ) : (
          <ul className="player-list compact">
            {members.map((p) => (
              <li key={p.id}>
                <button className="player-row" onClick={() => onOpenPlayer(p.id)}>
                  <span className="player-row-main">
                    <strong>{p.name}</strong>
                    <span className="muted small">{playerFacts(p)}</span>
                  </span>
                  <StatusChip status={p.status} />
                </button>
                {takeOut && (
                  <button
                    className="link-btn"
                    disabled={busy}
                    aria-label={`Take ${p.name} out of ${squad.name}`}
                    onClick={() => api && void run(() => api.setSquadMember(squad.id, p.id, false))}
                  >
                    Take out
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Field>

      {candidates.length > 0 && (
        <Field
          group
          label="Add to the squad"
          hint={runs ? undefined : 'You can add names with no app, and players not linked yet.'}
        >
          {candidates.length > 8 && (
            <input
              className="input"
              type="search"
              placeholder="Find a player"
              aria-label="Find a player to add"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <ul className="player-list compact">
            {shownCandidates.map((p) => (
              <li key={p.id}>
                <span className="player-row-main">
                  <strong>{p.name}</strong>
                  <span className="muted small">{playerFacts(p)}</span>
                </span>
                <button
                  className="ghost-btn"
                  disabled={busy}
                  aria-label={`Add ${p.name} to ${squad.name}`}
                  onClick={() => api && void run(() => api.setSquadMember(squad.id, p.id, true))}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </Field>
      )}

      {runs && (
        <div className="sheet-actions">
          <button className="danger-link" disabled={busy} onClick={remove}>
            Delete this squad
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** One player on the books: their details, their squads, linking them, and taking them off. */
export function PlayerSheet(props: {
  academy: StaffAcademy;
  player: AcademyPlayer | null;
  squads: Squad[];
  me: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  if (!props.player) return null;
  return <PlayerSheetBody key={props.player.id} {...props} player={props.player} />;
}

function PlayerSheetBody({
  academy,
  player,
  squads,
  me,
  onClose,
  onChanged,
}: {
  academy: StaffAcademy;
  player: AcademyPlayer;
  squads: Squad[];
  me: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { api } = useAcademy();
  const { busy, error, run } = useChange(onChanged);
  const [name, setName] = useState(player.name);
  const [position, setPosition] = useState(player.position);
  const [ageGroup, setAgeGroup] = useState(player.ageGroup);
  const [username, setUsername] = useState('');
  const [note, setNote] = useState('');

  const role = academy.role;
  const editable = can(role, 'add-players');
  const changed = name.trim() !== player.name || position !== player.position || ageGroup !== player.ageGroup;
  const linkable = editable && (player.status === 'roster' || player.status === 'left' || player.status === 'declined');

  const link = () => {
    const handle = cleanUsername(username);
    const problem = usernameProblem(handle);
    if (problem || !api) return setNote(handle ? `@${handle} can't be anyone's username.` : 'Type their username.');
    setNote('');
    void run(
      () => api.invitePlayer(academy.id, handle, { rosterId: player.id }).then(() => undefined),
      () => {
        setUsername('');
        setNote(`Invited @${handle}. Their family says yes in their Matchday, and then ${player.name} is linked.`);
      },
    );
  };

  const remove = () => {
    if (!api) return;
    const question =
      player.status === 'invited'
        ? `Cancel the invite and take ${player.name} off your list?`
        : `Take ${player.name} off your books? ${player.status === 'linked' ? 'The academy stops seeing their matches and stats straight away. ' : ''}This can't be undone.`;
    if (confirm(question)) void run(() => api.removePlayer(player.id), onClose);
  };

  return (
    <Sheet open title={player.name} subtitle={PLAYER_STATUS_LABEL[player.status]} onClose={onClose}>
      <p className="small">{STATUS_LINE[player.status]}</p>

      {editable ? (
        <>
          <Field label="Name">
            <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="row two">
            <Field label="Position">
              <select className="input" value={position} onChange={(e) => setPosition(e.target.value)}>
                <option value="">Not sure</option>
                {ALL_POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Age group">
              <select className="input" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
                <option value="">Not sure</option>
                {AGE_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {changed && (
            <div className="button-row">
              <button
                className="primary-btn small"
                disabled={busy || !name.trim()}
                onClick={() => api && void run(() => api.updatePlayer(player.id, { name, position, ageGroup }))}
              >
                Save
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="muted small">{playerFacts(player) || 'No position or age group yet.'}</p>
      )}

      {isActive(player) && squads.length > 0 && (
        <Field group label="Squads">
          <div className="chip-wrap">
            {squads.map((s) => {
              const on = s.memberIds.includes(player.id);
              const allowed = on ? canTakeOutOf(role, me, s) : squadsToAddTo(role, me, [s], player).length > 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={on ? 'filter-chip on' : 'filter-chip'}
                  aria-pressed={on}
                  disabled={busy || !allowed}
                  onClick={() => api && void run(() => api.setSquadMember(s.id, player.id, !on))}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      {linkable && (
        <Field label="Link to their Matchday" hint="If they have the app, their username is in their Setup → Academies.">
          <span className="username-input">
            <span className="at" aria-hidden="true">
              @
            </span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && !busy && link()}
              placeholder="their_username"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              maxLength={21}
              aria-label="Their username"
            />
          </span>
        </Field>
      )}
      {linkable && (
        <div className="button-row">
          <button className="ghost-btn" disabled={busy || !username} onClick={link}>
            Send invite
          </button>
        </div>
      )}

      {error && <p className="notice warn">{error}</p>}
      {note && <p className="notice">{note}</p>}

      {can(role, 'remove-players') && (
        <div className="sheet-actions">
          <button className="danger-link" disabled={busy} onClick={remove}>
            {player.status === 'invited' ? 'Cancel the invite' : `Take ${player.name} off the books`}
          </button>
        </div>
      )}
    </Sheet>
  );
}
