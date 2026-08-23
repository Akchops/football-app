import { useEffect, useState } from 'react';
import { useStore } from '../store/AppStore';
import type { Match, Venue } from '../types';
import { todayISO } from '../lib/date';
import { Field, Segmented, Sheet } from './ui';

export interface MatchFormTarget {
  mode: 'create' | 'edit';
  match?: Match;
  dateISO?: string;
}

const VENUE_OPTIONS: { value: Venue; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'away', label: 'Away' },
  { value: 'neutral', label: 'Neutral' },
];

export function MatchFormSheet({
  target,
  onClose,
  onCreated,
}: {
  target: MatchFormTarget | null;
  onClose: () => void;
  /** Fired with the new match so the caller can follow up - e.g. ask for the result of a match that has already been played. */
  onCreated?: (match: Match) => void;
}) {
  const { addMatch, updateMatch, competitions, settings } = useStore();
  const editing = target?.mode === 'edit' ? target.match ?? null : null;

  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState(settings.defaultKickoff);
  const [competitionId, setCompetitionId] = useState<string>('');
  const [venue, setVenue] = useState<Venue>('home');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    setError('');
    if (target.match) {
      const m = target.match;
      setOpponent(m.opponent);
      setDate(m.date);
      setTime(m.time);
      setCompetitionId(m.competitionId ?? '');
      setVenue(m.venue);
      setLocation(m.location);
      setNotes(m.notes);
    } else {
      setOpponent('');
      setDate(target.dateISO ?? todayISO());
      setTime(settings.defaultKickoff);
      // Default to the only competition when there is just one - one less tap.
      setCompetitionId(competitions.length === 1 ? competitions[0].id : '');
      setVenue('home');
      setLocation('');
      setNotes('');
    }
  }, [target, settings.defaultKickoff, competitions]);

  if (!target) return null;

  const submit = () => {
    if (!opponent.trim()) {
      setError('Who are you playing? Add an opponent.');
      return;
    }
    if (!date) {
      setError('Pick a date for the match.');
      return;
    }
    const payload = {
      opponent: opponent.trim(),
      date,
      time: time || '00:00',
      competitionId: competitionId || null,
      venue,
      location: location.trim(),
      notes: notes.trim(),
    };
    if (editing) {
      updateMatch(editing.id, payload);
      onClose();
    } else {
      const created = addMatch(payload);
      onClose();
      onCreated?.(created);
    }
  };

  return (
    <Sheet
      open
      title={editing ? 'Edit match' : 'Add match'}
      subtitle={editing ? undefined : 'Fixtures show up on the calendar straight away.'}
      onClose={onClose}
      footer={
        <>
          <button className="ghost-btn wide" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn wide" onClick={submit}>
            {editing ? 'Save changes' : 'Add match'}
          </button>
        </>
      }
    >
      {error && <p className="form-error">{error}</p>}

      <Field label="Opponent">
        <input
          className="input"
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder="e.g. Riverside FC"
          autoFocus={!editing}
        />
      </Field>

      <div className="row two">
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Kickoff">
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>

      <Field label="Home or away">
        <Segmented options={VENUE_OPTIONS} value={venue} onChange={setVenue} />
      </Field>

      <Field
        label="Competition"
        hint={competitions.length === 0 ? 'Add leagues, cups and tournaments in Setup.' : undefined}
      >
        <select className="input" value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
          <option value="">No competition</option>
          {competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.season ? ` (${c.season})` : ''}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Ground / pitch" hint="Optional">
        <input
          className="input"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Central Playing Fields, Pitch 3"
        />
      </Field>

      <Field label="Notes" hint="Optional - meet time, kit colour, anything">
        <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Sheet>
  );
}
