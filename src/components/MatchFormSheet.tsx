import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useStore, type NewMatchInput } from '../store/AppStore';
import { MATCH_LENGTHS, VENUE_LABEL, type Match, type MatchStage, type Venue } from '../types';
import { formatDateShort, formatTime, todayISO } from '../lib/date';
import { nextMatchFor } from '../lib/competitions';
import { pastGrounds, type ParsedFixture } from '../lib/fixtures';
import { asScheduleRows, monthFirstLocale, readFixtureMessage, type MessageFixture } from '../lib/fixtureMessage';
import { suggestedOpponents } from '../lib/standings';
import { STAGES, STAGE_LABEL, detailPrompt, stageName, toStage } from '../lib/stage';
import { DurationPicker, Field, Segmented, Sheet } from './ui';

export interface MatchFormTarget {
  mode: 'create' | 'edit';
  match?: Match;
  dateISO?: string;
  /** Where a new match starts - e.g. one added to a tournament from its page. */
  preset?: Partial<NewMatchInput>;
  /** A message shared into the app from another one - read into the form as it opens. */
  sharedText?: string;
}

/** Several games in one pasted message, handed on to be checked together. */
export interface MessageImport {
  fixtures: ParsedFixture[];
  summary: string;
  teamId: string | null;
  competitionId: string | null;
}

type FormValues = {
  opponent: string;
  date: string;
  time: string;
  competitionId: string;
  teamId: string;
  venue: Venue;
  durationMinutes: number;
  location: string;
  notes: string;
  stage: MatchStage | null;
  stageDetail: string;
};

/** What reading a message did, said under the box it was pasted into. */
type PasteNote =
  | { kind: 'filled'; filled: string[] }
  | { kind: 'none' }
  | { kind: 'many'; found: MessageFixture[] }
  | { kind: 'blocked' };

// Older browsers and some webviews can't read the clipboard at all - long-press and Paste still works there.
const CAN_READ_CLIPBOARD = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';

const VENUE_OPTIONS: { value: Venue; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'away', label: 'Away' },
  { value: 'neutral', label: 'Neutral' },
];

export function MatchFormSheet({
  target,
  onClose,
  onCreated,
  onMany,
}: {
  target: MatchFormTarget | null;
  onClose: () => void;
  /** Fired with the new match so the caller can follow up - e.g. ask for the result of a match that has already been played. */
  onCreated?: (match: Match) => void;
  /** A pasted message held a whole list of games: check and add them together instead. */
  onMany?: (games: MessageImport) => void;
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
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pasteNote, setPasteNote] = useState<PasteNote | null>(null);
  const pasteTimer = useRef<number>();

  const values: FormValues = {
    opponent, date, time, competitionId, teamId, venue, durationMinutes, location, notes, stage, stageDetail,
  };
  // The latest form, for a paste read a moment after it was typed.
  const latest = useRef(values);
  latest.current = values;

  const setAll = (v: FormValues) => {
    setOpponent(v.opponent);
    setDate(v.date);
    setTime(v.time);
    setCompetitionId(v.competitionId);
    setTeamId(v.teamId);
    setVenue(v.venue);
    setDurationMinutes(v.durationMinutes);
    setLocation(v.location);
    setNotes(v.notes);
    setStage(v.stage);
    setStageDetail(v.stageDetail);
  };

  /**
   * The form as a message says it should be, on top of what's there. A
   * competition the message names comes first, so the message's own details
   * win over the ones the competition would start a match with.
   */
  const fromMessage = (text: string, base: FormValues): { values: FormValues; note: PasteNote } => {
    const today = todayISO();
    const found = readFixtureMessage(text, {
      today,
      teamNames: teams.map((t) => t.name),
      competitions: competitions.filter((c) => !c.archived).map(({ id, name }) => ({ id, name })),
      monthFirst: monthFirstLocale(),
    });
    if (found.length === 0) return { values: base, note: { kind: 'none' } };
    if (found.length > 1) return { values: base, note: { kind: 'many', found } };

    const [game] = found;
    const v = { ...base };
    const filled: string[] = [];
    // Named in the message, or a tournament already on that day.
    const competition =
      competitions.find((c) => c.id === game.competitionId) ??
      (base.competitionId === '' && game.date
        ? competitions.find(
            (c) =>
              !c.archived &&
              c.type === 'tournament' &&
              (c.startDate === game.date || matches.some((m) => m.competitionId === c.id && m.date === game.date)),
          )
        : undefined);
    if (competition && competition.id !== base.competitionId) {
      const next = nextMatchFor(competition, matches, teams, settings, today);
      Object.assign(v, {
        competitionId: competition.id,
        teamId: next.teamId ?? v.teamId,
        date: next.date,
        time: next.time,
        venue: next.venue,
        location: next.location || v.location,
        durationMinutes: next.durationMinutes,
        stage: next.stage,
        stageDetail: next.stageDetail,
      });
      filled.push(competition.name);
    }
    if (game.date) {
      v.date = game.date;
      filled.push(formatDateShort(game.date));
    }
    if (game.time) {
      v.time = game.time;
      filled.push(`kick-off ${formatTime(game.time)}`);
    }
    if (game.opponent) {
      v.opponent = game.opponent;
      filled.push(game.opponent);
    }
    if (game.venue) {
      v.venue = game.venue;
      filled.push(VENUE_LABEL[game.venue].toLowerCase());
    }
    if (game.location) {
      v.location = game.location;
      filled.push(game.location);
    }
    if (game.stage) {
      v.stage = game.stage;
      v.stageDetail = game.stageDetail;
      filled.push(stageName(game.stage, game.stageDetail));
    }
    if (game.durationMinutes) {
      v.durationMinutes = game.durationMinutes;
      filled.push(`${game.durationMinutes} min`);
    }
    if (game.meet) {
      const line = `Meet ${formatTime(game.meet)}`;
      if (!v.notes.includes(line)) v.notes = [line, v.notes].filter(Boolean).join('\n');
      filled.push(`meet ${formatTime(game.meet)}`);
    }
    return { values: v, note: { kind: 'filled', filled } };
  };

  const readPasted = (text: string) => {
    if (!text.trim()) return setPasteNote(null);
    const read = fromMessage(text, latest.current);
    setAll(read.values);
    if (read.values.durationMinutes !== latest.current.durationMinutes) setLengthTouched(true);
    setPasteNote(read.note);
    setError('');
  };

  const onPastedChange = (text: string) => {
    setPasted(text);
    window.clearTimeout(pasteTimer.current);
    pasteTimer.current = window.setTimeout(() => readPasted(text), 250);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPasted(text);
      readPasted(text);
    } catch {
      setPasteNote({ kind: 'blocked' });
    }
  };

  useEffect(() => () => window.clearTimeout(pasteTimer.current), []);

  useEffect(() => {
    if (!target) return;
    setError('');
    setLengthTouched(false);
    setTeamTouched(false);
    setPasteOpen(Boolean(target.sharedText));
    setPasted(target.sharedText ?? '');
    setPasteNote(null);
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
      // Default to the only competition still running when there is just one - one less tap.
      const running = competitions.filter((c) => !c.archived);
      const chosenId =
        preset.competitionId !== undefined ? preset.competitionId ?? '' : running.length === 1 ? running[0].id : '';
      const chosen = competitions.find((c) => c.id === chosenId);
      const start: FormValues = {
        opponent: preset.opponent ?? '',
        date: preset.date ?? target.dateISO ?? todayISO(),
        time: preset.time ?? settings.defaultKickoff,
        competitionId: chosenId,
        teamId:
          preset.teamId !== undefined
            ? preset.teamId ?? ''
            : chosen?.teamId && teams.some((t) => t.id === chosen.teamId)
              ? chosen.teamId
              : teams.length >= 1
                ? teams[0].id
                : '',
        venue: preset.venue ?? 'home',
        // A tournament that plays shorter games keeps its length as the starting point.
        durationMinutes: preset.durationMinutes ?? (chosen?.matchLength || settings.defaultMatchLength),
        location: preset.location ?? chosen?.location ?? '',
        notes: preset.notes ?? '',
        stage: preset.stage ?? null,
        stageDetail: preset.stageDetail ?? '',
      };
      if (target.sharedText) {
        const read = fromMessage(target.sharedText, start);
        setAll(read.values);
        setPasteNote(read.note);
      } else {
        setAll(start);
      }
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

      {!editing &&
        (pasteOpen ? (
          <div className="paste-box">
            <Field label="Paste the message" hint="Copy it in WhatsApp or Messages, then paste it here.">
              <textarea
                className="input"
                rows={3}
                value={pasted}
                onChange={(e) => onPastedChange(e.target.value)}
                placeholder="e.g. Sat 17th v Oakfield, KO 10:30 at Riverside Park"
                autoFocus={!target.sharedText}
              />
            </Field>
            <div className="paste-actions">
              {CAN_READ_CLIPBOARD && (
                <button type="button" className="ghost-btn" onClick={() => void pasteFromClipboard()}>
                  Paste
                </button>
              )}
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setPasteOpen(false);
                  setPasteNote(null);
                }}
              >
                Close
              </button>
            </div>
            {pasteNote?.kind === 'filled' && (
              <p className="paste-note ok" role="status">
                ✓ Filled in: {pasteNote.filled.join(' · ')}. Check it below.
              </p>
            )}
            {pasteNote?.kind === 'none' && (
              <p className="paste-note" role="status">
                Couldn't find a match in that message, so fill it in below.
              </p>
            )}
            {pasteNote?.kind === 'blocked' && (
              <p className="paste-note" role="status">
                The phone didn't let the app read what's copied. Long-press the box and tap Paste instead.
              </p>
            )}
            {pasteNote?.kind === 'many' && (
              <div className="paste-note many" role="status">
                <span>This message has {pasteNote.found.length} games in it.</span>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => {
                    // A game with no day goes on the tournament's next one, when the message is for one.
                    const named = pasteNote.found.find((g) => g.competitionId)?.competitionId ?? null;
                    const competition = competitions.find((c) => c.id === (competitionId || named));
                    const next = competition ? nextMatchFor(competition, matches, teams, settings, todayISO()) : null;
                    const fallback = next
                      ? { date: next.date, venue: next.venue, location: next.location }
                      : { date, venue, location };
                    onMany?.({
                      fixtures: asScheduleRows(pasteNote.found, fallback),
                      summary: pasteNote.found.some((g) => !g.date)
                        ? `From the message. It didn't say the day for some, so they're on ${formatDateShort(fallback.date)}. Tap Edit on any that aren't.`
                        : 'From the message.',
                      teamId: teamId || next?.teamId || null,
                      competitionId: competition?.id ?? null,
                    });
                  }}
                >
                  Check all {pasteNote.found.length}
                </button>
              </div>
            )}
          </div>
        ) : (
          <button type="button" className="ghost-btn paste-open" onClick={() => setPasteOpen(true)}>
            📋 Paste from a message
          </button>
        ))}

      <Field label="Opponent">
        <input
          className="input"
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder="e.g. Riverside FC"
          autoFocus={!editing && !target.sharedText}
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
