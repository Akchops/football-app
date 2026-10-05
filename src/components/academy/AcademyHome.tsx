import { useEffect, useState } from 'react';
import { ROLE_LABEL, can, describeAcademyError, type StaffAcademy } from '../../lib/academy';
import { useAcademy } from '../../store/AcademyProvider';
import { Section } from '../ui';
import { AcademyLogo, VerificationBadge, useLoad } from './parts';

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

  return (
    <div className="screen">
      <div className="academy-hero">
        <AcademyLogo name={academy.name} logo={academy.logo} size={64} />
        <div className="academy-hero-text">
          <h1>{academy.name}</h1>
          {where && <p className="muted small">{where}</p>}
          <p className="academy-hero-meta">
            <VerificationBadge status={academy.verification} />
            <span className="muted small">You&apos;re the {ROLE_LABEL[academy.role].toLowerCase()}</span>
          </p>
        </div>
      </div>

      {academy.verification === 'rejected' && academy.verificationNote && (
        <p className="notice warn">Matchday couldn&apos;t verify the academy: {academy.verificationNote}</p>
      )}

      {requireVerification && academy.verification !== 'verified' && (
        <p className="notice warn">
          Matchday needs to verify the academy before it can add players.{' '}
          {academy.role === 'owner' ? 'Send your documents from Settings.' : 'The owner sends the documents.'}
        </p>
      )}
      {academy.role === 'owner' && (academy.verification === 'unverified' || academy.verification === 'rejected') && (
        <button className="summary-row" onClick={() => onGo('settings')}>
          <span>
            <strong>Get verified</strong>
            <span className="muted small"> - send Matchday your registration and certificates for the badge</span>
          </span>
          <span className="chev" aria-hidden="true">
            ›
          </span>
        </button>
      )}

      <JoinCode academy={academy} />

      <Section title="Players">
        <button className="summary-row" onClick={() => onGo('players')}>
          <span>
            {onBooks === null || squadCount === null
              ? players.error || squads.error || 'Loading…'
              : `${onBooks.length} player${onBooks.length === 1 ? '' : 's'} · ${squadCount} squad${squadCount === 1 ? '' : 's'}`}
            {asking > 0 && <strong className="summary-alert"> · {asking} asking to join</strong>}
          </span>
          <span className="chev" aria-hidden="true">
            ›
          </span>
        </button>
      </Section>

      <Section title="Staff">
        <button className="summary-row" onClick={() => onGo('staff')}>
          <span>
            {staffCount === null
              ? staff.error || 'Loading…'
              : `${staffCount} on the staff${invited ? ` · ${invited} invite${invited === 1 ? '' : 's'} waiting` : ''}`}
          </span>
          <span className="chev" aria-hidden="true">
            ›
          </span>
        </button>
      </Section>

      {!allDone && (
        <Section title="Getting started">
          <ol className="checklist">
            {steps.map((step) => (
              <li key={step.label} className={step.done ? 'done' : ''}>
                <span className="check" aria-hidden="true">
                  {step.done ? '✓' : ''}
                </span>
                {step.go && !step.done ? (
                  <button className="link-btn" onClick={() => onGo(step.go!)}>
                    {step.label}
                  </button>
                ) : (
                  <span>{step.label}</span>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}
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
    <section className="code-card" aria-label="Join code">
      <span className="code-label">Join code</span>
      <span className="join-code">{academy.joinCode}</span>
      <p className="muted small">
        Players enter it in their Matchday to ask to join. Your coaching staff say yes to each one, and the family
        agrees to share their stats.
      </p>
      {error && <p className="notice warn">{error}</p>}
      <div className="button-row">
        <button className="ghost-btn" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        {typeof navigator.share === 'function' && (
          <button className="ghost-btn" onClick={() => void share()}>
            Share
          </button>
        )}
        {can(academy.role, 'new-join-code') && (
          <button className="link-btn" disabled={busy} onClick={() => void renew()}>
            New code
          </button>
        )}
      </div>
    </section>
  );
}
