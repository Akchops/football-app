import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PLAYER_STATUS_LABEL, ROLE_BLURB, ROLE_LABEL, VERIFICATION_LABEL, describeAcademyError, type PlayerStatus, type StaffInvite,
  type StaffRole, type Verification,
} from '../../lib/academy';
import { useAcademy } from '../../store/AcademyProvider';

/** Shown wherever an academy's name is, so nobody mistakes an unchecked one for a checked one. */
export function VerificationBadge({ status }: { status: Verification }) {
  return (
    <span className={`badge verify-${status}`} title={status === 'verified' ? 'Checked by Matchday' : undefined}>
      {status === 'verified' ? '✓ ' : ''}
      {VERIFICATION_LABEL[status]}
    </span>
  );
}

export function RoleChip({ role }: { role: StaffRole }) {
  return <span className={`role-chip role-${role}`}>{ROLE_LABEL[role]}</span>;
}

/** Where a player stands with the academy: linked, invited, asking, a name with no app. */
export function StatusChip({ status }: { status: PlayerStatus }) {
  return <span className={`status-chip status-${status}`}>{PLAYER_STATUS_LABEL[status]}</span>;
}

/** The academy's logo, or its initials on a plain tile when it has none. */
export function AcademyLogo({ name, logo, size = 44 }: { name: string; logo: string; size?: number }) {
  const initials =
    name
      .split(/\s+/)
      .filter((w) => /^[A-Za-z0-9]/.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '?';
  return logo ? (
    <img className="academy-logo" src={logo} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className="academy-logo initials" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials}
    </span>
  );
}

/**
 * Loads something from the server for a screen, and again on reload(). An
 * answer that arrives after the screen has moved on is dropped.
 */
export function useLoad<T>(load: (() => Promise<T>) | null, key: string): {
  data: T | null;
  error: string;
  loading: boolean;
  reload: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const turn = useRef(0);

  const reload = useCallback(async () => {
    const run = loadRef.current;
    if (!run) return;
    const mine = ++turn.current;
    setLoading(true);
    try {
      const value = await run();
      if (turn.current !== mine) return;
      setData(value);
      setError('');
    } catch (e) {
      if (turn.current !== mine) return;
      setError(describeAcademyError(e));
    } finally {
      if (turn.current === mine) setLoading(false);
    }
  }, []);

  const ready = load !== null;
  useEffect(() => {
    setData(null);
    setError('');
    if (ready) void reload();
    return () => {
      turn.current += 1;
    };
  }, [key, ready, reload]);

  return { data, error, loading, reload };
}

/** A staff invite addressed to the person holding the phone, to say yes or no to. */
export function StaffInviteCard({ invite, onJoined }: { invite: StaffInvite; onJoined?: (academyId: string) => void }) {
  const academy = useAcademy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const answer = async (accept: boolean) => {
    if (!academy.api) return;
    setBusy(true);
    setError('');
    try {
      await academy.api.answerStaffInvite(invite.id, accept);
      await academy.refresh();
      if (accept) {
        academy.choose(invite.academyId);
        onJoined?.(invite.academyId);
      }
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
        {invite.invitedBy ? <>@{invite.invitedBy} wants</> : 'They want'} you on the staff
        {invite.town ? ` in ${invite.town}` : ''} as {invite.role === 'admin' ? 'an' : 'a'}{' '}
        <strong>{ROLE_LABEL[invite.role]}</strong>.
      </p>
      <p className="muted small">{ROLE_BLURB[invite.role]}</p>
      {invite.verification !== 'verified' && (
        <p className="muted small">Matchday hasn&apos;t checked this academy yet. Only say yes if you know who sent it.</p>
      )}
      {error && <p className="notice warn">{error}</p>}
      <div className="button-row">
        <button className="primary-btn" disabled={busy} onClick={() => void answer(true)}>
          Accept
        </button>
        <button className="ghost-btn" disabled={busy} onClick={() => void answer(false)}>
          Decline
        </button>
      </div>
    </div>
  );
}

/** What the big + asked for, handed to the screen that does it. `n` makes asking twice count twice. */
export type AddWhat = 'player' | 'squad' | 'competition' | 'staff' | 'pick';
export interface AddRequest {
  what: AddWhat;
  n: number;
}

// Requests already acted on, so coming back to a screen later doesn't act on an old one again.
const handled = new Set<number>();

/** Runs `run` once for each new request of this kind - when the screen opens on it, or while it's showing. */
export function useAddRequest(request: AddRequest | null | undefined, what: AddWhat, run: () => void, ready = true): void {
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!ready || !request || request.what !== what || handled.has(request.n)) return;
    handled.add(request.n);
    runRef.current();
  }, [request, what, ready]);
}

/** A person as a round tile of their initials, coloured from their name, as Contacts does. */
export function Initials({ name, size = 36 }: { name: string; size?: number }) {
  const clean = name.replace(/^@/, '');
  const parts = clean.split(/[\s_.-]+/).filter(Boolean);
  const letters = (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)).toUpperCase() || '?';
  let hash = 0;
  for (const ch of clean) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return (
    <span
      className="initials-tile"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(180deg, hsl(${hue} 45% 62%), hsl(${hue} 42% 46%))`,
      }}
    >
      {letters}
    </span>
  );
}
