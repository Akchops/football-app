import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { AppStoreProvider, useStore } from './store/AppStore';
import { SyncProvider } from './store/SyncProvider';
import { AcademyProvider, useAcademy } from './store/AcademyProvider';
import { useNow } from './useNow';
import type { Match } from './types';
import { ageGroupCheck, kickoffAt, todayISO } from './lib/date';
import { nextMatchFor } from './lib/competitions';
import { pendingResultMatches } from './lib/stats';
import { takeSharedText } from './lib/shareTarget';
import { syncReminders } from './lib/push';
import { CalendarScreen } from './components/CalendarScreen';
import { MatchesScreen } from './components/MatchesScreen';
import { StatsScreen } from './components/StatsScreen';
import { SetupScreen } from './components/SetupScreen';
import { MatchFormSheet, type MatchFormTarget, type MessageImport } from './components/MatchFormSheet';
import { MatchDetailSheet } from './components/MatchDetailSheet';
import { ResultSheet } from './components/ResultSheet';
import { ResultPrompt } from './components/ResultPrompt';
import { AgeGroupPrompt } from './components/AgeGroupPrompt';
import { WrappedInvite } from './components/WrappedInvite';
import { WrappedStory } from './components/WrappedStory';
import { wrappedInvite } from './lib/wrapped';
import { CompetitionFormSheet, type CompetitionFormTarget } from './components/CompetitionFormSheet';
import { CompetitionSheet, type CompetitionView } from './components/CompetitionSheet';
import { TeamFormSheet, type TeamFormTarget } from './components/TeamFormSheet';
import { TournamentSheet } from './components/TournamentSheet';
import { ImportFixturesSheet } from './components/ImportFixturesSheet';
import { TrainingFormSheet, type TrainingFormTarget } from './components/TrainingFormSheet';
import { OnboardingScreen } from './components/OnboardingScreen';
import { WhoIsThisFor } from './components/WhoIsThisFor';
import { ACADEMY } from './lib/features';
import { MediaScreen } from './components/MediaScreen';
// The Anthropic SDK is only needed on the Coach tab, so it stays out of the
// bundle that has to load before the calendar appears.
const AIScreen = lazy(() => import('./components/AIScreen'));
// Likewise the academy area, which only staff ever open. Marked pure so a
// build with the academy release switched off drops it altogether.
const AcademyShell = /* @__PURE__ */ lazy(() => import('./components/academy/AcademyShell'));
import { InstallBanner } from './components/InstallBanner';
import { UpdatePrompt } from './components/UpdatePrompt';
import { BallIcon, CalendarIcon, ChartIcon, CoachIcon, GearIcon, MediaIcon, ShieldIcon } from './components/icons';

type Tab = 'calendar' | 'matches' | 'media' | 'coach' | 'stats' | 'setup';

/** The last year this phone was invited to watch its Wrapped. */
const WRAPPED_SEEN_KEY = 'matchday.wrappedSeen';

const TABS: { id: Tab; label: string; Icon: () => JSX.Element }[] = [
  { id: 'calendar', label: 'Calendar', Icon: CalendarIcon },
  { id: 'matches', label: 'Matches', Icon: BallIcon },
  { id: 'media', label: 'Media', Icon: MediaIcon },
  { id: 'coach', label: 'Coach', Icon: CoachIcon },
  { id: 'stats', label: 'Stats', Icon: ChartIcon },
];

function Shell() {
  const { matches, settings, profile, training, competitions, teams } = useStore();
  const academy = useAcademy();
  const now = useNow();

  const [tab, setTab] = useState<Tab>('calendar');
  const [matchForm, setMatchForm] = useState<MatchFormTarget | null>(null);
  const [detailMatch, setDetailMatch] = useState<Match | null>(null);
  const [resultMatch, setResultMatch] = useState<Match | null>(null);
  const [competitionForm, setCompetitionForm] = useState<CompetitionFormTarget | null>(null);
  const [competitionView, setCompetitionView] = useState<CompetitionView | null>(null);
  // A match being added from a competition's page goes back there afterwards, so
  // the next fixture is one tap away.
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [teamForm, setTeamForm] = useState<TeamFormTarget | null>(null);
  const [tournamentOpen, setTournamentOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // A pasted message with a whole list of games in it, being checked before they go in.
  const [importInitial, setImportInitial] = useState<MessageImport | null>(null);
  const [imported, setImported] = useState(0);
  const [trainingForm, setTrainingForm] = useState<TrainingFormTarget | null>(null);
  const [promptHidden, setPromptHidden] = useState(false);
  const [ageAskHidden, setAgeAskHidden] = useState(false);
  const [wrappedView, setWrappedView] = useState<{ year: number; complete: boolean } | null>(null);
  // The January invitation is shown once per phone - the Stats page has it after that.
  const [wrappedSeen, setWrappedSeen] = useState(() => {
    try {
      return Number(localStorage.getItem(WRAPPED_SEEN_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const markWrappedSeen = (year: number) => {
    setWrappedSeen(year);
    try {
      localStorage.setItem(WRAPPED_SEEN_KEY, String(year));
    } catch {
      // Private mode: it just asks again next time.
    }
  };
  const contentRef = useRef<HTMLElement>(null);

  // A message shared into the app from WhatsApp (Android's share sheet) opens as
  // a new match, read from the message. Once, on the launch it arrived with.
  useEffect(() => {
    const shared = takeSharedText();
    if (shared) setMatchForm({ mode: 'create', sharedText: shared });
  }, []);

  // Match reminders on this phone follow the fixtures: a match added, moved or
  // played sends the new list to the server. Nothing happens while they're off.
  useEffect(() => {
    const timer = window.setTimeout(() => void syncReminders({ matches, competitions }).catch(() => undefined), 1500);
    return () => window.clearTimeout(timer);
  }, [matches, competitions]);

  // The scroll container is shared across tabs, so reset it or you land halfway
  // down the next screen.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  // The import toast is a confirmation, not a message to dismiss by hand.
  useEffect(() => {
    if (imported === 0) return;
    const timer = window.setTimeout(() => setImported(0), 4000);
    return () => window.clearTimeout(timer);
  }, [imported]);

  const pending = useMemo(() => pendingResultMatches(matches, settings, now), [matches, settings, now]);

  // Sheets read from the store by id so they never show a stale copy of a match.
  const liveMatch = (m: Match | null) => (m ? matches.find((x) => x.id === m.id) ?? null : null);

  const openResult = (match: Match) => {
    setDetailMatch(null);
    setCompetitionView(null);
    setResultMatch(match);
  };

  const openCompetition = (id: string, step: CompetitionView['step'] = 'summary') => {
    setDetailMatch(null);
    setCompetitionView({ id, step });
  };

  // A competition deleted elsewhere can't leave an invisible sheet holding the prompt back.
  const viewing = competitionView && competitions.some((c) => c.id === competitionView.id) ? competitionView : null;

  const showPrompt = !promptHidden && pending.length > 0 && !resultMatch && !matchForm && !viewing;

  // Once a year, and never on top of something else - results come first.
  const newSeason = ageGroupCheck(profile, now);
  const sheetOpen = Boolean(
    matchForm || detailMatch || resultMatch || competitionForm || viewing || teamForm || tournamentOpen || importOpen ||
      trainingForm,
  );
  const showAgeAsk = newSeason !== null && !ageAskHidden && !showPrompt && !sheetOpen;
  // After the age group question, never on top of it.
  const inviteYear = useMemo(
    () => wrappedInvite(now, wrappedSeen, { matches, training, competitions, profile }),
    [now, wrappedSeen, matches, training, competitions, profile],
  );
  const showInvite = inviteYear !== null && !showPrompt && !sheetOpen && !showAgeAsk && !wrappedView;

  // Academy staff: their half of the app, with no player's calendar unless this phone has one.
  // (ACADEMY first each time: with the release switched off, the build drops all of this.)
  if (ACADEMY && academy.enabled && academy.mode === 'academy') {
    return (
      <Suspense fallback={<div className="app" />}>
        <AcademyShell hasPlayer={Boolean(profile.onboardedAt)} />
      </Suspense>
    );
  }

  // First run: collect the player's details before showing the app proper -
  // once it is clear this phone is for a player rather than an academy.
  if (!profile.onboardedAt) {
    if (ACADEMY && academy.enabled && academy.mode === null) return <WhoIsThisFor onPick={academy.setMode} />;
    return <OnboardingScreen onBack={ACADEMY && academy.enabled ? () => academy.setMode(null) : undefined} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <BallIcon />
          </span>
          <span>Matchday</span>
        </div>
        <div className="topbar-actions">
          {pending.length > 0 && (
            <button className="pending-pill" onClick={() => setPromptHidden(false)}>
              {pending.length} to log
            </button>
          )}
          {ACADEMY && academy.invites.length + academy.playerInvites.length > 0 && tab !== 'setup' && (
            <button className="pending-pill with-icon" onClick={() => setTab('setup')} aria-label="Academy invite">
              <ShieldIcon />
              Invite
            </button>
          )}
          {ACADEMY && academy.academies.length > 0 && (
            <button className="topbar-btn" onClick={() => academy.setMode('academy')} aria-label="Academy">
              <ShieldIcon />
            </button>
          )}
          <button
            className={tab === 'setup' ? 'topbar-btn on' : 'topbar-btn'}
            onClick={() => setTab(tab === 'setup' ? 'calendar' : 'setup')}
            aria-label="Setup"
            aria-pressed={tab === 'setup'}
          >
            <GearIcon />
          </button>
        </div>
      </header>

      <main className="content" ref={contentRef}>
        <InstallBanner />
        {tab === 'calendar' && (
          <CalendarScreen
            now={now}
            onOpenMatch={setDetailMatch}
            onAddMatch={(dateISO) => setMatchForm({ mode: 'create', dateISO })}
            onAddTournament={() => setTournamentOpen(true)}
            onImportFixtures={() => setImportOpen(true)}
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
            onAddTournament={() => setTournamentOpen(true)}
            onOpenCompetition={openCompetition}
          />
        )}
        {tab === 'media' && <MediaScreen onOpenMatch={setDetailMatch} />}
        {tab === 'coach' && (
          <Suspense fallback={<div className="screen"><p className="muted small">Loading the coach…</p></div>}>
            <AIScreen onOpenSetup={() => setTab('setup')} />
          </Suspense>
        )}
        {tab === 'stats' && (
          <StatsScreen
            now={now}
            onGoToMatches={() => setTab('matches')}
            onOpenCompetition={openCompetition}
            onOpenWrapped={(year, complete) => setWrappedView({ year, complete })}
          />
        )}
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

      {showInvite && inviteYear !== null && (
        <WrappedInvite
          year={inviteYear}
          onLater={() => markWrappedSeen(inviteYear)}
          onWatch={() => {
            markWrappedSeen(inviteYear);
            setWrappedView({ year: inviteYear, complete: true });
          }}
        />
      )}

      {wrappedView && (
        <WrappedStory year={wrappedView.year} complete={wrappedView.complete} onClose={() => setWrappedView(null)} />
      )}

      {showAgeAsk && newSeason && (
        <AgeGroupPrompt
          check={newSeason}
          onDismiss={() => setAgeAskHidden(true)}
          onOpenSetup={() => {
            setAgeAskHidden(true);
            setTab('setup');
          }}
        />
      )}

      <MatchFormSheet
        target={matchForm}
        onClose={() => {
          setMatchForm(null);
          if (returnTo) setCompetitionView({ id: returnTo, step: 'summary' });
          setReturnTo(null);
        }}
        onCreated={(created) => {
          // Backfilling a match that has already been played - ask for the score now
          // rather than letting the prompt ambush them a moment later.
          if (kickoffAt(created.date, created.time).getTime() <= Date.now()) openResult(created);
        }}
        onMany={(games) => {
          setMatchForm(null);
          setImportInitial(games);
          setImportOpen(true);
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
        onOpenCompetition={(c) => openCompetition(c.id)}
        onSeeAllMedia={() => {
          setDetailMatch(null);
          setTab('media');
        }}
      />

      <CompetitionSheet
        view={viewing}
        now={now}
        onClose={() => setCompetitionView(null)}
        onOpenMatch={(m) => {
          setCompetitionView(null);
          setDetailMatch(m);
        }}
        onEnterResult={openResult}
        onAddMatch={(competition) => {
          setCompetitionView(null);
          setReturnTo(competition.id);
          setMatchForm({
            mode: 'create',
            preset: nextMatchFor(competition, matches, teams, settings, todayISO(now)),
          });
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
      <ImportFixturesSheet
        open={importOpen}
        initial={importInitial}
        onClose={() => {
          setImportOpen(false);
          setImportInitial(null);
          if (returnTo) setCompetitionView({ id: returnTo, step: 'summary' });
          setReturnTo(null);
        }}
        onImported={(count) => {
          setImportOpen(false);
          setImportInitial(null);
          setImported(count);
          if (returnTo) setCompetitionView({ id: returnTo, step: 'summary' });
          setReturnTo(null);
        }}
      />
      {imported > 0 && (
        <div className="toast" role="status" onClick={() => setImported(0)}>
          {imported} fixture{imported === 1 ? '' : 's'} added to your calendar
        </div>
      )}

      <TrainingFormSheet target={trainingForm} onClose={() => setTrainingForm(null)} />
    </div>
  );
}

export default function App() {
  return (
    <AppStoreProvider>
      {/* Sits outside Shell so the service worker registers during onboarding too. */}
      <UpdatePrompt />
      <SyncProvider>
        <AcademyProvider>
          <Shell />
        </AcademyProvider>
      </SyncProvider>
    </AppStoreProvider>
  );
}
