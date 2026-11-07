import { Fragment, Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LazyMotion, MotionConfig, domMax, m, useScroll, useTransform } from 'motion/react';
import { springs } from './lib/motion';
import { useAppearance } from './useAppearance';
import { AppStoreProvider, useStore } from './store/AppStore';
import { SyncProvider, useSync } from './store/SyncProvider';
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
import { CheckingAccount, OpeningSplash, SignInScreen } from './components/SignInScreen';
import { WhoIsThisFor } from './components/WhoIsThisFor';
import { ACADEMY } from './lib/features';
import { MediaScreen } from './components/MediaScreen';
import { AcademyShellSkeleton, CoachSkeleton } from './components/Skeletons';
import { listAllMedia } from './store/media';
// The Anthropic SDK is only needed on the Coach tab, so it stays out of the
// bundle that has to load before the calendar appears.
const AIScreen = lazy(() => import('./components/AIScreen'));
// Likewise the academy area, which only staff ever open. Marked pure so a
// build with the academy release switched off drops it altogether.
const AcademyShell = /* @__PURE__ */ lazy(() => import('./components/academy/AcademyShell'));
import { InstallBanner } from './components/InstallBanner';
import { AddButton } from './components/AddButton';
import { PullToRefresh } from './components/PullToRefresh';
import { UndoProvider } from './components/UndoToast';
import { UpdatePrompt } from './components/UpdatePrompt';
import { BallIcon, CalendarIcon, ChartIcon, CoachIcon, GearIcon, PasteIcon, RunIcon, ShieldIcon, TrophyIcon } from './components/icons';
import { Logo } from './components/Logo';

type Tab = 'calendar' | 'matches' | 'media' | 'coach' | 'stats' | 'setup';

/** The last year this phone was invited to watch its Wrapped. */
const WRAPPED_SEEN_KEY = 'matchday.wrappedSeen';

// The big + sits between Matches and Stats. Clips live inside Matches now.
const TABS: { id: Tab; label: string; Icon: (p: { on?: boolean }) => JSX.Element }[] = [
  { id: 'calendar', label: 'Calendar', Icon: CalendarIcon },
  { id: 'matches', label: 'Matches', Icon: BallIcon },
  { id: 'stats', label: 'Stats', Icon: ChartIcon },
  { id: 'coach', label: 'Coach', Icon: CoachIcon },
];
const TITLES: Record<Tab, string> = {
  calendar: 'Calendar',
  matches: 'Matches',
  media: 'Clips',
  stats: 'Stats',
  coach: 'Coach',
  setup: 'Setup',
};

function Shell() {
  const { matches, settings, profile, training, competitions, teams } = useStore();
  const academy = useAcademy();
  const sync = useSync();
  const now = useNow();
  // Dark by default, Light or Automatic from Setup; the accent is the team's own colour.
  useAppearance(teams[0]?.color);

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
  // How many clips are saved, for the Clips row on Matches.
  const [clipCount, setClipCount] = useState(0);
  useEffect(() => {
    if (tab !== 'matches') return;
    let live = true;
    void listAllMedia()
      .then((all) => live && setClipCount(all.length))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [tab]);
  // iOS's large titles: as the page scrolls, the bar frosts over and the
  // brand gives way to the screen's own name.
  const { scrollY } = useScroll({ container: contentRef });
  const barGlass = useTransform(scrollY, [0, 24], [0, 1]);
  const brandFade = useTransform(scrollY, [12, 44], [1, 0]);
  const titleFade = useTransform(scrollY, [28, 60], [0, 1]);
  const titleLift = useTransform(scrollY, [28, 60], [8, 0]);

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

  // Signed in on this phone just now, rather than opened already signed in:
  // worth a moment to see what the account brings before showing anything.
  const accountId = sync.account?.id ?? null;
  const [seenAccount, setSeenAccount] = useState(accountId);
  const [signedInHere, setSignedInHere] = useState<string | null>(null);
  const [carryOn, setCarryOn] = useState(false);
  if (accountId !== seenAccount) {
    setSeenAccount(accountId);
    setSignedInHere(accountId && !seenAccount ? accountId : null);
    setCarryOn(false);
  }

  // Someone who works at an academy and has no player of their own goes
  // straight to the academy on a new phone, rather than being asked. Once per
  // sign-in, so leaving it for the first question doesn't bounce them back.
  const pickedAcademyFor = useRef<string | null>(null);
  const staffOnly =
    ACADEMY && academy.enabled && academy.mode === null && !profile.onboardedAt && sync.checked && !sync.household &&
    academy.loaded && academy.academies.length > 0 && pickedAcademyFor.current !== accountId;
  useLayoutEffect(() => {
    if (!staffOnly) return;
    pickedAcademyFor.current = accountId;
    academy.setMode('academy');
  }, [staffOnly, accountId, academy]);

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

  // With accounts in this build, nothing opens until someone signs in. A phone
  // that has signed in before opens at once, signal or not.
  if (sync.available && !sync.account) {
    return sync.status === 'checking' ? <OpeningSplash /> : <SignInScreen />;
  }

  // Academy staff: their half of the app, with no player's calendar unless this phone has one.
  // (ACADEMY first each time: with the release switched off, the build drops all of this.)
  if ((ACADEMY && academy.enabled && academy.mode === 'academy') || staffOnly) {
    return (
      <Suspense fallback={<AcademyShellSkeleton />}>
        <AcademyShell hasPlayer={Boolean(profile.onboardedAt)} />
      </Suspense>
    );
  }

  // Before setting anyone up, or straight after signing in: what the account
  // already has. A player it has comes down with the first sync and this
  // gives way to the app itself - no details typed in twice.
  const academyUnknown =
    ACADEMY && academy.enabled && academy.mode === null && !academy.loaded &&
    (academy.status === 'idle' || academy.status === 'loading');
  if (
    sync.available && !carryOn &&
    ((!sync.checked && (!profile.onboardedAt || signedInHere === accountId)) ||
      (!profile.onboardedAt && sync.checked && academyUnknown))
  ) {
    return <CheckingAccount onCarryOn={() => setCarryOn(true)} />;
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
        <m.div className="topbar-glass" style={{ opacity: barGlass }} aria-hidden="true" />
        <div className="topbar-titles">
          <m.div className="brand" style={{ opacity: brandFade }}>
            <span className="brand-mark">
              <Logo />
            </span>
            <span>Matchday</span>
          </m.div>
          <m.div className="topbar-title" style={{ opacity: titleFade, y: titleLift }} aria-hidden="true">
            {TITLES[tab]}
          </m.div>
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
        <PullToRefresh scroller={contentRef} enabled={Boolean(sync.account)} onRefresh={sync.syncNow}>
        {/* Screens cross-fade and rise a touch; nothing slides sideways, as on iOS's tab bar. */}
        <m.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={springs.smooth}>
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
            onOpenCard={() => setTab('stats')}
          />
        )}
        {tab === 'matches' && (
          <MatchesScreen
            now={now}
            onOpenMatch={setDetailMatch}
            onAddMatch={(dateISO) => setMatchForm({ mode: 'create', dateISO })}
            onEnterResult={openResult}
            onEditMatch={(m) => setMatchForm({ mode: 'edit', match: m })}
            onAddTournament={() => setTournamentOpen(true)}
            onOpenCompetition={openCompetition}
            onOpenClips={() => setTab('media')}
            clipCount={clipCount}
          />
        )}
        {tab === 'media' && <MediaScreen onOpenMatch={setDetailMatch} onBack={() => setTab('matches')} />}
        {tab === 'coach' && (
          <Suspense fallback={<CoachSkeleton />}>
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
        </m.div>
        </PullToRefresh>
      </main>

      <nav className="tabbar">
        {TABS.map((t, i) => {
          // Clips belong to Matches, so Matches stays lit while they're open.
          const on = tab === t.id || (t.id === 'matches' && tab === 'media');
          return (
            <Fragment key={t.id}>
              {i === 2 && (
                <AddButton
                  items={[
                    { label: 'Match', hint: 'A game on the calendar', Icon: BallIcon, run: () => setMatchForm({ mode: 'create', dateISO: todayISO(now) }) },
                    { label: 'Tournament', hint: 'A day of games, with groups', Icon: TrophyIcon, run: () => setTournamentOpen(true) },
                    { label: 'Training', hint: 'A session you went to', Icon: RunIcon, run: () => setTrainingForm({ mode: 'create', dateISO: todayISO(now) }) },
                    { label: 'Import fixtures', hint: 'From a photo or a message', Icon: PasteIcon, run: () => setImportOpen(true) },
                  ]}
                />
              )}
              <button
                className={on ? 'tab on' : 'tab'}
                onClick={() => setTab(t.id)}
                aria-current={on ? 'page' : undefined}
              >
                {on && <m.span layoutId="tab-pill" className="tab-pill" transition={springs.snappy} />}
                {/* A small bounce when chosen - Apple's symbol "bounce". */}
                <m.span
                  className="tab-icon"
                  animate={on ? { scale: [1, 1.22, 0.94, 1] } : { scale: 1 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                >
                  <t.Icon on={on} />
                </m.span>
                <span className="tab-label">{t.label}</span>
              </button>
            </Fragment>
          );
        })}
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
    // Springs, drags and shared-element morphs, loaded once for the whole app.
    // reducedMotion="user": with Reduce Motion on, things fade instead of moving.
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={springs.smooth}>
        <AppStoreProvider>
          {/* Sits outside Shell so the service worker registers during onboarding too. */}
          <UpdatePrompt />
          <SyncProvider>
            <AcademyProvider>
              <UndoProvider>
                <Shell />
              </UndoProvider>
            </AcademyProvider>
          </SyncProvider>
        </AppStoreProvider>
      </MotionConfig>
    </LazyMotion>
  );
}
