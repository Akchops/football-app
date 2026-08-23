import { useMemo, useState } from 'react';
import { AppStoreProvider, useStore } from './store/AppStore';
import { useNow } from './useNow';
import type { Match } from './types';
import { kickoffAt } from './lib/date';
import { pendingResultMatches } from './lib/stats';
import { CalendarScreen } from './components/CalendarScreen';
import { MatchesScreen } from './components/MatchesScreen';
import { StatsScreen } from './components/StatsScreen';
import { SetupScreen } from './components/SetupScreen';
import { MatchFormSheet, type MatchFormTarget } from './components/MatchFormSheet';
import { MatchDetailSheet } from './components/MatchDetailSheet';
import { ResultSheet } from './components/ResultSheet';
import { ResultPrompt } from './components/ResultPrompt';
import { CompetitionFormSheet, type CompetitionFormTarget } from './components/CompetitionFormSheet';
import { TeamFormSheet, type TeamFormTarget } from './components/TeamFormSheet';
import { TournamentSheet } from './components/TournamentSheet';
import { OnboardingScreen } from './components/OnboardingScreen';
import { BallIcon, CalendarIcon, ChartIcon, GearIcon } from './components/icons';

type Tab = 'calendar' | 'matches' | 'stats' | 'setup';

const TABS: { id: Tab; label: string; Icon: () => JSX.Element }[] = [
  { id: 'calendar', label: 'Calendar', Icon: CalendarIcon },
  { id: 'matches', label: 'Matches', Icon: BallIcon },
  { id: 'stats', label: 'Stats', Icon: ChartIcon },
  { id: 'setup', label: 'Setup', Icon: GearIcon },
];

function Shell() {
  const { matches, settings, profile } = useStore();
  const now = useNow();

  const [tab, setTab] = useState<Tab>('calendar');
  const [matchForm, setMatchForm] = useState<MatchFormTarget | null>(null);
  const [detailMatch, setDetailMatch] = useState<Match | null>(null);
  const [resultMatch, setResultMatch] = useState<Match | null>(null);
  const [competitionForm, setCompetitionForm] = useState<CompetitionFormTarget | null>(null);
  const [teamForm, setTeamForm] = useState<TeamFormTarget | null>(null);
  const [tournamentOpen, setTournamentOpen] = useState(false);
  const [promptHidden, setPromptHidden] = useState(false);

  const pending = useMemo(() => pendingResultMatches(matches, settings, now), [matches, settings, now]);

  // Sheets read from the store by id so they never show a stale copy of a match.
  const liveMatch = (m: Match | null) => (m ? matches.find((x) => x.id === m.id) ?? null : null);

  const openResult = (match: Match) => {
    setDetailMatch(null);
    setResultMatch(match);
  };

  const showPrompt = !promptHidden && pending.length > 0 && !resultMatch && !matchForm;

  // First run: collect the player's details before showing the app proper.
  if (!profile.onboardedAt) return <OnboardingScreen />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <BallIcon />
          </span>
          <span>Matchday</span>
        </div>
        {pending.length > 0 && (
          <button className="pending-pill" onClick={() => setPromptHidden(false)}>
            {pending.length} to log
          </button>
        )}
      </header>

      <main className="content">
        {tab === 'calendar' && (
          <CalendarScreen
            now={now}
            onOpenMatch={setDetailMatch}
            onAddMatch={(dateISO) => setMatchForm({ mode: 'create', dateISO })}
            onAddTournament={() => setTournamentOpen(true)}
            onEnterResult={openResult}
          />
        )}
        {tab === 'matches' && (
          <MatchesScreen
            now={now}
            onOpenMatch={setDetailMatch}
            onAddMatch={(dateISO) => setMatchForm({ mode: 'create', dateISO })}
            onEnterResult={openResult}
          />
        )}
        {tab === 'stats' && <StatsScreen now={now} onGoToMatches={() => setTab('matches')} />}
        {tab === 'setup' && <SetupScreen onEditCompetition={setCompetitionForm} onEditTeam={setTeamForm} />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'tab on' : 'tab'}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            <span className="tab-icon">
              <t.Icon />
            </span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {showPrompt && (
        <ResultPrompt pending={pending} onEnterResult={openResult} onDismiss={() => setPromptHidden(true)} />
      )}

      <MatchFormSheet
        target={matchForm}
        onClose={() => setMatchForm(null)}
        onCreated={(created) => {
          // Backfilling a match that has already been played - ask for the score now
          // rather than letting the prompt ambush them a moment later.
          if (kickoffAt(created.date, created.time).getTime() <= Date.now()) setResultMatch(created);
        }}
      />

      <MatchDetailSheet
        match={liveMatch(detailMatch)}
        now={now}
        onClose={() => setDetailMatch(null)}
        onEdit={(m) => {
          setDetailMatch(null);
          setMatchForm({ mode: 'edit', match: m });
        }}
        onEnterResult={openResult}
      />

      <ResultSheet
        match={liveMatch(resultMatch)}
        onClose={() => setResultMatch(null)}
        headline={pending.some((p) => p.id === resultMatch?.id) ? 'How did it go?' : undefined}
      />

      <CompetitionFormSheet target={competitionForm} onClose={() => setCompetitionForm(null)} />

      <TeamFormSheet target={teamForm} onClose={() => setTeamForm(null)} />

      <TournamentSheet open={tournamentOpen} onClose={() => setTournamentOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AppStoreProvider>
      <Shell />
    </AppStoreProvider>
  );
}
