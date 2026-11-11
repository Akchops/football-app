import { useState } from 'react';
import { m } from 'motion/react';
import { can, type SquadMatch, type StaffAcademy } from '../../lib/academy';
import { checkKey, checkState, claimsFor, toCheck, waitingForResult } from '../../lib/checks';
import { formatDateShort } from '../../lib/date';
import { stagger } from '../../lib/motion';
import { useAcademy } from '../../store/AcademyProvider';
import { useSync } from '../../store/SyncProvider';
import { ChevronIcon, PlusIcon } from '../icons';
import { Section, Segmented } from '../ui';
import { CoachResultSheet, type ResultTarget } from './CoachResultSheet';
import { useAddRequest, useLoad, type AddRequest } from './parts';
import { CompetitionsSkeleton } from './skeletons';
import { TablesScreen } from './TablesScreen';
import { useSquadData, type SquadData } from './useSquadData';

type View = 'results' | 'tables';

/**
 * The academy's games: the results its coaches enter, with each player's own
 * figures to approve or deny, and - one tap across - its league and
 * tournament tables.
 */
export function MatchesScreen({ academy, request }: { academy: StaffAcademy; request?: AddRequest | null }) {
  const [view, setView] = useState<View>('results');
  useAddRequest(request, 'competition', () => setView('tables'));
  useAddRequest(request, 'result', () => setView('results'));

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Matches</h1>
      </div>
      <Segmented<View>
        options={[
          { value: 'results', label: 'Results' },
          { value: 'tables', label: 'Tables' },
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'results' ? <ResultsView academy={academy} request={request} /> : <TablesScreen academy={academy} request={request} embedded />}
    </div>
  );
}

function ResultsView({ academy, request }: { academy: StaffAcademy; request?: AddRequest | null }) {
  const { api } = useAcademy();
  const sync = useSync();
  const me = sync.account?.id ?? '';
  const data = useSquadData(academy);
  const results = useLoad(api ? () => api.squadMatches(academy.id) : null, academy.id);
  const [target, setTarget] = useState<ResultTarget | null>(null);
  const [n, setN] = useState(0);

  const runs = can(academy.role, 'run-squads');
  const enterable = runs ? data.squads : data.squads.filter((s) => s.coachIds.includes(me));
  const open = (result: SquadMatch | null, prefill?: ResultTarget['prefill']) => {
    setN((x) => x + 1);
    setTarget({ result, prefill, n: n + 1 });
  };
  useAddRequest(request, 'result', () => open(null), !data.loading);

  const list = results.data ?? [];
  const waiting = waitingForResult(data.players, list, data.checkMap, { squadIds: runs ? undefined : enterable.map((s) => s.id) });
  const squadName = (id: string | null) => data.squads.find((s) => s.id === id)?.name ?? 'No squad';
  const loading = data.loading || (!results.data && !results.error);

  return (
    <>
      {(results.error || data.error) && <p className="notice warn">{results.error || data.error}</p>}
      {loading && !results.error && !data.error && <CompetitionsSkeleton />}

      {!loading && (
        <>
          <div className="button-row">
            <button className="primary-btn" disabled={enterable.length === 0} onClick={() => open(null)}>
              <PlusIcon /> Add a result
            </button>
          </div>
          {enterable.length === 0 && (
            <p className="muted small">
              {runs ? 'Make a squad first, from Players - a result is entered for a squad.' : "You don't coach a squad yet. The owner or a manager gives you one."}
            </p>
          )}

          {waiting.length > 0 && (
            <Section title={`Waiting for your result · ${waiting.length}`}>
              <p className="muted small">Your players have logged these games. Add the score, then check what each of them put in.</p>
              <ul className="list-group nav-group">
                {waiting.map((w, i) => (
                  <m.li key={w.key} {...stagger(i)}>
                    <button className="nav-row" onClick={() => open(null, { date: w.date, opponent: w.opponent, squadId: w.squadId })}>
                      <span className="date-tile" aria-hidden="true">
                        <strong>{formatDateShort(w.date).split(' ')[1]}</strong>
                        <span>{formatDateShort(w.date).split(' ')[2] ?? ''}</span>
                      </span>
                      <span className="nav-row-text">
                        <span className="nav-row-label">v {w.opponent || 'TBC'}</span>
                        <span className="nav-row-sub">
                          {w.claims.length} player{w.claims.length === 1 ? '' : 's'} logged it · {squadName(w.squadId)}
                        </span>
                      </span>
                      <span className="nav-row-alert">To check</span>
                      <span className="row-chevron" aria-hidden="true">
                        <ChevronIcon />
                      </span>
                    </button>
                  </m.li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={`Results · ${list.length}`}>
            {list.length === 0 ? (
              <p className="muted small">
                No results yet. Add one after a game: the score, then every player in the squad shows with the figures they
                logged themselves - approve them, or deny and put them right.
              </p>
            ) : (
              <ul className="list-group nav-group">
                {list.map((r, i) => (
                  <m.li key={r.id} {...stagger(i)}>
                    <ResultRow result={r} data={data} squadName={squadName(r.squadId)} onOpen={() => open(r)} />
                  </m.li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      <CoachResultSheet
        academy={academy}
        target={target}
        squads={enterable}
        data={data}
        onClose={() => setTarget(null)}
        onSaved={results.reload}
      />
    </>
  );
}

function ResultRow({ result, data, squadName, onOpen }: { result: SquadMatch; data: SquadData; squadName: string; onOpen: () => void }) {
  const claims = claimsFor(result, data.players);
  const logged = claims.filter((c) => c.match);
  const left = toCheck(claims, data.checkMap).length;
  const denied = logged.filter((c) => {
    const check = data.checkMap.get(checkKey(c.player.playerId!, c.match!.id));
    return check && checkState(check, c.match) === 'denied';
  }).length;
  const outcome = result.goalsFor > result.goalsAgainst ? 'w' : result.goalsFor < result.goalsAgainst ? 'l' : 'd';
  const [, day, month] = formatDateShort(result.date).split(' ');
  return (
    <button className="nav-row" onClick={onOpen}>
      <span className="date-tile" aria-hidden="true">
        <strong>{day}</strong>
        <span>{month ?? ''}</span>
      </span>
      <span className="nav-row-text">
        <span className="nav-row-label">
          {result.venue === 'away' ? '@ ' : 'v '}
          {result.opponent || 'TBC'}
        </span>
        <span className="nav-row-sub">
          {squadName} ·{' '}
          {logged.length === 0
            ? 'nobody has logged it yet'
            : left > 0
              ? `${left} of ${logged.length} to check`
              : `all ${logged.length} checked${denied ? ` · ${denied} denied` : ''}`}
        </span>
      </span>
      <span className={`game-score outcome-${outcome}`}>
        {result.goalsFor}–{result.goalsAgainst}
      </span>
      {left > 0 && <span className="nav-row-alert">{left}</span>}
      <span className="row-chevron" aria-hidden="true">
        <ChevronIcon />
      </span>
    </button>
  );
}
