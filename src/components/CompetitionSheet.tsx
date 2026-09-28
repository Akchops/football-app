import { useLayoutEffect, useMemo, useState } from 'react';
import { useStore } from '../store/AppStore';
import { AGE_GROUPS, COMPETITION_TYPE_LABEL, PLACINGS, POSITION_GROUP_LABEL, type Match } from '../types';
import { formatDateShort, formatTime, kickoffAt } from '../lib/date';
import { positionStatCards } from '../lib/metrics';
import { personalBests } from '../lib/records';
import { scoreVerdict } from '../lib/score';
import { computeStats, mainPositionGroup, placingLabel, recordSummary } from '../lib/stats';
import { MatchCard } from './MatchCard';
import { Field, Section, Sheet, StatTile } from './ui';

export interface CompetitionView {
  id: string;
  /** 'finish' opens straight on finishing it - the calendar's nudge does this. */
  step: 'summary' | 'finish';
}

/**
 * One competition on its own - usually a tournament. Its stats are worked out
 * from its matches like everything else in the app, so they're kept for good and
 * stay right if a score is fixed later. Finishing adds what the matches can't
 * say: that it's over, how far the team got, and the age group it was played in.
 */
export function CompetitionSheet({
  view,
  now,
  onClose,
  onOpenMatch,
  onEnterResult,
}: {
  view: CompetitionView | null;
  now: Date;
  onClose: () => void;
  onOpenMatch: (match: Match) => void;
  onEnterResult: (match: Match) => void;
}) {
  const { competitions, matches, teams, profile, colorOf, finishCompetition, reopenCompetition } = useStore();
  const competition = view ? competitions.find((c) => c.id === view.id) ?? null : null;

  const [step, setStep] = useState<CompetitionView['step']>('summary');
  const [placing, setPlacing] = useState('');
  const [custom, setCustom] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [notes, setNotes] = useState('');

  // Oldest first - the order it was played in.
  const own = useMemo(
    () =>
      competition
        ? matches
            .filter((m) => m.competitionId === competition.id)
            .sort((a, b) => kickoffAt(a.date, a.time).getTime() - kickoffAt(b.date, b.time).getTime())
        : [],
    [competition, matches],
  );
  const stats = useMemo(() => computeStats(own), [own]);
  const group = useMemo(() => mainPositionGroup(own, profile.positionGroup), [own, profile.positionGroup]);
  const bests = useMemo(() => personalBests(own, group), [own, group]);

  // Every match for one team - the usual case - is worth naming.
  const teamIds = new Set(own.map((m) => m.teamId));
  const [onlyTeamId] = [...teamIds];
  const team = teamIds.size === 1 ? teams.find((t) => t.id === onlyTeamId) ?? null : null;

  const startFinish = () => {
    if (!competition) return;
    setPlacing(competition.placing);
    setCustom(PLACINGS.includes(competition.placing) ? '' : competition.placing);
    setAgeGroup(competition.ageGroup || team?.ageGroup || profile.ageGroup);
    setNotes(competition.notes);
    setStep('finish');
  };

  // Only when a sheet is opened: following every store change would throw the
  // player back to the form the moment they finish. Before paint, so opening
  // straight on the finish step doesn't flash the summary first.
  useLayoutEffect(() => {
    if (view?.step === 'finish') startFinish();
    else setStep('summary');
  }, [view]);

  if (!view || !competition) return null;

  const noun = COMPETITION_TYPE_LABEL[competition.type].toLowerCase();
  const finished = competition.archived;
  // "How far did you get?" is a knockout question. A league is left out on
  // purpose: finishing one mid-season by mistake would call off every fixture left.
  const finishable = competition.type === 'tournament' || competition.type === 'cup';
  const unplayed = own.filter((m) => m.status === 'scheduled');
  const fixtures = own.filter((m) => m.status !== 'cancelled');
  const calledOff = own.length - fixtures.length;
  const first = own[0]?.date ?? '';
  const last = own[own.length - 1]?.date ?? '';
  const when = !first ? '' : first === last ? formatDateShort(first) : `${formatDateShort(first)} – ${formatDateShort(last)}`;
  const subtitle = [COMPETITION_TYPE_LABEL[competition.type], competition.ageGroup, competition.season, when, team?.name]
    .filter(Boolean)
    .join(' · ');

  if (step === 'finish') {
    const save = () => {
      finishCompetition(competition.id, { placing: placing.trim(), ageGroup, notes: notes.trim() });
      setStep('summary');
    };

    return (
      <Sheet
        open
        title={finished ? `Edit ${competition.name}` : `Finish ${competition.name}`}
        subtitle="Saved with its stats, so you can look back on it."
        onClose={onClose}
        footer={
          <>
            <button className="ghost-btn wide" onClick={() => setStep('summary')}>
              Back
            </button>
            <button className="primary-btn wide" onClick={save}>
              {finished ? 'Save' : `Finish ${noun}`}
            </button>
          </>
        }
      >
        {/* Not a <Field>: a label wrapped round buttons presses the first one when
            its gaps are tapped. */}
        <div className="field">
          <span className="field-label">How far did you get?</span>
          <div className="chip-wrap">
            {PLACINGS.map((p) => (
              <button
                key={p}
                type="button"
                className={placing === p ? 'filter-chip on' : 'filter-chip'}
                aria-pressed={placing === p}
                onClick={() => {
                  setPlacing(placing === p ? '' : p);
                  setCustom('');
                }}
              >
                {placingLabel(p)}
              </button>
            ))}
          </div>
          <input
            className="input"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setPlacing(e.target.value);
            }}
            placeholder="Or type it, e.g. Plate winners"
            aria-label="How far you got, in your own words"
          />
        </div>

        <Field label="Age group" hint={`The one you played in at this ${noun} — it stays with it.`}>
          <select className="input" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
            <option value="">Not set</option>
            {AGE_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notes" hint="Optional — e.g. Golden Glove, player of the tournament">
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {unplayed.length > 0 && (
          <Section title="No result yet">
            <div className="list">
              {unplayed.map((m) => (
                <div key={m.id} className="prompt-row">
                  <span className="prompt-rail" style={{ background: colorOf(m) }} />
                  <div className="prompt-info">
                    <div className="prompt-opponent">
                      {m.venue === 'away' ? '@' : 'vs'} {m.opponent || 'TBC'}
                    </div>
                    <div className="prompt-meta">
                      {formatDateShort(m.date)} · {formatTime(m.time)}
                    </div>
                  </div>
                  <div className="prompt-actions">
                    <button className="mini-btn" onClick={() => onEnterResult(m)}>
                      Result
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="muted small">
              Finishing marks {unplayed.length === 1 ? 'this' : 'these'} as called off — rounds you didn't reach.
              Played {unplayed.length === 1 ? 'it' : 'one'}? Log the result first.
            </p>
          </Section>
        )}
      </Sheet>
    );
  }

  const positionCards = positionStatCards(group, {
    appearances: stats.appearances,
    played: stats.played,
    minutes: stats.minutes,
    cleanSheetsPlayed: stats.cleanSheetsPlayed,
    goalsAgainst: stats.goalsAgainst,
    totals: stats.totals,
  });

  return (
    <Sheet
      open
      title={competition.name}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        finished ? (
          <>
            <button className="ghost-btn wide" onClick={startFinish}>
              Edit
            </button>
            <button className="primary-btn wide" onClick={onClose}>
              Done
            </button>
          </>
        ) : finishable ? (
          <>
            <button className="ghost-btn wide" onClick={onClose}>
              Close
            </button>
            <button className="primary-btn wide" onClick={startFinish}>
              Finish {noun}
            </button>
          </>
        ) : (
          <button className="primary-btn wide" onClick={onClose}>
            Done
          </button>
        )
      }
    >
      {finished ? (
        <div className="placing-hero">
          <strong>{competition.placing ? placingLabel(competition.placing) : 'Finished'}</strong>
          <span>
            {competition.placing ? 'Finished · ' : ''}
            {stats.played} match{stats.played === 1 ? '' : 'es'} played
            {calledOff > 0 ? ` · ${calledOff} called off` : ''}
          </span>
        </div>
      ) : (
        <p className="muted small">
          {fixtures.length === 0 ? 'No matches yet.' : `In progress · ${stats.played} of ${fixtures.length} played`}
        </p>
      )}

      {stats.played > 0 && (
        <div className="record-hero">
          <div className="record-line">
            <div>
              <div className="record-big">{recordSummary(stats)}</div>
              <div className="record-sub">
                {stats.goalsFor}:{stats.goalsAgainst} goals · {stats.cleanSheets} clean sheet
                {stats.cleanSheets === 1 ? '' : 's'}
                {stats.shootoutWins > 0 ? ` · ${stats.shootoutWins} won on pens` : ''}
              </div>
            </div>
          </div>
        </div>
      )}

      {stats.appearances > 0 && (
        <Section title={`Your ${noun} · ${POSITION_GROUP_LABEL[group]}`}>
          <div className="tile-grid">
            <StatTile
              label="Avg match score"
              value={stats.averageScore !== null ? Math.round(stats.averageScore) : '–'}
              sub={stats.averageScore !== null ? scoreVerdict(stats.averageScore) : undefined}
            />
            <StatTile
              label="Appearances"
              value={stats.appearances}
              sub={`${stats.minutes} mins${stats.motm ? ` · ${stats.motm} MOTM` : ''}`}
            />
            {positionCards.map((card) => (
              <StatTile key={card.label} label={card.label} value={card.value} sub={card.sub} />
            ))}
          </div>
        </Section>
      )}

      {bests.length > 0 && (
        <Section title={`Best in this ${noun}`}>
          <div className="table">
            {bests.map((best) => (
              <div key={best.id} className="table-row">
                <span className="table-name">{best.label}</span>
                <span className="table-value best-value">{best.value}</span>
                <span className="table-sub">{best.detail}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {own.length > 0 && (
        <Section title="Matches">
          <div className="list">
            {own.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                showDate={first !== last}
                now={now}
                onOpen={() => onOpenMatch(m)}
                onEnterResult={() => onEnterResult(m)}
              />
            ))}
          </div>
        </Section>
      )}

      {competition.notes && (
        <div className="notes-block">
          <h3>Notes</h3>
          <p>{competition.notes}</p>
        </div>
      )}

      {finished && (
        <div className="sheet-actions">
          <button className="ghost-btn" onClick={() => reopenCompetition(competition.id)}>
            Reopen {noun}
          </button>
        </div>
      )}
    </Sheet>
  );
}
