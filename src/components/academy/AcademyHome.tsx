import { useEffect, useState, type ReactNode } from 'react';
import { m } from 'motion/react';
import { ROLE_LABEL, can, describeAcademyError, type StaffAcademy } from '../../lib/academy';
import { useAcademy } from '../../store/AcademyProvider';
import { springs, stagger } from '../../lib/motion';
import { CheckIcon, ChevronIcon, PeopleIcon, ShieldIcon, ShirtIcon, TableIcon } from '../icons';
import { RollingNumber, Section } from '../ui';
import { AcademyLogo, VerificationBadge, useLoad } from './parts';

/** A Settings-style row: a coloured symbol, what it is, what's there, a chevron. */
function NavRow({
  icon,
  color,
  label,
  detail,
  alert,
  onClick,
}: {
  icon: ReactNode;
  color: string;
  label: string;
  detail: string;
  alert?: string;
  onClick: () => void;
}) {
  return (
    <button className="nav-row" onClick={onClick}>
      <span className="icon-square" style={{ background: color }} aria-hidden="true">
        {icon}
      </span>
      <span className="nav-row-text">
        <span className="nav-row-label">{label}</span>
        {alert && <span className="nav-row-alert">{alert}</span>}
      </span>
      <span className="nav-row-detail">{detail}</span>
      <span className="row-chevron" aria-hidden="true">
        <ChevronIcon />
      </span>
    </button>
  );
}

export type AcademyTab = 'home' | 'players' | 'tables' | 'stats' | 'staff' | 'settings';

/** The academy at a glance: who it is, its join code, and what to do next. */
export function AcademyHome({ academy, onGo }: { academy: StaffAcademy; onGo: (tab: AcademyTab) => void }) {
  const { api, requireVerification } = useAcademy();
  const staff = useLoad(api ? () => api.staff(academy.id) : null, academy.id);
  const pending = useLoad(api ? () => api.pendingStaff(academy.id) : null, academy.id);
  const squads = useLoad(api ? () => api.squads(academy.id) : null, academy.id);
  const players = useLoad(api ? () => api.players(academy.id) : null, academy.id);

  const where = [academy.town, academy.country].filter(Boolean).join(', ');
  const staffCount = staff.data?.length ?? null;
  const invited = pending.data?.length ?? 0;
  const squadCount = squads.data?.length ?? null;
  const onBooks = players.data?.filter((p) => p.status === 'linked' || p.status === 'invited' || p.status === 'roster') ?? null;
  const asking = players.data?.filter((p) => p.status === 'requested').length ?? 0;

  const steps: { label: string; done: boolean; go: AcademyTab | null }[] = [{ label: 'Set up the academy', done: true, go: null }];
  if (can(academy.role, 'invite-staff')) {
    steps.push({ label: 'Invite your coaches and staff', done: (staffCount ?? 0) > 1 || invited > 0, go: 'staff' });
  }
  if (can(academy.role, 'run-squads')) {
    steps.push({ label: 'Make your squads', done: (squadCount ?? 0) > 0, go: 'players' });
  }
  if (can(academy.role, 'add-players')) {
    steps.push({ label: 'Add your players', done: (onBooks?.length ?? 0) > 0, go: 'players' });
  }
  const allDone = steps.every((s) => s.done);

  const stat = (value: number | null, label: string) => (
    <span className="ac-hero-stat">
      <span className="ac-hero-num">{value === null ? '–' : <RollingNumber value={value} />}</span>
      <span className="ac-hero-label">{label}</span>
    </span>
  );

  return (
    <div className="screen">
      {/* Who the academy is, at a glance: its badge, its place, its numbers. */}
      <m.div
        className="ac-hero"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springs.smooth}
      >
        <div className="ac-hero-top">
          <AcademyLogo name={academy.name} logo={academy.logo} size={60} />
          <div className="ac-hero-text">
            <h1>{academy.name}</h1>
            {where && <p>{where}</p>}
            <p className="ac-hero-meta">
              <VerificationBadge status={academy.verification} />
              <span>You&apos;re the {ROLE_LABEL[academy.role].toLowerCase()}</span>
            </p>
          </div>
        </div>
        <div className="ac-hero-stats">
          {stat(onBooks?.length ?? null, onBooks?.length === 1 ? 'Player' : 'Players')}
          {stat(squadCount, squadCount === 1 ? 'Squad' : 'Squads')}
          {stat(staffCount, 'Staff')}
        </div>
      </m.div>

      {academy.verification === 'rejected' && academy.verificationNote && (
        <p className="notice warn">Matchday couldn&apos;t verify the academy: {academy.verificationNote}</p>
      )}

      {requireVerification && academy.verification !== 'verified' && (
        <p className="notice warn">
          Matchday needs to verify the academy before it can add players.{' '}
          {academy.role === 'owner' ? 'Send your documents from Settings.' : 'The owner sends the documents.'}
        </p>
      )}

      {!allDone && (
        <Section title="Getting started">
          <ol className="checklist ac-steps">
            {steps.map((step, i) => (
              <m.li key={step.label} className={step.done ? 'done' : ''} {...stagger(i)}>
                <span className="check" aria-hidden="true">
                  {step.done && <CheckIcon />}
                </span>
                {step.go && !step.done ? (
                  <button className="link-btn" onClick={() => onGo(step.go!)}>
                    {step.label}
                  </button>
                ) : (
                  <span>{step.label}</span>
                )}
              </m.li>
            ))}
          </ol>
        </Section>
      )}

      <div className="list-group nav-group">
        <NavRow
          icon={<ShirtIcon on />}
          color="#0a84ff"
          label="Players"
          detail={
            onBooks === null || squadCount === null
              ? players.error || squads.error || '…'
              : `${onBooks.length} · ${squadCount} squad${squadCount === 1 ? '' : 's'}`
          }
          alert={asking > 0 ? `${asking} asking to join` : undefined}
          onClick={() => onGo('players')}
        />
        <NavRow
          icon={<PeopleIcon on />}
          color="#bf5af2"
          label="Staff"
          detail={staffCount === null ? staff.error || '…' : `${staffCount}${invited ? ` · ${invited} invited` : ''}`}
          onClick={() => onGo('staff')}
        />
        <NavRow icon={<TableIcon on />} color="#30d158" label="Tables" detail="" onClick={() => onGo('tables')} />
        {academy.role === 'owner' && (academy.verification === 'unverified' || academy.verification === 'rejected') && (
          <NavRow
            icon={<ShieldIcon />}
            color="#ff9f0a"
            label="Get verified"
            detail="Badge"
            onClick={() => onGo('settings')}
          />
        )}
      </div>

      <JoinCode academy={academy} />
    </div>
  );
}

function JoinCode({ academy }: { academy: StaffAcademy }) {
  const { api, refresh } = useAcademy();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const message = `Join ${academy.name} on Matchday: open the app, go to Setup → Academies, and enter the code ${academy.joinCode}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(academy.joinCode);
      setCopied(true);
    } catch {
      setError("Couldn't copy - press and hold the code instead.");
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: `${academy.name} on Matchday`, text: message });
    } catch {
      // Closing the share sheet is not a failure.
    }
  };

  const renew = async () => {
    if (!api) return;
    if (!confirm('Make a new join code? The old one stops working straight away. Requests already sent still count.')) return;
    setBusy(true);
    setError('');
    try {
      await api.newJoinCode(academy.id);
      await refresh();
    } catch (e) {
      setError(describeAcademyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <m.section
      className="code-card"
      aria-label="Join code"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.smooth, delay: 0.08 }}
    >
      <span className="code-label">Join code</span>
      <span className="join-code">
        {academy.joinCode.split('').map((ch, i) => (
          <m.span
            key={`${academy.joinCode}-${i}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.snappy, delay: 0.12 + i * 0.04 }}
          >
            {ch}
          </m.span>
        ))}
      </span>
      <p className="code-help">
        Players enter it in their Matchday to ask to join. Your coaching staff say yes to each one, and the family
        agrees to share their stats.
      </p>
      {error && <p className="notice warn">{error}</p>}
      <div className="code-actions">
        <button className="code-btn" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        {typeof navigator.share === 'function' && (
          <button className="code-btn" onClick={() => void share()}>
            Share
          </button>
        )}
        {can(academy.role, 'new-join-code') && (
          <button className="code-btn subtle" disabled={busy} onClick={() => void renew()}>
            New code
          </button>
        )}
      </div>
    </m.section>
  );
}
