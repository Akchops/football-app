import { useLayoutEffect, useState } from 'react';
import {
  can, cleanUsername, describeAcademyError, squadsToAddTo, usernameProblem, type AcademyPlayer, type Squad, type StaffAcademy,
} from '../../lib/academy';
import { useAcademy } from '../../store/AcademyProvider';
import { useSync } from '../../store/SyncProvider';
import { AGE_GROUPS, ALL_POSITIONS } from '../../types';
import { Field, Section, Segmented, Sheet } from '../ui';
import { StatusChip } from './parts';
import { PlayerSheet, SquadSheet } from './RosterSheets';
import { isActive, playerFacts, useRoster } from './useRoster';

/** A squad picker's choices, with a first option for none. */
export function SquadSelect({
  label,
  squads,
  value,
  onChange,
  hint,
}: {
  label: string;
  squads: Squad[];
  value: string;
  onChange: (id: string) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No squad for now</option>
        {squads.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Everyone on the academy's books, its squads, and anyone asking to join. */
export function PlayersScreen({ academy }: { academy: StaffAcademy }) {
  const sync = useSync();
  const me = sync.account?.id ?? '';
  const roster = useRoster(academy);
  const [adding, setAdding] = useState(false);
  const [newSquad, setNewSquad] = useState(false);
  const [squadId, setSquadId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showGone, setShowGone] = useState(false);

  const role = academy.role;
  const squads = roster.squads ?? [];
  const players = roster.players ?? [];
  const staff = roster.staff ?? [];
  const loading = !roster.squads || !roster.players;

  const requests = players.filter((p) => p.status === 'requested');
  const onBooks = players.filter((p) => p.status === 'linked' || p.status === 'invited' || p.status === 'roster');
  const gone = players.filter((p) => !isActive(p));
  const q = query.trim().toLowerCase();
  const shown = onBooks.filter((p) => !q || p.name.toLowerCase().includes(q));

  const squadNames = (id: string) => squads.filter((s) => s.memberIds.includes(id)).map((s) => s.name);
  const inSquad = (s: Squad) => players.filter((p) => s.memberIds.includes(p.id) && isActive(p)).length;
  const coaches = (s: Squad) =>
    s.coachIds
      .map((id) => staff.find((m) => m.userId === id)?.username)
      .filter((name): name is string => Boolean(name))
      .map((name) => `@${name}`);

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Players</h1>
        {can(role, 'add-players') && (
          <button className="primary-btn small" onClick={() => setAdding(true)}>
            + Add a player
          </button>
        )}
      </div>

      {roster.error && (
        <div className="detail-block">
          <p className="notice warn">{roster.error}</p>
          <div className="button-row">
            <button className="ghost-btn" onClick={() => void roster.reload()}>
              Try again
            </button>
          </div>
        </div>
      )}
      {loading && !roster.error && <p className="muted small">Loading…</p>}

      {requests.length > 0 && (
        <Section title={`Asking to join · ${requests.length}`}>
          {requests.map((p) => (
            <RequestCard key={p.id} academy={academy} player={p} squads={squads} me={me} onDone={roster.reload} />
          ))}
        </Section>
      )}

      {!loading && (
        <Section
          title={`Squads · ${squads.length}`}
          action={
            can(role, 'run-squads') && !newSquad ? (
              <button className="link-btn" onClick={() => setNewSquad(true)}>
                + New squad
              </button>
            ) : undefined
          }
        >
          {newSquad && (
            <NewSquadForm
              academy={academy}
              onDone={async (id) => {
                setNewSquad(false);
                if (!id) return;
                await roster.reload();
                setSquadId(id);
              }}
            />
          )}
          {squads.length === 0 && !newSquad && (
            <p className="muted small">
              No squads yet. Split players into squads like &quot;U14 Elite&quot;, &quot;U14 Development&quot; or
              &quot;Dubai Cup squad&quot; - a player can be in several, and a squad&apos;s coaches see its players&apos;
              stats.
            </p>
          )}
          {squads.length > 0 && (
            <ul className="squad-list">
              {squads.map((s) => {
                const count = inSquad(s);
                const names = coaches(s);
                return (
                  <li key={s.id}>
                    <button className="squad-card" onClick={() => setSquadId(s.id)}>
                      <span className="squad-card-main">
                        <strong>{s.name}</strong>
                        {s.ageGroup && <span className="muted small">{s.ageGroup}</span>}
                      </span>
                      <span className="muted small">
                        {count} player{count === 1 ? '' : 's'} · {names.length ? `coached by ${names.join(', ')}` : 'no coach yet'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      {!loading && (
        <Section title={`Everyone · ${onBooks.length}`}>
          {onBooks.length > 6 && (
            <input
              className="input"
              type="search"
              placeholder="Find a player"
              aria-label="Find a player"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {onBooks.length === 0 ? (
            <p className="muted small">
              No players yet. Invite players who use Matchday by their username, or share the join code from Home so
              they can ask to join. Players without the app can go on the list by name, so squad lists are complete.
            </p>
          ) : (
            <ul className="player-list">
              {shown.map((p) => (
                <li key={p.id}>
                  <button className="player-row" onClick={() => setPlayerId(p.id)}>
                    <span className="player-row-main">
                      <strong>{p.name}</strong>
                      <span className="muted small">{playerFacts(p, squadNames(p.id))}</span>
                    </span>
                    <StatusChip status={p.status} />
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="muted small">Nobody called that.</li>}
            </ul>
          )}
          {gone.length > 0 && (
            <button className="link-btn" onClick={() => setShowGone(!showGone)}>
              {showGone ? 'Hide' : 'Show'} {gone.length} who left or said no
            </button>
          )}
          {showGone && (
            <ul className="player-list">
              {gone.map((p) => (
                <li key={p.id}>
                  <button className="player-row" onClick={() => setPlayerId(p.id)}>
                    <span className="player-row-main">
                      <strong>{p.name}</strong>
                      <span className="muted small">{playerFacts(p)}</span>
                    </span>
                    <StatusChip status={p.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <AddPlayerSheet
        open={adding}
        academy={academy}
        squads={squads}
        me={me}
        onClose={() => setAdding(false)}
        onAdded={roster.reload}
      />
      <SquadSheet
        academy={academy}
        squad={squads.find((s) => s.id === squadId) ?? null}
        players={players}
        staff={staff}
        me={me}
        onClose={() => setSquadId(null)}
        onChanged={roster.reload}
        onOpenPlayer={(id) => {
          setSquadId(null);
          setPlayerId(id);
        }}
      />
      <PlayerSheet
        academy={academy}
        player={players.find((p) => p.id === playerId) ?? null}
        squads={squads}
        me={me}
        onClose={() => setPlayerId(null)}
        onChanged={roster.reload}
      />
    </div>
  );
}

/** Someone who asked to join with the code: say yes into a squad, or no. */
function RequestCard({
  academy,
  player,
  squads,
  me,
  onDone,
}: {
  academy: StaffAcademy;
  player: AcademyPlayer;
  squads: Squad[];
  me: string;
  onDone: () => Promise<void>;
}) {
  const { api } = useAcademy();
  const options = squadsToAddTo(academy.role, me, squads, player);
  // A squad for their age group is the likely answer; one squad is the only one.
  const likely = options.find((s) => s.ageGroup && s.ageGroup === player.ageGroup) ?? (options.length === 1 ? options[0] : null);
  const [picked, setPicked] = useState<string | null>(null);
  const squad = picked ?? likely?.id ?? '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const answer = async (accept: boolean) => {
    if (!api) return;
    if (!accept && !confirm(`Say no to ${player.name}? They can ask again with the code.`)) return;
    setBusy(true);
    setError('');
    try {
      await api.answerJoinRequest(player.id, accept, accept && squad ? squad : undefined);
      await onDone();
    } catch (e) {
      setError(describeAcademyError(e));
      setBusy(false);
    }
  };

  return (
    <div className="request-card">
      <div className="request-head">
        <strong>{player.name}</strong>
        <span className="muted small">{playerFacts(player)}</span>
      </div>
      <p className="small">
        Asked to join with your code. Their family has agreed to share {player.name}&apos;s matches and stats with the
        academy.
      </p>
      {can(academy.role, 'add-players') ? (
        <>
          {options.length > 0 && (
            <SquadSelect
              label="Into squad"
              squads={options}
              value={squad}
              onChange={setPicked}
              hint={
                academy.role === 'coach' && !squad
                  ? 'Without a squad, only the owner and managers see their stats.'
                  : undefined
              }
            />
          )}
          {error && <p className="notice warn">{error}</p>}
          <div className="button-row">
            <button className="primary-btn" disabled={busy} onClick={() => void answer(true)}>
              Accept
            </button>
            <button className="ghost-btn" disabled={busy} onClick={() => void answer(false)}>
              Decline
            </button>
          </div>
        </>
      ) : (
        <p className="muted small">A coach, a manager or the owner says yes.</p>
      )}
    </div>
  );
}

function NewSquadForm({ academy, onDone }: { academy: StaffAcademy; onDone: (id: string | null) => Promise<void> }) {
  const { api } = useAcademy();
  const [name, setName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!name.trim()) return setError('Give the squad a name.');
    if (!api) return;
    setBusy(true);
    setError('');
    try {
      const id = await api.createSquad(academy.id, name, ageGroup);
      await onDone(id);
    } catch (e) {
      setError(describeAcademyError(e));
      setBusy(false);
    }
  };

  return (
    <div className="inline-form">
      <div className="row two">
        <Field label="Squad name">
          <input
            className="input"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && void create()}
            placeholder="e.g. U14 Elite"
            autoFocus
          />
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
      {error && <p className="form-error">{error}</p>}
      <div className="button-row">
        <button className="primary-btn" disabled={busy} onClick={() => void create()}>
          {busy ? 'Making…' : 'Make squad'}
        </button>
        <button className="ghost-btn" disabled={busy} onClick={() => void onDone(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

type AddMode = 'invite' | 'name';

/** Adding a player: someone on Matchday, by username; or just a name, for someone without the app. */
function AddPlayerSheet({
  open,
  academy,
  squads,
  me,
  onClose,
  onAdded,
}: {
  open: boolean;
  academy: StaffAcademy;
  squads: Squad[];
  me: string;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const { api } = useAcademy();
  const options = squadsToAddTo(academy.role, me, squads);
  const [mode, setMode] = useState<AddMode>('invite');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [squad, setSquad] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // Fresh each time it opens; with one squad to choose from, that one.
  const only = options.length === 1 ? options[0].id : '';
  useLayoutEffect(() => {
    if (!open) return;
    setMode('invite');
    setUsername('');
    setName('');
    setPosition('');
    setAgeGroup('');
    setSquad(only);
    setError('');
    setNote('');
  }, [open, only]);

  const run = async (work: () => Promise<string>) => {
    if (!api) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      setNote(await work());
      await onAdded();
    } catch (e) {
      setError(describeAcademyError(e));
    } finally {
      setBusy(false);
    }
  };

  const invite = () => {
    const handle = cleanUsername(username);
    const problem = usernameProblem(handle);
    if (problem) return setError(handle ? `@${handle} can't be anyone's username - ${problem.toLowerCase()}.` : 'Type their username.');
    void run(async () => {
      await api!.invitePlayer(academy.id, handle, { squadId: squad || undefined });
      setUsername('');
      return `Invited @${handle}. Their family says yes in their Matchday before you see anything of theirs.`;
    });
  };

  const addName = () => {
    if (!name.trim()) return setError('Type their name.');
    void run(async () => {
      const id = await api!.addRosterPlayer(academy.id, { name, position, ageGroup });
      if (squad) await api!.setSquadMember(squad, id, true);
      setName('');
      return `${name.trim()} is on the list.`;
    });
  };

  return (
    <Sheet open={open} title="Add a player" onClose={onClose}>
      <Segmented<AddMode>
        options={[
          { value: 'invite', label: 'On Matchday' },
          { value: 'name', label: 'No app yet' },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError('');
          setNote('');
        }}
      />

      {mode === 'invite' ? (
        <>
          <Field label="Their username" hint="Anyone in the player's family can give it - it's in their Setup → Academies.">
            <span className="username-input">
              <span className="at" aria-hidden="true">
                @
              </span>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && !busy && invite()}
                placeholder="their_username"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                maxLength={21}
              />
            </span>
          </Field>
          {options.length > 0 && <SquadSelect label="Into squad" squads={options} value={squad} onChange={setSquad} />}
        </>
      ) : (
        <>
          <Field label="Name">
            <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nathan Shaw" />
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
          {options.length > 0 && <SquadSelect label="Into squad" squads={options} value={squad} onChange={setSquad} />}
          <p className="muted small">
            Just a name, so squad lists are complete - no stats. If they get Matchday later, link them from their name.
          </p>
        </>
      )}

      {error && <p className="notice warn">{error}</p>}
      {note && <p className="notice">{note}</p>}
      <div className="button-row">
        {mode === 'invite' ? (
          <button className="primary-btn" disabled={busy || !username} onClick={invite}>
            {busy ? 'Sending…' : 'Send invite'}
          </button>
        ) : (
          <button className="primary-btn" disabled={busy || !name.trim()} onClick={addName}>
            {busy ? 'Adding…' : 'Add to the list'}
          </button>
        )}
        <button className="ghost-btn" disabled={busy} onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
