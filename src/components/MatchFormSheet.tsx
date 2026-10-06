import { useEffect, useId, useMemo, useState } from 'react';
import { useStore, type NewMatchInput } from '../store/AppStore';
import { MATCH_LENGTHS, type Match, type MatchStage, type Venue } from '../types';
import { todayISO } from '../lib/date';
import { pastGrounds } from '../lib/fixtures';
import { suggestedOpponents } from '../lib/standings';
import { STAGES, STAGE_LABEL, detailPrompt, toStage } from '../lib/stage';
import { DurationPicker, Field, Segmented, Sheet } from './ui';

export interface MatchFormTarget {
  mode: 'create' | 'edit';
  match?: Match;
  dateISO?: string;
  /** Where a new match starts - e.g. one added to a tournament from its page. */
  preset?: Partial<NewMatchInput>;
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
  const { addMatch, updateMatch, competitions, teams, settings, matches, results } = useStore();
  const editing = target?.mode === 'edit' ? target.match ?? null : null;

  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState(settings.defaultKickoff);
  const [competitionId, setCompetitionId] = useState<string>('');
  const [teamId, setTeamId] = useState<string>('');
  const [venue, setVenue] = useState<Venue>('home');
  const [durationMinutes, setDurationMinutes] = useState(settings.defaultMatchLength);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [stage, setStage] = useState<MatchStage | null>(null);
  const [stageDetail, setStageDetail] = useState('');
  const [error, setError] = useState('');
  // Picking a competition fills in its match length and team, unless they were already chosen by hand.
  const [lengthTouched, setLengthTouched] = useState(false);
  const [teamTouched, setTeamTouched] = useState(false);
  const opponentListId = useId();
  const groundListId = useId();

  useEffect(() => {
    if (!target) return;
    setError('');
    setLengthTouched(false);
    setTeamTouched(false);
    if (target.match) {
      const m = target.match;
      setOpponent(m.opponent);
      setDate(m.date);
      setTime(m.time);
      setCompetitionId(m.competitionId ?? '');
      setTeamId(m.teamId ?? '');
      setVenue(m.venue);
      setDurationMinutes(m.durationMinutes);
      setLocation(m.location);
      setNotes(m.notes);
      setStage(m.stage);
      setStageDetail(m.stageDetail);
    } else {
      const preset = target.preset ?? {};
      setOpponent(preset.opponent ?? '');
      setDate(preset.date ?? target.dateISO ?? todayISO());
      setTime(preset.time ?? settings.defaultKickoff);
      // Default to the only competition still running when there is just one - one less tap.
      const running = competitions.filter((c) => !c.archived);
      const chosenId =
        preset.competitionId !== undefined ? preset.competitionId ?? '' : running.length === 1 ? running[0].id : '';
      const chosen = competitions.find((c) => c.id === chosenId);
      setCompetitionId(chosenId);
      setTeamId(
        preset.teamId !== undefined
          ? preset.teamId ?? ''
          : chosen?.teamId && teams.some((t) => t.id === chosen.teamId)
            ? chosen.teamId
            : teams.length >= 1
              ? teams[0].id
              : '',
      );
      setVenue(preset.venue ?? 'home');
      // A tournament that plays shorter games keeps its length as the starting point.
      setDurationMinutes(preset.durationMinutes ?? (chosen?.matchLength || settings.defaultMatchLength));
      setLocation(preset.location ?? chosen?.location ?? '');
      setNotes(preset.notes ?? '');
      setStage(preset.stage ?? null);
      setStageDetail(preset.stageDetail ?? '');
    }
    // Only when the sheet opens: a sync landing while it's open must not wipe what's being typed.
  }, [target]);

  const opponentSuggestions = useMemo(
    () => (target ? suggestedOpponents(matches, results, competitionId || null, teams.map((t) => t.name)) : []),
    [target, matches, results, competitionId, teams],
  );
  const groundSuggestions = useMemo(() => (target ? pastGrounds(matches) : []), [target, matches]);

  if (!target) return null;

  // Stages belong to cups and tournaments; a league game never asks. A match
  // that already has one keeps the field, so it can be changed or cleared.
  const competition = competitions.find((c) => c.id === competitionId) ?? null;
  const showStage = stage !== null || competition?.type === 'cup' || competition?.type === 'tournament';

  const pickCompetition = (id: string) => {
    setCompetitionId(id);
    const picked = competitions.find((c) => c.id === id);
    if (editing || !picked) return;
    if (picked.matchLength > 0 && !lengthTouched) setDurationMinutes(picked.matchLength);
    if (picked.teamId && !teamTouched && teams.some((t) => t.id === picked.teamId)) setTeamId(picked.teamId);
    if (picked.location && !location.trim()) setLocation(picked.location);
  };

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
      teamId: teamId || null,
      venue,
      durationMinutes,
      location: location.trim(),
      notes: notes.trim(),
      stage,
      stageDetail: stage ? stageDetail.trim() : '',
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
      subtitle={
        editing
          ? undefined
          : target.preset?.competitionId && competition
            ? `For ${competition.name}. It shows up on the calendar straight away.`
            : 'Fixtures show up on the calendar straight away.'
      }
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
          list={opponentSuggestions.length > 0 ? opponentListId : undefined}
          autoComplete="off"
        />
        <datalist id={opponentListId}>
          {opponentSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </Field>

      <div className="row two">
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Kickoff">
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>

      {teams.length > 0 && (
        <Field label="Playing for" hint={teams.length === 1 ? undefined : 'Which of your teams is this match for?'}>
          <select
            className="input"
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              setTeamTouched(true);
            }}
          >
            <option value="">No team set</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.ageGroup ? ` (${t.ageGroup})` : ''}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field group label="Home or away">
        <Segmented options={VENUE_OPTIONS} value={venue} onChange={setVenue} />
      </Field>

      <Field
        label="Competition"
        hint={competitions.length === 0 ? 'Add leagues, cups and tournaments in Setup.' : undefined}
      >
        <select className="input" value={competitionId} onChange={(e) => pickCompetition(e.target.value)}>
          <option value="">No competition</option>
          {/* A finished one isn't taking new fixtures, but a match already in it keeps it. */}
          {competitions
            .filter((c) => !c.archived || c.id === editing?.competitionId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.season ? ` (${c.season})` : ''}
              </option>
            ))}
        </select>
      </Field>

      {showStage && (
        <div className="row two">
          <Field label="Stage">
            <select
              className="input"
              value={stage ?? ''}
              onChange={(e) => setStage(toStage(e.target.value))}
            >
              <option value="">None</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          {stage && (
            <Field label={detailPrompt(stage).label} hint="Optional">
              <input
                className="input"
                value={stageDetail}
                onChange={(e) => setStageDetail(e.target.value)}
                placeholder={detailPrompt(stage).placeholder}
              />
            </Field>
          )}
        </div>
      )}

      <Field
        label="Match length"
        hint="Youth and small-sided games are rarely 90 minutes — this sets how long a full game is for this match."
      >
        <DurationPicker
          value={durationMinutes}
          onChange={(minutes) => {
            setDurationMinutes(minutes);
            setLengthTouched(true);
          }}
          presets={MATCH_LENGTHS}
        />
      </Field>

      <Field label="Ground / pitch" hint="Optional">
        <input
          className="input"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Central Playing Fields, Pitch 3"
          list={groundSuggestions.length > 0 ? groundListId : undefined}
          autoComplete="off"
        />
        <datalist id={groundListId}>
          {groundSuggestions.map((ground) => (
            <option key={ground} value={ground} />
          ))}
        </datalist>
      </Field>

      <Field label="Notes" hint="Optional - meet time, kit colour, anything">
        <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Sheet>
  );
}
