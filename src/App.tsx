import { useEffect, useMemo, useRef, useState } from 'react';
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
import { TrainingFormSheet, type TrainingFormTarget } from './components/TrainingFormSheet';
import { OnboardingScreen } from './components/OnboardingScreen';
import { MediaScreen } from './components/MediaScreen';
import { InstallBanner } from './components/InstallBanner';
import { UpdatePrompt } from './components/UpdatePrompt';
import { BallIcon, CalendarIcon, ChartIcon, GearIcon, MediaIcon } from './components/icons';

type Tab = 'calendar' | 'matches' | 'media' | 'stats' | 'setup';

const TABS: { id: Tab; label: string; Icon: () => JSX.Element }[] = [
  { id: 'calendar', label: 'Calendar', Icon: CalendarIcon },
  { id: 'matches', label: 'Matches', Icon: BallIcon },
  { id: 'media', label: 'Media', Icon: MediaIcon },
  { id: 'stats', label: 'Stats', Icon: ChartIcon },
  { id: 'setup', label: 'Setup', Icon: GearIcon },
];

function Shell() {
  const { matches, settings, profile, training } = useStore();
  const now = useNow();

  const [tab, setTab] = useState<Tab>('calendar');
  const [matchForm, setMatchForm] = useState<MatchFormTarget | null>(null);
  const [detailMatch, setDetailMatch] = useState<Match | null>(null);
  const [resultMatch, setResultMatch] = useState<Match | null>(null);
  const [competitionForm, setCompetitionForm] = useState<CompetitionFormTarget | null>(null);
  const [teamForm, setTeamForm] = useState<TeamFormTarget | null>(null);
  const [tournamentOpen, setTournamentOpen] = useState(false);
  const [trainingForm, setTrainingForm] = useState<TrainingFormTarget | null>(null);
  const [promptHidden, setPromptHidden] = useState(false);
  const contentRef = useRef<HTMLElement>(null);

  // The scroll container is shared across tabs, so reset it or you land halfway
  // down the next screen.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [tab]);

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

      <main className="content" ref={contentRef}>
        <InstallBanner />
        {tab === 'calendar' && (
          <CalendarScreen
            now={now}
            onOpenMatch={setDetailMatch}
            onAddMatch={(dateISO) => setMatchForm({ mode: 'create', dateISO })}
            onAddTournament={() => setTournamentOpen(true)}
            onAddTraining={(dateISO) => setTrainingForm({ mode: 'create', dateISO })}
            onOpenTraining={(id) => {
              const session = training.find((t) => t.id === id);
              if (session) setTrainingForm({ mode: 'edit', session });
            }}
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
        {tab === 'media' && <MediaScreen onOpenMatch={setDetailMatch} />}
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
        onSeeAllMedia={() => {
          setDetailMatch(null);
          setTab('media');
        }}
      />

      <ResultSheet
        match={liveMatch(resultMatch)}
        onClose={() => setResultMatch(null)}
        headline={pending.some((p) => p.id === resultMatch?.id) ? 'How did it go?' : undefined}
      />

      <CompetitionFormSheet target={competitionForm} onClose={() => setCompetitionForm(null)} />

      <TeamFormSheet target={teamForm} onClose={() => setTeamForm(null)} />

      <TournamentSheet open={tournamentOpen} onClose={() => setTournamentOpen(false)} />

      <TrainingFormSheet target={trainingForm} onClose={() => setTrainingForm(null)} />
    </div>
  );
}

export default function App() {
  return (
    <AppStoreProvider>
      {/* Sits outside Shell so the service worker registers during onboarding too. */}
      <UpdatePrompt />
      <Shell />
    </AppStoreProvider>
  );
}
