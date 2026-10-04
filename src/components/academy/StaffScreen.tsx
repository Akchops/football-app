import { useState } from 'react';
import {
  ROLE_BLURB, ROLE_LABEL, can, canRemove, cleanUsername, describeAcademyError, rolesToGive, usernameProblem,
  type StaffAcademy, type StaffMember, type StaffRole,
} from '../../lib/academy';
import { useAcademy } from '../../store/AcademyProvider';
import { Field, Section, Sheet } from '../ui';
import { RoleChip, useLoad } from './parts';

const ROLE_ORDER: StaffRole[] = ['owner', 'manager', 'coach', 'admin'];

/** Who works at the academy, who has been asked to, and asking someone new. */
export function StaffScreen({ academy }: { academy: StaffAcademy }) {
  const { api, refresh } = useAcademy();
  const staff = useLoad(api ? () => api.staff(academy.id) : null, academy.id);
  const pending = useLoad(api ? () => api.pendingStaff(academy.id) : null, academy.id);
  const [managing, setManaging] = useState<StaffMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const me = academy.role;
  const reload = async () => {
    await Promise.all([staff.reload(), pending.reload()]);
  };

  const cancel = async (inviteId: string) => {
    if (!api) return;
    setBusy(true);
    setError('');
    try {
      await api.cancelStaffInvite(inviteId);
    } catch (e) {
      setError(describeAcademyError(e));
    }
    await pending.reload();
    setBusy(false);
  };

  const manageable = (m: StaffMember) =>
    !m.isMe && (rolesToGive(me, m.role).length > 0 || canRemove(me, m.role, false) || (can(me, 'hand-over') && m.role !== 'owner'));

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Staff</h1>
      </div>

      {(staff.error || pending.error) && (
        <div className="detail-block">
          <p className="notice warn">{staff.error || pending.error}</p>
          <div className="button-row">
            <button className="ghost-btn" onClick={() => void reload()}>
              Try again
            </button>
          </div>
        </div>
      )}

      <Section title={staff.data ? `On the staff · ${staff.data.length}` : 'On the staff'}>
        {!staff.data && !staff.error && <p className="muted small">Loading…</p>}
        {staff.data && (
          <ul className="staff-list">
            {staff.data.map((m) => (
              <li key={m.userId}>
                <span className="staff-name">
                  <strong>@{m.username || 'no username yet'}</strong>
                  {m.isMe && <span className="muted small"> (you)</span>}
                </span>
                <RoleChip role={m.role} />
                {manageable(m) && (
                  <button className="link-btn" onClick={() => setManaging(m)} aria-label={`Manage @${m.username}`}>
                    Manage
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {pending.data && pending.data.length > 0 && (
        <Section title="Invited, waiting for a yes">
          {error && <p className="notice warn">{error}</p>}
          <ul className="staff-list">
            {pending.data.map((p) => (
              <li key={p.id}>
                <span className="staff-name">
                  <strong>@{p.username}</strong>
                  <span className="muted small">
                    {' '}
                    as {ROLE_LABEL[p.role]}
                    {p.invitedBy ? ` · asked by @${p.invitedBy}` : ''}
                  </span>
                </span>
                {can(me, 'invite-staff') && (
                  <button className="link-btn" disabled={busy} onClick={() => void cancel(p.id)}>
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {can(me, 'invite-staff') && <InviteStaff academy={academy} onInvited={() => void pending.reload()} />}

      <Section title="Who can do what">
        <ul className="role-guide">
          {ROLE_ORDER.map((role) => (
            <li key={role}>
              <RoleChip role={role} />
              <span className="small">{ROLE_BLURB[role]}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">
          Coaches see only the squads they&apos;re given. Player stats come from each player&apos;s own Matchday, and only
          once their family has said yes.
        </p>
      </Section>

      <ManageStaffSheet
        academy={academy}
        member={managing}
        onClose={() => setManaging(null)}
        onChanged={async () => {
          setManaging(null);
          await reload();
          // Handing over changes what this person can do; the rest of the area follows.
          await refresh();
        }}
      />
    </div>
  );
}

function InviteStaff({ academy, onInvited }: { academy: StaffAcademy; onInvited: () => void }) {
  const { api } = useAcademy();
  const roles = rolesToGive(academy.role, null);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<StaffRole>('coach');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const name = cleanUsername(username);
  const send = async () => {
    setError('');
    setNote('');
    const problem = usernameProblem(name);
    if (problem) return setError(name ? `@${name} can't be anyone's username - ${problem.toLowerCase()}.` : 'Type their username.');
    if (!api) return;
    setBusy(true);
    try {
      await api.inviteStaff(academy.id, name, role);
      setUsername('');
      setNote(
        `Invited @${name} as ${role === 'admin' ? 'an' : 'a'} ${ROLE_LABEL[role]}. They say yes in their Matchday: under Setup → Academies, or straight away if they're new and pick "An academy".`,
      );
      onInvited();
    } catch (e) {
      setError(describeAcademyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Invite staff">
      <Field label="Their username" hint="They pick it when they first sign in. Ask them for it.">
        <span className="username-input">
          <span className="at" aria-hidden="true">
            @
          </span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && !busy && void send()}
            placeholder="their_username"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            maxLength={21}
          />
        </span>
      </Field>
      <Field group label="As">
        <div className="chip-wrap">
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              className={r === role ? 'filter-chip on' : 'filter-chip'}
              aria-pressed={r === role}
              onClick={() => setRole(r)}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        <span className="field-hint">{ROLE_BLURB[role]}</span>
      </Field>
      {error && <p className="notice warn">{error}</p>}
      {note && <p className="notice">{note}</p>}
      <div className="button-row">
        <button className="primary-btn" disabled={busy || !name} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send invite'}
        </button>
      </div>
    </Section>
  );
}

function ManageStaffSheet({
  academy,
  member,
  onClose,
  onChanged,
}: {
  academy: StaffAcademy;
  member: StaffMember | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { api } = useAcademy();
  const [role, setRole] = useState<StaffRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shownFor, setShownFor] = useState<string | null>(null);

  // A different person, or the same one again: start from their current role.
  if (member && shownFor !== member.userId) {
    setShownFor(member.userId);
    setRole(member.role);
    setError('');
  } else if (!member && shownFor !== null) {
    setShownFor(null);
  }

  if (!member) return null;
  const me = academy.role;
  const roles = rolesToGive(me, member.role);
  const name = `@${member.username || 'them'}`;

  const run = async (work: () => Promise<void>) => {
    if (!api) return;
    setBusy(true);
    setError('');
    try {
      await work();
      await onChanged();
    } catch (e) {
      setError(describeAcademyError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveRole = () => role && role !== member.role && run(() => api!.setStaffRole(academy.id, member.userId, role));
  const remove = () => {
    if (confirm(`Take ${name} off the staff at ${academy.name}? They lose access straight away.`)) {
      void run(() => api!.removeStaff(academy.id, member.userId));
    }
  };
  const handOver = () => {
    if (
      confirm(
        `Make ${name} the owner of ${academy.name}? You'll stay on as a manager, and only they can hand it back or delete the academy.`,
      )
    ) {
      void run(() => api!.transferOwnership(academy.id, member.userId));
    }
  };

  return (
    <Sheet open title={name} subtitle={`${ROLE_LABEL[member.role]} at ${academy.name}`} onClose={onClose}>
      {roles.length > 0 && (
        <Field group label="Role">
          <div className="chip-wrap">
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                className={r === role ? 'filter-chip on' : 'filter-chip'}
                aria-pressed={r === role}
                onClick={() => setRole(r)}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          {role && <span className="field-hint">{ROLE_BLURB[role]}</span>}
        </Field>
      )}
      {roles.length > 0 && (
        <div className="button-row">
          <button className="primary-btn" disabled={busy || role === member.role} onClick={() => void saveRole()}>
            Save role
          </button>
        </div>
      )}
      {error && <p className="notice warn">{error}</p>}
      <div className="sheet-actions">
        {canRemove(me, member.role, false) && (
          <button className="danger-link" disabled={busy} onClick={remove}>
            Take {name} off the staff
          </button>
        )}
        {can(me, 'hand-over') && member.role !== 'owner' && (
          <button className="link-btn" disabled={busy} onClick={handOver}>
            Make {name} the owner
          </button>
        )}
      </div>
    </Sheet>
  );
}
