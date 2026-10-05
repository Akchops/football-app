import { useId, useState } from 'react';
import { ROLE_LABEL, cleanJoinCode, describeAcademyError, type Membership, type PlayerInvite } from '../../lib/academy';
import { useAcademy } from '../../store/AcademyProvider';
import { useStore } from '../../store/AppStore';
import { useSync } from '../../store/SyncProvider';
import { Section } from '../ui';
import { AcademyLogo, StaffInviteCard, VerificationBadge } from './parts';
import { UsernameForm } from './UsernameForm';

/** How many squad mates to name before "and 6 others". */
const MATES_SHOWN = 8;

/**
 * Academies, from the player's side of the app. For the family: academies
 * asking to add their player, the ones they are in - with squad mates' names,
 * and nothing more - requests they have sent, and joining with a code. For
 * staff: invites to work at one, the ones they work at, and making one. And
 * the username an academy finds you by.
 */
export function AcademySection() {
  const academy = useAcademy();
  const sync = useSync();
  const { profile } = useStore();
  const [changing, setChanging] = useState(false);
  const [joining, setJoining] = useState(false);
  if (!academy.enabled) return null;

  const name = profile.name.trim() || 'this player';

  const open = (id?: string) => {
    if (id) academy.choose(id);
    // With no academy to open, the academy area starts at setting one up anyway.
    else if (academy.academies.length > 0) academy.setCreating(true);
    academy.setMode('academy');
  };

  if (!sync.account) {
    return (
      <Section title="Academies">
        <p className="muted small">
          Sign in above to link {name} to an academy, or to work at one. Academies are shared, so they need an account.
        </p>
      </Section>
    );
  }

  if (!academy.loaded) {
    return (
      <Section title="Academies">
        <p className="muted small">
          {academy.status === 'offline' ? 'No signal - academies will show when you are back online.' : academy.error || 'Checking…'}
        </p>
      </Section>
    );
  }

  const inOne = academy.memberships.length > 0 || academy.joinRequests.length > 0;

  return (
    <Section title="Academies">
      {academy.playerInvites.map((invite) => (
        <PlayerInviteCard key={invite.id} invite={invite} name={name} />
      ))}

      {academy.memberships.map((m) => (
        <MembershipCard key={m.linkId} membership={m} name={name} />
      ))}

      {academy.joinRequests.map((r) => (
        <RequestRow key={r.id} id={r.id} academyName={r.academyName} town={r.town} />
      ))}

      {!inOne || joining ? (
        sync.household ? (
          <JoinByCode name={name} onCancel={inOne ? () => setJoining(false) : undefined} onSent={() => setJoining(false)} />
        ) : (
          <p className="muted small">
            Once this phone has synced with your family for the first time, {name} can join an academy here.
          </p>
        )
      ) : (
        <button className="link-btn" onClick={() => setJoining(true)}>
          Join another academy
        </button>
      )}

      <div className="section-divider" />

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
            <p className="muted small">
              Pick a username. An academy invites {name}, or you as staff, by it - nobody sees your email.
            </p>
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
                  You&apos;re {a.role === 'admin' ? 'an' : 'a'} {ROLE_LABEL[a.role].toLowerCase()} <VerificationBadge status={a.verification} />
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
    </Section>
  );
}

/** The line that says what an academy will see. Said the same way wherever a family says yes. */
function WhatTheySee({ name }: { name: string }) {
  return (
    <p className="muted small">
      They&apos;ll see everything {name} logs in Matchday - profile, matches and their notes, training and stats. Match
      photos and videos stay on this phone. You can leave at any time, and they stop seeing it straight away.
    </p>
  );
}

function Consent({ name, checked, onChange }: { name: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="toggle-row consent">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>I&apos;m 13 or over, or I&apos;m {name}&apos;s parent or guardian.</span>
    </label>
  );
}

function PlayerInviteCard({ invite, name }: { invite: PlayerInvite; name: string }) {
  const academy = useAcademy();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const answer = async (accept: boolean) => {
    if (!academy.api) return;
    if (!accept && !confirm(`Say no to ${invite.academyName}?`)) return;
    setBusy(true);
    setError('');
    try {
      await academy.api.answerPlayerInvite(invite.id, accept, accept && consent);
      await academy.refresh();
    } catch (e) {
      setError(describeAcademyError(e));
      setBusy(false);
    }
  };

  return (
    <div className="invite-card">
      <div className="invite-head">
        <strong>{invite.academyName}</strong>
        <VerificationBadge status={invite.verification} />
      </div>
      <p className="small">
        {invite.academyName}
        {invite.town ? ` in ${invite.town}` : ''} wants to add <strong>{name}</strong>
        {invite.invitedBy ? ` - asked by @${invite.invitedBy}` : ''}.
      </p>
      <WhatTheySee name={name} />
      {invite.verification !== 'verified' && (
        <p className="muted small">Matchday hasn&apos;t checked this academy yet. Only say yes if you know who sent it.</p>
      )}
      <Consent name={name} checked={consent} onChange={setConsent} />
      {error && <p className="notice warn">{error}</p>}
      <div className="button-row">
        <button className="primary-btn" disabled={busy || !consent} onClick={() => void answer(true)}>
          Accept
        </button>
        <button className="ghost-btn" disabled={busy} onClick={() => void answer(false)}>
          Decline
        </button>
      </div>
    </div>
  );
}

function MembershipCard({ membership, name }: { membership: Membership; name: string }) {
  const academy = useAcademy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const leave = async () => {
    if (!academy.api) return;
    if (!confirm(`Leave ${membership.academyName}? They stop seeing ${name}'s matches and stats straight away.`)) return;
    setBusy(true);
    setError('');
    try {
      await academy.api.leaveAcademy(membership.linkId);
      await academy.refresh();
    } catch (e) {
      setError(describeAcademyError(e));
      setBusy(false);
    }
  };

  return (
    <div className="membership-card">
      <div className="membership-head">
        <AcademyLogo name={membership.academyName} logo={membership.logo} size={40} />
        <span className="academy-list-main">
          <strong>{membership.academyName}</strong>
          <span className="muted small">
            {membership.town && `${membership.town} `}
            <VerificationBadge status={membership.verification} />
          </span>
        </span>
      </div>
      {membership.squads.length === 0 ? (
        <p className="muted small">{name} isn&apos;t in a squad yet.</p>
      ) : (
        membership.squads.map((s) => (
          <p key={s.id} className="small">
            <strong>{s.name}</strong>
            {s.mates.length > 0 && (
              <span className="muted">
                {' '}
                with {s.mates.slice(0, MATES_SHOWN).join(', ')}
                {s.mates.length > MATES_SHOWN ? ` and ${s.mates.length - MATES_SHOWN} others` : ''}
              </span>
            )}
          </p>
        ))
      )}
      {error && <p className="notice warn">{error}</p>}
      <button className="danger-link" disabled={busy} onClick={() => void leave()}>
        Leave {membership.academyName}
      </button>
    </div>
  );
}

function RequestRow({ id, academyName, town }: { id: string; academyName: string; town: string }) {
  const academy = useAcademy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const takeBack = async () => {
    if (!academy.api) return;
    setBusy(true);
    setError('');
    try {
      await academy.api.leaveAcademy(id);
      await academy.refresh();
    } catch (e) {
      setError(describeAcademyError(e));
      setBusy(false);
    }
  };

  return (
    <div className="request-row">
      <p className="small">
        Asked to join <strong>{academyName}</strong>
        {town ? ` in ${town}` : ''} - waiting for them to say yes.
      </p>
      {error && <p className="notice warn">{error}</p>}
      <button className="link-btn" disabled={busy} onClick={() => void takeBack()}>
        Take back
      </button>
    </div>
  );
}

function JoinByCode({ name, onSent, onCancel }: { name: string; onSent: () => void; onCancel?: () => void }) {
  const academy = useAcademy();
  const id = useId();
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (!academy.api) return;
    if (code.length !== 6) return setError('A join code is 6 letters and numbers - ask the academy for it.');
    setBusy(true);
    setError('');
    try {
      await academy.api.joinByCode(code, consent);
      await academy.refresh();
      setCode('');
      setConsent(false);
      onSent();
    } catch (e) {
      setError(describeAcademyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="detail-block join-code-form">
      <div className="field">
        <label className="field-label" htmlFor={`${id}-code`}>
          Join an academy with its code
        </label>
        <input
          id={`${id}-code`}
          aria-describedby={`${id}-hint`}
          className="input code-input"
          value={code}
          onChange={(e) => setCode(cleanJoinCode(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && consent && !busy && void send()}
          placeholder="ABC123"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
        />
        <span id={`${id}-hint`} className="field-hint">
          Or give the academy your username below, and they can invite {name}.
        </span>
      </div>
      {code.length === 6 && (
        <>
          <WhatTheySee name={name} />
          <Consent name={name} checked={consent} onChange={setConsent} />
        </>
      )}
      {error && <p className="notice warn">{error}</p>}
      <div className="button-row">
        <button className="primary-btn" disabled={busy || code.length !== 6 || !consent} onClick={() => void send()}>
          {busy ? 'Asking…' : 'Ask to join'}
        </button>
        {onCancel && (
          <button className="ghost-btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
