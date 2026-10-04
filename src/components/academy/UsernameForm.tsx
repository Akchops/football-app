import { useEffect, useState } from 'react';
import { cleanUsername, describeAcademyError, usernameProblem } from '../../lib/academy';
import { useAcademy } from '../../store/AcademyProvider';

type Check = { name: string; state: 'checking' | 'free' | 'taken' | 'unknown' };

/**
 * Picking a username, or changing it. Says whether it is free while it is
 * typed, so "That username's taken" comes before pressing anything.
 */
export function UsernameForm({
  label = 'Username',
  submitLabel = 'Save username',
  autoFocus = false,
  onSaved,
  onCancel,
}: {
  label?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  onSaved?: (name: string) => void;
  onCancel?: () => void;
}) {
  const academy = useAcademy();
  const current = academy.username;
  const [value, setValue] = useState(current ?? '');
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const name = cleanUsername(value);
  const problem = name ? usernameProblem(name) : null;
  const unchanged = current !== null && name === current;
  const api = academy.api;

  useEffect(() => {
    if (!api || !name || problem || unchanged) {
      setCheck(null);
      return;
    }
    let live = true;
    setCheck({ name, state: 'checking' });
    const timer = window.setTimeout(() => {
      api.usernameAvailable(name).then(
        (free) => live && setCheck({ name, state: free ? 'free' : 'taken' }),
        () => live && setCheck({ name, state: 'unknown' }),
      );
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [api, name, problem, unchanged]);

  const state = check?.name === name ? check.state : null;
  const blocked = !api || !name || Boolean(problem) || unchanged || state === 'taken' || busy;

  const save = async () => {
    if (blocked || !api) return;
    setBusy(true);
    setError('');
    try {
      const saved = await api.claimUsername(name);
      academy.setUsername(saved);
      onSaved?.(saved);
    } catch (e) {
      setError(describeAcademyError(e));
    } finally {
      setBusy(false);
    }
  };

  let hint: { text: string; tone: '' | 'good' | 'bad' } = { text: '3 to 20 letters, numbers or _', tone: '' };
  if (problem) hint = { text: problem, tone: 'bad' };
  else if (unchanged) hint = { text: "That's yours already", tone: '' };
  else if (state === 'checking') hint = { text: 'Checking…', tone: '' };
  else if (state === 'free') hint = { text: `@${name} is free`, tone: 'good' };
  else if (state === 'taken') hint = { text: "That username's taken - try another", tone: 'bad' };
  else if (state === 'unknown') hint = { text: "Couldn't check just now - you can still try saving", tone: '' };

  return (
    <div className="detail-block">
      <label className="field">
        <span className="field-label">{label}</span>
        <span className="username-input">
          <span className="at" aria-hidden="true">
            @
          </span>
          <input
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\s+/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            placeholder="e.g. riverside_coach"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            maxLength={21}
            autoFocus={autoFocus}
            aria-describedby="username-hint"
          />
        </span>
        <span id="username-hint" className={hint.tone ? `field-hint ${hint.tone}` : 'field-hint'} role="status">
          {hint.text}
        </span>
      </label>
      {error && <p className="notice warn">{error}</p>}
      <div className="button-row">
        <button className="primary-btn" disabled={blocked} onClick={() => void save()}>
          {busy ? 'Saving…' : submitLabel}
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
