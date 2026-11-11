import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m, useScroll, useTransform } from 'motion/react';
import { ROLE_LABEL, VERIFICATION_LABEL, can, type StaffRole } from '../../lib/academy';
import { useAcademy } from '../../store/AcademyProvider';
import { useSync } from '../../store/SyncProvider';
import { SignInForm } from '../AccountSettings';
import {
  BallIcon, ChartIcon, ChevronIcon, GearIcon, HomeIcon, PeopleIcon, ShieldIcon, ShirtIcon, TableIcon, TrophyIcon, WhistleResultIcon,
} from '../icons';
import { BusyLabel, Section, Sheet, Waiting } from '../ui';
import { AcademyHomeSkeleton } from '../Skeletons';
import { AddButton, type AddItem } from '../AddButton';
import { springs } from '../../lib/motion';
import { CreateAcademyForm } from './AcademyDetails';
import { AcademyHome, type AcademyTab } from './AcademyHome';
import { AcademySettings } from './AcademySettings';
import { AdminScreen } from './AdminScreen';
import { AcademyLogo, StaffInviteCard, VerificationBadge, type AddRequest, type AddWhat } from './parts';
import { MatchesScreen } from './MatchesScreen';
import { PlayersScreen } from './PlayersScreen';
import { StatsScreen } from './StatsScreen';
import { TablesScreen } from './TablesScreen';
import { StaffScreen } from './StaffScreen';
import { UsernameForm } from './UsernameForm';

type TabDef = { id: AcademyTab; label: string; Icon: (p: { on?: boolean }) => JSX.Element };
const HOME: TabDef = { id: 'home', label: 'Home', Icon: HomeIcon };
const PLAYERS: TabDef = { id: 'players', label: 'Players', Icon: ShirtIcon };
const MATCHES: TabDef = { id: 'matches', label: 'Matches', Icon: BallIcon };
const TABLES: TabDef = { id: 'tables', label: 'Tables', Icon: TableIcon };
const STATS: TabDef = { id: 'stats', label: 'Stats', Icon: ChartIcon };
const STAFF: TabDef = { id: 'staff', label: 'Staff', Icon: PeopleIcon };

/**
 * Four tabs round the big +, as in the player's app. Matches holds the
 * results and, a tap across, the tables. Staff is a row on Home for those who
 * pick teams; the admin role works on the office side and never sees players'
 * stats or their results, so they get Tables and Staff instead.
 */
function tabsFor(role: StaffRole): TabDef[] {
  return can(role, 'coach') ? [HOME, PLAYERS, MATCHES, STATS] : [HOME, PLAYERS, TABLES, STAFF];
}

const TITLES: Record<AcademyTab, string> = {
  home: 'Home',
  players: 'Players',
  matches: 'Matches',
  tables: 'Tables',
  stats: 'Stats',
  staff: 'Staff',
  settings: 'Settings',
};

/** What the + offers, by what this person may do. */
function addItems(role: StaffRole, ask: (what: AddWhat) => void): AddItem[] {
  const items: AddItem[] = [];
  if (can(role, 'coach')) {
    items.push({ label: 'Result', hint: 'The score, then check each player', Icon: WhistleResultIcon, run: () => ask('result') });
  }
  if (can(role, 'add-players')) items.push({ label: 'Player', hint: 'By username, or just a name', Icon: ShirtIcon, run: () => ask('player') });
  if (can(role, 'run-squads')) items.push({ label: 'Squad', hint: 'U14 Elite, a cup squad…', Icon: PeopleIcon, run: () => ask('squad') });
  if (can(role, 'coach')) {
    items.push({ label: 'Competition', hint: 'A league or a tournament', Icon: TrophyIcon, run: () => ask('competition') });
    items.push({ label: 'Team pick', hint: 'Sort a squad, tick a team', Icon: ChartIcon, run: () => ask('pick') });
  }
  if (can(role, 'invite-staff')) items.push({ label: 'Staff', hint: 'A coach, a manager, the office', Icon: PeopleIcon, run: () => ask('staff') });
  return items;
}

const TAB_FOR: Record<AddWhat, AcademyTab> = {
  result: 'matches',
  player: 'players',
  squad: 'players',
  competition: 'matches',
  pick: 'stats',
  staff: 'staff',
};

/**
 * The academy's half of the app. Loaded only when someone opens it, so the
 * player's app - opened at the side of a pitch, often with no signal - never
 * waits for any of it.
 */
export default function AcademyShell({ hasPlayer }: { hasPlayer: boolean }) {
  const academy = useAcademy();
  const sync = useSync();
  const [tab, setTab] = useState<AcademyTab>('home');
  const [switching, setSwitching] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  const current = academy.current;
  const [request, setRequest] = useState<AddRequest | null>(null);
  const ask = (what: AddWhat) => {
    // The admin role has Tables as a tab of its own, not inside Matches.
    setTab(what === 'competition' && current && !can(current.role, 'coach') ? 'tables' : TAB_FOR[what]);
    setRequest((r) => ({ what, n: (r?.n ?? 0) + 1 }));
  };

  // The large titles and frosted bar, as in the player's app.
  const { scrollY } = useScroll({ container: contentRef });
  const barGlass = useTransform(scrollY, [0, 24], [0, 1]);
  const brandFade = useTransform(scrollY, [12, 44], [1, 0]);
  const titleFade = useTransform(scrollY, [28, 60], [0, 1]);
  const titleLift = useTransform(scrollY, [28, 60], [8, 0]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [tab, current?.id, academy.creating]);

  // Leaving the academy area: to the player's app if there is one, or back to
  // the first question if this phone has only ever been the academy's - so
  // someone who tapped "An academy" by accident is never stuck in here.
  const [confirmExit, setConfirmExit] = useState(false);
  const exitArea = () => {
    setConfirmExit(false);
    academy.setCreating(false);
    academy.setReviewing(false);
    academy.setMode(hasPlayer ? 'player' : null);
  };

  // Leaving or deleting the last academy closes the area too, rather than
  // landing on "join or set one up". Only on going from some to none: someone
  // new, with no academy yet, stays to make one.
  const who = sync.account?.id ?? null;
  const count = academy.loaded ? academy.academies.length : null;
  const lastCount = useRef<{ who: string | null; count: number } | null>(null);
  useEffect(() => {
    if (count === null) return;
    const before = lastCount.current;
    lastCount.current = { who, count };
    // A different person signing in on this phone isn't anyone leaving.
    if (before && before.who === who && before.count > 0 && count === 0) exitArea();
    // exitArea only reads values that are current when the count changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, who]);

  let gate: ReactNode = null;
  if (!sync.account) {
    gate =
      sync.status === 'checking' ? (
        academySaved() ? <AcademyHomeSkeleton /> : <Opening text="Opening…" />
      ) : (
        <SignInGate />
      );
  } else if (!academy.loaded) {
    gate =
      academy.status === 'offline' ? (
        <Problem text="No signal. The academy needs a connection the first time it opens on a phone." />
      ) : academy.status === 'error' ? (
        <Problem text={academy.error} />
      ) : (
        <Opening text="Opening the academy…" />
      );
  } else if (!academy.username) {
    gate = <UsernameGate />;
  } else if (academy.reviewing && academy.isAppAdmin) {
    gate = <AdminScreen onBack={() => academy.setReviewing(false)} />;
  } else if (academy.creating) {
    gate = (
      <div className="screen">
        <div className="screen-head">
          <h1>Set up an academy</h1>
        </div>
        <CreateAcademyForm
          onCreated={() => {
            academy.setCreating(false);
            setTab('home');
          }}
          onCancel={current ? () => academy.setCreating(false) : undefined}
        />
      </div>
    );
  } else if (!current) {
    gate = <StartGate />;
  }

  return (
    <div className={current && !gate ? 'app academy-app with-nav' : 'app academy-app'}>
      <header className="topbar">
        <m.div className="topbar-glass" style={{ opacity: barGlass }} aria-hidden="true" />
        <button className="academy-exit" onClick={() => setConfirmExit(true)}>
          <span className="back-chevron" aria-hidden="true">
            <ChevronIcon />
          </span>
          Exit academy
        </button>
        <div className="topbar-titles">
          {current && !gate ? (
            <m.div style={{ opacity: brandFade }}>
              <button className="academy-switch" onClick={() => setSwitching(true)} aria-label="Your academies">
                <AcademyLogo name={current.name} logo={current.logo} size={32} />
                <span className="academy-switch-text">
                  <span className="academy-switch-name">{current.name}</span>
                  <span className="academy-switch-meta">
                    {ROLE_LABEL[current.role]} · {VERIFICATION_LABEL[current.verification]}
                  </span>
                </span>
                <span className="academy-switch-chev" aria-hidden="true">
                  <ChevronIcon />
                </span>
              </button>
            </m.div>
          ) : (
            <m.div className="brand" style={{ opacity: brandFade }}>
              <span className="brand-mark">
                <ShieldIcon />
              </span>
              <span>Matchday Academy</span>
            </m.div>
          )}
          {current && !gate && (
            <m.div className="topbar-title" style={{ opacity: titleFade, y: titleLift }} aria-hidden="true">
              {tab === 'home' ? current.name : TITLES[tab]}
            </m.div>
          )}
        </div>
        <div className="topbar-actions">
          {current && !gate && (
            <button
              className={tab === 'settings' ? 'topbar-btn on' : 'topbar-btn'}
              onClick={() => setTab(tab === 'settings' ? 'home' : 'settings')}
              aria-label="Academy settings"
              aria-pressed={tab === 'settings'}
            >
              <GearIcon />
            </button>
          )}
        </div>
      </header>

      <main className="content" ref={contentRef}>
        {academy.loaded && academy.status === 'offline' && (
          <p className="notice offline-note">No signal - this is what the phone last saw.</p>
        )}
        {gate ??
          (current && (
            <m.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={springs.smooth}>
              {tab === 'home' && <AcademyHome academy={current} onGo={setTab} />}
              {tab === 'players' && <PlayersScreen academy={current} request={request} />}
              {tab === 'matches' && can(current.role, 'coach') && <MatchesScreen academy={current} request={request} />}
              {tab === 'tables' && <TablesScreen academy={current} request={request} />}
              {tab === 'stats' && can(current.role, 'coach') && <StatsScreen academy={current} request={request} />}
              {tab === 'staff' && (
                <StaffScreen
                  academy={current}
                  request={request}
                  onBack={tabsFor(current.role).some((t) => t.id === 'staff') ? undefined : () => setTab('home')}
                />
              )}
              {tab === 'settings' && <AcademySettings academy={current} hasPlayer={hasPlayer} />}
            </m.div>
          ))}
      </main>

      {current && !gate && (
        <nav className="tabbar">
          {tabsFor(current.role).map((t, i) => {
            // Staff belongs to Home when it isn't a tab of its own, so Home stays lit.
            const tabs = tabsFor(current.role);
            const on =
              tab === t.id ||
              (t.id === 'home' && tab === 'staff' && !tabs.some((x) => x.id === 'staff')) ||
              (t.id === 'matches' && tab === 'tables');
            const items = addItems(current.role, ask);
            return (
              <Fragment key={t.id}>
                {i === 2 && items.length > 0 && <AddButton items={items} />}
                <button className={on ? 'tab on' : 'tab'} onClick={() => setTab(t.id)} aria-current={on ? 'page' : undefined}>
                  {on && <m.span layoutId="academy-tab-pill" className="tab-pill" transition={springs.snappy} />}
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
      )}

      <ExitConfirm open={confirmExit} onStay={() => setConfirmExit(false)} onExit={exitArea} />

      <Sheet open={switching} title="Your academies" onClose={() => setSwitching(false)}>
        <ul className="academy-list">
          {academy.academies.map((a) => (
            <li key={a.id} className={a.id === current?.id ? 'on' : undefined}>
              <AcademyLogo name={a.name} logo={a.logo} size={36} />
              <span className="academy-list-main">
                <strong>{a.name}</strong>
                <span className="muted small">
                  {ROLE_LABEL[a.role]} <VerificationBadge status={a.verification} />
                </span>
              </span>
              {a.id === current?.id ? (
                <span className="muted small">Open</span>
              ) : (
                <button
                  className="ghost-btn"
                  onClick={() => {
                    academy.choose(a.id);
                    setTab('home');
                    setSwitching(false);
                  }}
                >
                  Switch
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          className="link-btn"
          onClick={() => {
            setSwitching(false);
            academy.setCreating(true);
          }}
        >
          + Set up another academy
        </button>
      </Sheet>
    </div>
  );
}

function Opening({ text }: { text: string }) {
  return (
    <div className="screen">
      <Waiting text={text} />
    </div>
  );
}

/** Whether this phone has opened an academy before, so it's worth outlining one while it opens. */
function academySaved(): boolean {
  try {
    return Boolean(localStorage.getItem('matchday.academy.v1'));
  } catch {
    return false;
  }
}

function Problem({ text }: { text: string }) {
  const academy = useAcademy();
  return (
    <div className="screen">
      <p className="notice warn">{text}</p>
      <div className="button-row">
        <button className="ghost-btn" onClick={() => void academy.refresh()}>
          Try again
        </button>
      </div>
    </div>
  );
}

function SignInGate() {
  return (
    <div className="screen">
      <div className="academy-intro">
        <span className="academy-intro-icon">
          <ShieldIcon />
        </span>
        <h1>Run your academy on Matchday</h1>
        <p className="muted">
          Squads, league tables and your players&apos; stats for picking teams - in one place, shared with your coaches.
        </p>
      </div>
      <Section title="Sign in to start">
        <SignInForm
          intro={false}
          footnote="Your email is only for signing in. Staff and players see a username you pick next, never your email."
        />
      </Section>
    </div>
  );
}

function UsernameGate() {
  const sync = useSync();
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Pick your username</h1>
      </div>
      <p className="muted">
        It&apos;s how your academy&apos;s staff and players find you. Nobody sees your email.
      </p>
      <UsernameForm submitLabel="Continue" autoFocus />
      <p className="muted small">
        Signed in as {sync.account?.email} ·{' '}
        <button className="link-btn inline" onClick={() => void sync.signOut()}>
          Sign out
        </button>
      </p>
    </div>
  );
}

/**
 * Signed in, with a username, at no academy yet: wait for an invite to one,
 * or make one. Joining comes first - most people here are staff an owner has
 * already told to get the app - and its invites show right where they look.
 */
function StartGate() {
  const academy = useAcademy();
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [checked, setChecked] = useState(false);
  const checking = academy.status === 'loading';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`@${academy.username}`);
      setCopied(true);
    } catch {
      // Copying is a convenience; the username is on screen to read out.
    }
  };

  const check = async () => {
    await academy.refresh();
    setChecked(true);
  };

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Hi @{academy.username}</h1>
      </div>

      <Section title="Joining an academy's staff?">
        {academy.invites.map((invite) => (
          <StaffInviteCard key={invite.id} invite={invite} />
        ))}
        {academy.invites.length === 0 && (
          <>
            <p className="small">
              Give the owner or a manager your username, <strong>@{academy.username}</strong>. Their invite shows up
              here.
            </p>
            {checked && !checking && (
              <p className="muted small" role="status">
                No invite yet. Check they typed @{academy.username} exactly, then try again.
              </p>
            )}
            <div className="button-row">
              <button className="ghost-btn" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy my username'}
              </button>
              <button className="ghost-btn" disabled={checking} onClick={() => void check()}>
                <BusyLabel busy={checking} text="Checking…">Check for invites</BusyLabel>
              </button>
            </div>
          </>
        )}
      </Section>

      {academy.isAppAdmin && (
        <Section title="Matchday admin">
          <div className="button-row">
            <button className="ghost-btn" onClick={() => academy.setReviewing(true)}>
              Review academies
            </button>
          </div>
        </Section>
      )}

      <Section title="Setting up a new academy?">
        {creating ? (
          <CreateAcademyForm onCreated={() => undefined} onCancel={() => setCreating(false)} />
        ) : (
          <>
            <p className="small">You&apos;ll be its owner, and invite your coaches and staff from there.</p>
            <div className="button-row">
              <button className="primary-btn" onClick={() => setCreating(true)}>
                Set up an academy
              </button>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

/** iPhone's alert: a small card in the middle, two choices split by hairlines. */
function ExitConfirm({ open, onStay, onExit }: { open: boolean; onStay: () => void; onExit: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onStay();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onStay]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="alert-layer" key="exit">
          <m.div
            className="alert-scrim"
            onClick={onStay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.16 } }}
            transition={{ duration: 0.2 }}
          />
          <m.div
            className="alert"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="exit-title"
            aria-describedby="exit-text"
            initial={{ opacity: 0, scale: 1.12 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.16 } }}
            transition={springs.snappy}
          >
            <div className="alert-body">
              <h2 id="exit-title">Exit the academy area?</h2>
              <p id="exit-text">You can come back any time from the first screen.</p>
            </div>
            <div className="alert-actions">
              <button type="button" onClick={onStay} autoFocus>
                Stay
              </button>
              <button type="button" className="strong" onClick={onExit}>
                Exit
              </button>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
