import { useState } from 'react';
import { useStore } from '../store/AppStore';
import {
  pushStatus, reminderPrefs, sendTestReminder, setReminderPrefs, turnOffReminders, turnOnReminders, type PushStatus,
} from '../lib/push';
import type { ReminderPrefs } from '../lib/reminders';
import { Section } from './ui';

/** Setup's switch for match reminders on this phone. Hidden in a build with no server to send them. */
export function ReminderSettings() {
  const { matches, competitions } = useStore();
  const [status, setStatus] = useState<PushStatus>(() => pushStatus());
  const [prefs, setPrefs] = useState<ReminderPrefs>(() => reminderPrefs());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (status === 'no-server') return null;

  const data = { matches, competitions };
  const run = async (work: () => Promise<void>, done?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      if (done) setMessage({ ok: true, text: done });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'That didn’t work - try again.' });
    } finally {
      setBusy(false);
      setStatus(pushStatus());
    }
  };
  const change = (next: ReminderPrefs) => {
    setPrefs(next);
    void run(() => setReminderPrefs(next, data));
  };

  return (
    <Section title="Match reminders">
      {status === 'needs-install' && (
        <p className="muted small">
          On iPhone, reminders work once Matchday is on your Home Screen. In Safari, tap Share → Add to Home Screen,
          open it from there, then turn them on here.
        </p>
      )}
      {status === 'unsupported' && (
        <p className="muted small">
          This browser can’t show reminders from a web app. Chrome on Android can, and so can an iPhone with Matchday
          on its Home Screen.
        </p>
      )}
      {status === 'blocked' && (
        <p className="muted small">
          Notifications are blocked for Matchday on this phone. Allow them in the phone’s settings, then come back here.
        </p>
      )}
      {status === 'off' && (
        <>
          <p className="muted small">
            A reminder the evening before each match, and one after full time to log the result. Each phone that should
            get them turns them on itself.
          </p>
          <div className="button-row">
            <button
              className="primary-btn"
              disabled={busy}
              onClick={() => void run(() => turnOnReminders(data), 'Reminders are on for this phone.')}
            >
              {busy ? 'Turning on…' : '🔔 Turn on reminders'}
            </button>
          </div>
        </>
      )}
      {status === 'on' && (
        <>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={prefs.dayBefore}
              disabled={busy}
              onChange={(e) => change({ ...prefs, dayBefore: e.target.checked })}
            />
            <span>The evening before, at 6 pm - who, when and where</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={prefs.results}
              disabled={busy}
              onChange={(e) => change({ ...prefs, results: e.target.checked })}
            />
            <span>After the match, to log the result</span>
          </label>
          <div className="button-row">
            <button
              className="ghost-btn"
              disabled={busy}
              onClick={() => void run(sendTestReminder, 'Sent - it should arrive in a few seconds.')}
            >
              Send a test
            </button>
            <button
              className="ghost-btn"
              disabled={busy}
              onClick={() => void run(turnOffReminders, 'Reminders are off for this phone.')}
            >
              Turn off
            </button>
          </div>
        </>
      )}
      {message && <p className={message.ok ? 'notice' : 'form-error'}>{message.text}</p>}
      {(status === 'on' || status === 'off') && (
        <p className="muted small">
          To send them, the Matchday server keeps the times, opponents and grounds of your next few matches, and
          deletes each reminder once it’s sent.
        </p>
      )}
    </Section>
  );
}
