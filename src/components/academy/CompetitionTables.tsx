import { useMemo, useState } from 'react';
import { describeAcademyError, type AcademyCompetition, type AcademyResultInput } from '../../lib/academy';
import { STAGE_SHORT, isKnockout, stageName } from '../../lib/stage';
import { knownTeams, standings } from '../../lib/standings';
import { useAcademy } from '../../store/AcademyProvider';
import type { NewResultInput } from '../../store/AppStore';
import { COMPETITION_TYPE_LABEL, type Result } from '../../types';
import { StandingsTable } from '../StandingsTable';
import { TableResultSheet, type ResultSaver, type TableResultTarget } from '../TableResultSheet';
import { Section } from '../ui';
import { useLoad } from './parts';

/** "League · 2026/27 · U16 Elite" */
export function competitionFacts(competition: AcademyCompetition, squadName?: string): string {
  return [COMPETITION_TYPE_LABEL[competition.type], competition.season, squadName].filter(Boolean).join(' · ');
}

function toInput(input: NewResultInput): AcademyResultInput {
  return {
    home: input.home,
    away: input.away,
    homeGoals: input.homeGoals,
    awayGoals: input.awayGoals,
    date: input.date,
    stage: input.stage ?? null,
    stageDetail: input.stageDetail ?? '',
  };
}

function scoreLine(r: Result): string {
  return r.homeGoals === null || r.awayGoals === null ? `${r.home} v ${r.away}` : `${r.home} ${r.homeGoals}–${r.awayGoals} ${r.away}`;
}

/**
 * An academy competition's tables and games, worked out by the same
 * standings() as the player app. Staff who coach enter and correct the games;
 * everyone else, families included, reads.
 */
export function CompetitionTables({ competition, editable }: { competition: AcademyCompetition; editable: boolean }) {
  const { api } = useAcademy();
  const results = useLoad(api ? () => api.results(competition.id) : null, competition.id);
  const [target, setTarget] = useState<TableResultTarget | null>(null);
  const games = results.data ?? [];

  const tables = useMemo(
    () => standings({ competition, matches: [], results: games, ourName: () => '', ourTeams: [competition.teamName] }),
    [competition, games],
  );
  const knockouts = games.filter((g) => isKnockout(g.stage));
  const others = games.filter((g) => !isKnockout(g.stage));

  const saver: ResultSaver | undefined = api
    ? {
        add: (input) => guard(() => api.addResult(competition.id, toInput(input))),
        update: (id, input) => guard(() => api.updateResult(id, toInput(input))),
        remove: (id) => guard(() => api.deleteResult(id)),
      }
    : undefined;

  async function guard(work: () => Promise<unknown>): Promise<void> {
    try {
      await work();
    } catch (e) {
      throw new Error(describeAcademyError(e));
    }
    await results.reload();
  }

  const open = (result?: Result) =>
    editable &&
    setTarget({
      competition: { id: competition.id, name: competition.name, type: competition.type },
      result,
      defaultGroup: '',
      knownTeams: knownTeams([], games),
      // The academy's own games are results here too - there are no player matches to count instead.
      ourNames: [],
    });

  const row = (r: Result) => (
    <li key={r.id}>
      <button className="result-row" disabled={!editable} onClick={() => open(r)}>
        <span className="result-date muted small">{r.date ? r.date.slice(5).split('-').reverse().join('/') : '–'}</span>
        <span className="result-line">{scoreLine(r)}</span>
        {r.stage && r.stage !== 'group' && <span className="meta-chip stage">{STAGE_SHORT[r.stage]}</span>}
        {r.stage === 'group' && r.stageDetail && <span className="muted small">{stageName('group', r.stageDetail)}</span>}
      </button>
    </li>
  );

  return (
    <>
      {results.error && <p className="notice warn">{results.error}</p>}
      {!results.data && !results.error && <p className="muted small">Loading…</p>}

      {tables.map((group) => (
        <Section key={group.name || 'table'} title={group.name ? `${group.name} table` : 'Table'}>
          <div className="table-scroll">
            <StandingsTable group={group} />
          </div>
        </Section>
      ))}
      {results.data && tables.length === 0 && (
        <p className="muted small">
          {editable
            ? `No results yet. Add every team's games - ${competition.teamName || 'your side'}'s and everyone else's - and the table works itself out.`
            : 'No results yet.'}
        </p>
      )}

      {knockouts.length > 0 && (
        <Section title="Knockouts">
          <ul className="result-list">{knockouts.map(row)}</ul>
        </Section>
      )}

      {(others.length > 0 || editable) && (
        <Section
          title={`Games · ${others.length}`}
          action={
            editable ? (
              <button className="link-btn" onClick={() => open()}>
                + Add result
              </button>
            ) : undefined
          }
        >
          {others.length > 0 && <ul className="result-list">{others.map(row)}</ul>}
        </Section>
      )}

      {editable && (
        <TableResultSheet target={target} onClose={() => setTarget(null)} saver={saver} knockouts />
      )}
    </>
  );
}
