import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ROLE_LABEL, VERIFICATION_LABEL, can, type StaffRole } from '../../lib/academy';
import { useAcademy } from '../../store/AcademyProvider';
import { useSync } from '../../store/SyncProvider';
import { SignInForm } from '../AccountSettings';
import { BallIcon, ChartIcon, GearIcon, HomeIcon, PeopleIcon, ShieldIcon, ShirtIcon, TableIcon } from '../icons';
import { Section, Sheet } from '../ui';
import { CreateAcademyForm } from './AcademyDetails';
import { AcademyHome, type AcademyTab } from './AcademyHome';
import { AcademySettings } from './AcademySettings';
import { AdminScreen } from './AdminScreen';
import { AcademyLogo, StaffInviteCard, VerificationBadge } from './parts';
import { PlayersScreen } from './PlayersScreen';
import { StatsScreen } from './StatsScreen';
import { TablesScreen } from './TablesScreen';
import { StaffScreen } from './StaffScreen';
import { UsernameForm } from './UsernameForm';

const TABS: { id: AcademyTab; label: string; Icon: () => JSX.Element }[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'players', label: 'Players', Icon: ShirtIcon },
  { id: 'tables', label: 'Tables', Icon: TableIcon },
  { id: 'stats', label: 'Stats', Icon: ChartIcon },
  { id: 'staff', label: 'Staff', Icon: PeopleIcon },
];

/** The admin role works on the office side and never sees players' stats, so has no Stats tab. */
function tabsFor(role: StaffRole) {
  return TABS.filter((t) => t.id !== 'stats' || can(role, 'coach'));
}

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

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [tab, current?.id, academy.creating]);

  // Leaving the academy area: to the player's app if there is one, or back to
  // the first question if this phone has only ever been the academy's.
  const leaveArea = () => academy.setMode(hasPlayer ? 'player' : null);

  let gate: ReactNode = null;
  if (!sync.account) {
    gate =
      sync.status === 'checking' ? (
        <Waiting text="Opening…" />
      ) : (
        <SignInGate hasPlayer={hasPlayer} onLeave={leaveArea} />
      );
  } else if (!academy.loaded) {
    gate =
      academy.status === 'offline' ? (
        <Problem text="No signal. The academy needs a connection the first time it opens on a phone." />
      ) : academy.status === 'error' ? (
        <Problem text={academy.error} />
      ) : (
        <Waiting text="Opening the academy…" />
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
        {current && !gate ? (
          <button className="academy-switch" onClick={() => setSwitching(true)} aria-label="Your academies">
            <AcademyLogo name={current.name} logo={current.logo} size={34} />
            <span className="academy-switch-text">
              <span className="academy-switch-name">{current.name}</span>
              <span className="academy-switch-meta">
                {ROLE_LABEL[current.role]} · {VERIFICATION_LABEL[current.verification]}
              </span>
            </span>
            <span className="chev" aria-hidden="true">
              ▾
            </span>
          </button>
        ) : (
          <div className="brand">
            <span className="brand-mark">
              <ShieldIcon />
            </span>
            <span>Matchday Academy</span>
          </div>
        )}
        <div className="topbar-actions">
          {hasPlayer && (
            <button className="topbar-btn" onClick={() => academy.setMode('player')} aria-label="My matches">
              <BallIcon />
            </button>
          )}
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
            <>
              {tab === 'home' && <AcademyHome academy={current} onGo={setTab} />}
              {tab === 'players' && <PlayersScreen academy={current} />}
              {tab === 'tables' && <TablesScreen academy={current} />}
              {tab === 'stats' && can(current.role, 'coach') && <StatsScreen academy={current} />}
              {tab === 'staff' && <StaffScreen academy={current} />}
              {tab === 'settings' && <AcademySettings academy={current} hasPlayer={hasPlayer} />}
            </>
          ))}
      </main>

      {current && !gate && (
        <nav className="tabbar" style={{ gridTemplateColumns: `repeat(${tabsFor(current.role).length}, 1fr)` }}>
          {tabsFor(current.role).map((t) => (
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
      )}

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

function Waiting({ text }: { text: string }) {
  return (
    <div className="screen">
      <div className="reading-state">
        <div className="spinner" />
        <p className="muted small">{text}</p>
      </div>
    </div>
  );
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

function SignInGate({ hasPlayer, onLeave }: { hasPlayer: boolean; onLeave: () => void }) {
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
      <button className="link-btn" onClick={onLeave}>
        {hasPlayer ? 'Back to my matches' : 'Not an academy? Go back'}
      </button>
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
                {checking ? 'Checking…' : 'Check for invites'}
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
