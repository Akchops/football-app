import { useState } from 'react';
import { ROLE_LABEL } from '../../lib/academy';
import { useAcademy } from '../../store/AcademyProvider';
import { useSync } from '../../store/SyncProvider';
import { Section } from '../ui';
import { AcademyLogo, StaffInviteCard, VerificationBadge } from './parts';
import { UsernameForm } from './UsernameForm';

/**
 * Academies, from the player's side of the app: the username an academy finds
 * you by, invites to work at one, the ones you already work at, and making one.
 */
export function AcademySection() {
  const academy = useAcademy();
  const sync = useSync();
  const [changing, setChanging] = useState(false);
  if (!academy.enabled) return null;

  const open = (id?: string) => {
    if (id) academy.choose(id);
    // With no academy to open, the academy area starts at setting one up anyway.
    else if (academy.academies.length > 0) academy.setCreating(true);
    academy.setMode('academy');
  };

  return (
    <Section title="Academies">
      {!sync.account ? (
        <p className="muted small">
          Sign in above to join an academy&apos;s staff or set one up. Academies are shared, so they need an account.
        </p>
      ) : !academy.loaded ? (
        <p className="muted small">
          {academy.status === 'offline' ? 'No signal - academies will show when you are back online.' : academy.error || 'Checking…'}
        </p>
      ) : (
        <>
          {academy.username && !changing ? (
            <div className="username-row">
              <span>
                Your username: <strong>@{academy.username}</strong>
              </span>
              <button className="link-btn" onClick={() => setChanging(true)}>
                Change
              </button>
            </div>
          ) : (
            <>
              {!academy.username && (
                <p className="muted small">Pick a username. It&apos;s how an academy finds you - nobody sees your email.</p>
              )}
              <UsernameForm onSaved={() => setChanging(false)} onCancel={academy.username ? () => setChanging(false) : undefined} />
            </>
          )}

          {academy.invites.map((invite) => (
            <StaffInviteCard key={invite.id} invite={invite} onJoined={(id) => open(id)} />
          ))}

          {academy.academies.length > 0 && (
            <ul className="academy-list">
              {academy.academies.map((a) => (
                <li key={a.id}>
                  <AcademyLogo name={a.name} logo={a.logo} size={36} />
                  <span className="academy-list-main">
                    <strong>{a.name}</strong>
                    <span className="muted small">
                      {ROLE_LABEL[a.role]} <VerificationBadge status={a.verification} />
                    </span>
                  </span>
                  <button className="ghost-btn" onClick={() => open(a.id)}>
                    Open
                  </button>
                </li>
              ))}
            </ul>
          )}

          {academy.username && (
            <button className="link-btn" onClick={() => open()}>
              {academy.academies.length > 0 ? 'Set up another academy' : 'Run an academy? Set one up'}
            </button>
          )}
        </>
      )}
    </Section>
  );
}
