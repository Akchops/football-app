import { useLayoutEffect, useMemo, useState } from 'react';
import { useStore } from '../store/AppStore';
import {
  AGE_GROUPS, COMPETITION_TYPE_LABEL, PLACINGS, POSITION_GROUP_LABEL, type Competition, type Match, type Result,
} from '../types';
import { formatDateShort, formatTime, kickoffAt } from '../lib/date';
import { positionStatCards } from '../lib/metrics';
import { personalBests } from '../lib/records';
import { scoreVerdict } from '../lib/score';
import { computeStats, mainPositionGroup, placingLabel, recordSummary } from '../lib/stats';
import { stageName } from '../lib/stage';
import { shareCard } from '../lib/share';
import { renderTournamentCard } from '../lib/tournamentCard';
import { ACADEMY } from '../lib/features';
import { knownTeams, standings } from '../lib/standings';
import { GroundLink } from './GroundLink';
import { MatchCard } from './MatchCard';
import { StandingsTable } from './StandingsTable';
import { TableResultSheet, type TableResultTarget } from './TableResultSheet';
import { Field, Section, Sheet, StatTile } from './ui';

/** Other results listed before "Show all" - a whole season's can run to dozens. */
const RECENT_RESULTS = 5;

export interface CompetitionView {
  id: string;
  /** 'finish' opens straight on finishing it - the Finish button on a tournament's row. */
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
  onAddMatch,
}: {
  view: CompetitionView | null;
  now: Date;
  onClose: () => void;
  onOpenMatch: (match: Match) => void;
  onEnterResult: (match: Match) => void;
  /** A fixture that has just come in - started from this competition's own details. */
  onAddMatch: (competition: Competition) => void;
}) {
  const { competitions, matches, teams, results, profile, colorOf, finishCompetition, reopenCompetition } = useStore();
  const competition = view ? competitions.find((c) => c.id === view.id) ?? null : null;

  const [step, setStep] = useState<CompetitionView['step']>('summary');
  const [placing, setPlacing] = useState('');
  const [custom, setCustom] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [notes, setNotes] = useState('');
  const [shareState, setShareState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');

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

  // The rest of the league or group, newest first, and the tables they make.
  const otherResults = useMemo(
    () =>
      competition
        ? results
            .filter((r) => r.competitionId === competition.id)
            .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1))
        : [],
    [competition, results],
  );
  const tables = useMemo(
    () =>
      competition
        ? standings({
            competition,
            matches: own,
            results: otherResults,
            ourName: (m) => teams.find((t) => t.id === m.teamId)?.name || 'Your team',
          })
        : [],
    [competition, own, otherResults, teams],
  );
  const [resultTarget, setResultTarget] = useState<TableResultTarget | null>(null);
  const [allResults, setAllResults] = useState(false);

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
    // Never reopen on a result sheet left over from last time - Escape closes
    // this page before the sheet on top of it can close itself.
    setResultTarget(null);
    setAllResults(false);
    setShareState('idle');
  }, [view]);

  if (!view || !competition) return null;

  const noun = COMPETITION_TYPE_LABEL[competition.type].toLowerCase();
  const finished = competition.archived;
  // "How far did you get?" is a knockout question. A league is left out on
  // purpose: finishing one mid-season by mistake would call off every fixture left.
  const finishable = competition.type === 'tournament' || competition.type === 'cup';
  const unplayed = own.filter((m) => m.status === 'scheduled');
  // Where to head for: the next game's ground, or the one the tournament was set up with.
  const ground = unplayed.find((m) => m.location)?.location || competition.location || '';
  const fixtures = own.filter((m) => m.status !== 'cancelled');
  const calledOff = own.length - fixtures.length;
  const first = own[0]?.date ?? '';
  const last = own[own.length - 1]?.date ?? '';
  const when = !first
    ? competition.startDate && formatDateShort(competition.startDate)
    : first === last
      ? formatDateShort(first)
      : `${formatDateShort(first)} – ${formatDateShort(last)}`;
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
        {/* A group, not a label: a label round buttons presses the first one when tapped. */}
        <div className="field" role="group" aria-label="How far did you get?">
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
                      {m.stage ? `${stageName(m.stage, m.stageDetail)} · ` : ''}
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

  // A friendly has no table to speak of; everything else can.
  const showTables = ACADEMY && competition.type !== 'friendly';
  const ourNames = [
    ...new Set(
      [...own.map((m) => m.teamId), competition.teamId]
        .map((id) => teams.find((t) => t.id === id)?.name ?? '')
        .filter(Boolean),
    ),
  ];
  // A new result starts in the player's own group - the one the rest of it is about.
  const groupCounts = new Map<string, number>();
  for (const m of own) if (m.stage === 'group' && m.stageDetail) groupCounts.set(m.stageDetail, (groupCounts.get(m.stageDetail) ?? 0) + 1);
  const defaultGroup = [...groupCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const openResult = (result?: Result) =>
    setResultTarget({ competition, result, defaultGroup, knownTeams: knownTeams(own, otherResults), ourNames });

  // One picture of the whole thing, for the family chat.
  const share = async () => {
    setShareState('working');
    try {
      const blob = await renderTournamentCard({ competition, matches: own, team, profile, group });
      if (!blob) return setShareState('failed');
      const how = await shareCard(
        blob,
        `${competition.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || noun}.png`,
        `${competition.name} — ${competition.placing ? placingLabel(competition.placing) : recordSummary(stats)}`,
      );
      setShareState(how === 'cancelled' ? 'idle' : 'done');
    } catch {
      setShareState('failed');
    }
  };

  const positionCards = positionStatCards(group, {
    appearances: stats.appearances,
    played: stats.played,
    minutes: stats.minutes,
    cleanSheetsPlayed: stats.cleanSheetsPlayed,
    goalsAgainst: stats.goalsAgainst,
    totals: stats.totals,
  });

  return (
    <>
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
            {/* Finished is when it gets shown off - the header's ✕ still closes. */}
            <button className="primary-btn wide" onClick={() => void share()} disabled={shareState === 'working'}>
              {shareState === 'working' ? 'Making image…' : '📤 Share'}
            </button>
          </>
        ) : finishable && stats.played > 0 ? (
          <>
            <button className="ghost-btn wide" onClick={() => onAddMatch(competition)}>
              + Add match
            </button>
            <button className="primary-btn wide" onClick={startFinish}>
              Finish {noun}
            </button>
          </>
        ) : (
          // Nothing played yet - adding the fixtures as they come in is the thing to do.
          <>
            <button className="ghost-btn wide" onClick={onClose}>
              Close
            </button>
            <button className="primary-btn wide" onClick={() => onAddMatch(competition)}>
              + Add match
            </button>
          </>
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
        <>
          <p className="muted small">
            {fixtures.length === 0
              ? 'No matches yet. Add each one here as its fixture comes in.'
              : `${stats.played > 0 ? 'In progress' : 'Coming up'} · ${stats.played} of ${fixtures.length} played`}
          </p>
          {ground && <GroundLink location={ground} className="link-btn next-ground" />}
        </>
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

      {stats.played > 0 && !finished && (
        <div className="sheet-extra">
          <button className="ghost-btn" onClick={() => void share()} disabled={shareState === 'working'}>
            {shareState === 'working' ? 'Making image…' : `📤 Share ${noun} so far`}
          </button>
        </div>
      )}
      {shareState === 'done' && <p className="notice">Image ready — saved or shared.</p>}
      {shareState === 'failed' && <p className="form-error">Couldn't make the image on this device.</p>}

      {/* The table first: in a league it's what the page is opened for. */}
      {showTables &&
        tables.map((table) => (
          <Section key={table.name || 'table'} title={table.name ? `${table.name} table` : 'Table'}>
            <StandingsTable group={table} />
          </Section>
        ))}

      {showTables && (
        <Section
          title="Other results"
          action={
            <button className="ghost-btn" onClick={() => openResult()}>
              + Add result
            </button>
          }
        >
          {otherResults.length === 0 ? (
            <p className="muted small">
              Add the other teams&apos; results too — the whole table works itself out, with your own matches
              counted from here.
            </p>
          ) : (
            <div className="list">
              {(allResults ? otherResults : otherResults.slice(0, RECENT_RESULTS)).map((r) => (
                <button key={r.id} className="other-result" onClick={() => openResult(r)}>
                  <span className="other-teams">
                    {r.home} <strong>{r.homeGoals ?? '–'}–{r.awayGoals ?? '–'}</strong> {r.away}
                  </span>
                  <span className="muted small">
                    {[r.date && formatDateShort(r.date), r.stage ? stageName(r.stage, r.stageDetail) : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              ))}
              {otherResults.length > RECENT_RESULTS && (
                <button className="link-btn" onClick={() => setAllResults((all) => !all)}>
                  {allResults ? 'Show the latest only' : `Show all ${otherResults.length}`}
                </button>
              )}
            </div>
          )}
        </Section>
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
    <TableResultSheet target={resultTarget} onClose={() => setResultTarget(null)} />
    </>
  );
}
