import { useState } from 'react';
import { describeAcademyError, type Selection, type StaffAcademy } from '../../lib/academy';
import {
  BOARDS, BOARD_BY_ID, boardApplies, selectionText, statsFor, type Board, type BoardId, type SquadPlayer, type StatsFilter,
} from '../../lib/academyStats';
import { useAcademy } from '../../store/AcademyProvider';
import { Field, Section, Sheet } from '../ui';
import { useLoad } from './parts';
import type { SquadData } from './StatsScreen';
import { playerFacts } from './useRoster';

/** Team picks: named lists of players for a tournament or a match, saved, shared and printed. */
export function TeamPicks({
  academy,
  data,
  filter,
  board,
}: {
  academy: StaffAcademy;
  data: SquadData;
  filter: StatsFilter;
  board: Board;
}) {
  const { api } = useAcademy();
  const picks = useLoad(api ? () => api.selections(academy.id) : null, academy.id);
  const [editing, setEditing] = useState<{ selection: Selection | null } | null>(null);
  const squadName = (id: string | null) => data.squads.find((s) => s.id === id)?.name;

  return (
    <Section
      title="Team picks"
      action={
        <button className="link-btn" onClick={() => setEditing({ selection: null })}>
          + Pick a team
        </button>
      }
    >
      {picks.error && <p className="notice warn">{picks.error}</p>}
      {picks.data && picks.data.length === 0 && (
        <p className="muted small">
          Picking a team for a tournament? Sort a squad by what matters, tick the players, name it - &quot;Dubai Cup
          2027&quot; - then share or print the list.
        </p>
      )}
      {picks.data && picks.data.length > 0 && (
        <ul className="squad-list">
          {picks.data.map((s) => (
            <li key={s.id}>
              <button className="squad-card" onClick={() => setEditing({ selection: s })}>
                <strong>{s.name}</strong>
                <span className="muted small">
                  {s.playerIds.length} player{s.playerIds.length === 1 ? '' : 's'}
                  {squadName(s.squadId) ? ` · from ${squadName(s.squadId)}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <PickSheet
          key={editing.selection?.id ?? 'new'}
          selection={editing.selection}
          academy={academy}
          data={data}
          filter={filter}
          startBoard={board}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await picks.reload();
          }}
        />
      )}
    </Section>
  );
}

function PickSheet({
  selection,
  academy,
  data,
  filter,
  startBoard,
  onClose,
  onSaved,
}: {
  selection: Selection | null;
  academy: StaffAcademy;
  data: SquadData;
  filter: StatsFilter;
  startBoard: Board;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { api } = useAcademy();
  const [name, setName] = useState(selection?.name ?? '');
  const [squadId, setSquadId] = useState(selection ? (selection.squadId ?? '') : filter.squadId);
  const [boardId, setBoardId] = useState<BoardId>(startBoard.id);
  const [picked, setPicked] = useState<string[]>(selection?.playerIds ?? []);
  const [notes, setNotes] = useState(selection?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const board = BOARD_BY_ID[boardId];
  // Ranked by the chosen number under the season, competition and stage on screen,
  // across the whole squad: anyone it doesn't apply to, or with no games, goes after.
  const scope: StatsFilter = { ...filter, positionGroup: '', squadId: '' };
  const pool = data.players
    .filter((p) => !squadId || p.squadIds.includes(squadId))
    .map((p) => {
      const stats = statsFor(p, scope);
      const value = stats.appearances && boardApplies(board, p) ? board.value(stats) : null;
      return { player: p, stats, value };
    })
    .sort(
      (a, b) =>
        (a.value === null ? 1 : 0) - (b.value === null ? 1 : 0) ||
        (a.value !== null && b.value !== null ? (board.ascending ? a.value - b.value : b.value - a.value) : 0) ||
        b.stats.appearances - a.stats.appearances ||
        a.player.name.localeCompare(b.player.name),
    );

  const byId = (id: string) => data.players.find((p) => p.id === id);
  const chosen = picked.map(byId).filter((p): p is SquadPlayer => Boolean(p));
  const toggle = (id: string) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const text = () => selectionText(name || 'Team pick', academy.name, chosen, notes);

  const save = async () => {
    if (!name.trim()) return setError('Give the pick a name - "Dubai Cup 2027", say.');
    if (!api) return;
    setBusy(true);
    setError('');
    try {
      await api.saveSelection(academy.id, { name, squadId: squadId || null, playerIds: picked, notes }, selection?.id);
      await onSaved();
    } catch (e) {
      setError(describeAcademyError(e));
      setBusy(false);
    }
  };

  const share = async () => {
    setNote('');
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: name || 'Team pick', text: text() });
        return;
      }
      await navigator.clipboard.writeText(text());
      setNote('Copied - paste it into a message.');
    } catch {
      // Closing the share sheet is not a failure.
    }
  };

  const remove = async () => {
    if (!api || !selection || !confirm(`Delete "${selection.name}"?`)) return;
    setBusy(true);
    try {
      await api.deleteSelection(selection.id);
      await onSaved();
    } catch (e) {
      setError(describeAcademyError(e));
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      title={selection ? selection.name : 'Pick a team'}
      subtitle={`${chosen.length} picked`}
      onClose={onClose}
      footer={
        <>
          <button className="ghost-btn" disabled={chosen.length === 0} onClick={() => void share()}>
            Share
          </button>
          <button className="ghost-btn" disabled={chosen.length === 0} onClick={() => window.print()}>
            Print
          </button>
          <button className="primary-btn wide" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dubai Cup 2027" />
      </Field>
      <div className="row two">
        <Field label="From squad">
          <select className="input" value={squadId} onChange={(e) => setSquadId(e.target.value)}>
            <option value="">Everyone</option>
            {data.squads.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sort by">
          <select className="input" value={boardId} onChange={(e) => setBoardId(e.target.value as BoardId)}>
            {BOARDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {chosen.length > 0 && (
        <Field group label={`Picked · ${chosen.length}`}>
          <ol className="picked-list">
            {chosen.map((p) => (
              <li key={p.id}>
                <span>
                  {p.name} <span className="muted small">{playerFacts(p)}</span>
                </span>
                <button className="icon-btn" aria-label={`Take ${p.name} out of the pick`} onClick={() => toggle(p.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ol>
        </Field>
      )}

      <Field group label="Players" hint={`Sorted by ${board.label.toLowerCase()} - tick to pick, in the order you want them listed.`}>
        <ul className="pick-list">
          {pool.map(({ player, stats, value }) => (
            <li key={player.id}>
              <label className="pick-row">
                <input type="checkbox" checked={picked.includes(player.id)} onChange={() => toggle(player.id)} />
                <span className="player-row-main">
                  <strong>{player.name}</strong>
                  <span className="muted small">{playerFacts(player)}</span>
                </span>
                <span className="board-value">
                  <strong>{value === null ? '–' : board.format(value)}</strong>
                  <span className="muted small">{stats.appearances ? `${stats.appearances} apps` : 'no games'}</span>
                </span>
              </label>
            </li>
          ))}
          {pool.length === 0 && <li className="muted small">Nobody in that squad yet.</li>}
        </ul>
      </Field>

      <Field label="Notes" hint="Shared and printed with the list.">
        <textarea className="input" rows={2} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Meet 8am at the ground" />
      </Field>

      {error && <p className="form-error">{error}</p>}
      {note && <p className="notice">{note}</p>}
      {selection && (
        <button className="danger-link" disabled={busy} onClick={() => void remove()}>
          Delete this team pick
        </button>
      )}

      {/* What Print shows: the list alone, on a plain page. */}
      <div className="print-area" aria-hidden="true">
        <h1>{name || 'Team pick'}</h1>
        <p>{academy.name}</p>
        <ol>
          {chosen.map((p) => (
            <li key={p.id}>
              {p.name}
              {playerFacts(p) ? ` (${playerFacts(p)})` : ''}
            </li>
          ))}
        </ol>
        {notes.trim() && <p>{notes.trim()}</p>}
      </div>
    </Sheet>
  );
}
