import { useEffect, useRef, useState } from 'react';
import { ACADEMY } from '../lib/features';
import { proxyAvailable } from '../lib/proxy';
import { pushStatus } from '../lib/push';
import { countdown } from '../lib/status';
import { useAcademy } from '../store/AcademyProvider';
import { useStatus, type StatusValue } from '../store/StatusProvider';
import { useSync } from '../store/SyncProvider';
import { AlertIcon, CheckIcon, ChevronIcon, InfoIcon, PauseIcon } from './icons';
import { Sheet } from './ui';

/**
 * The strip at the top that says something's wrong, before anyone has to
 * wonder. Tapping it says what still works, that nothing is lost, and when the
 * app looks again - so nobody needs to keep refreshing or reinstalling to find
 * out. With nothing wrong and no message from Matchday, there is no strip.
 */
export function StatusBanner() {
  const status = useStatus();
  const signedIn = Boolean(useSync().account);
  const [open, setOpen] = useState(false);
  const back = useBack(status);

  const outage = status.health === 'outage';
  const notice = status.notice && (outage || !status.noticeSeen) ? status.notice : null;
  const showing = outage || notice !== null;

  // Put away once it's over, so it isn't left open saying things that are no longer true.
  useEffect(() => {
    if (!showing) setOpen(false);
  }, [showing]);

  return (
    <>
      {showing && (
        <button
          className={outage ? 'status-banner down' : 'status-banner'}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          <span className="status-banner-icon">{outage ? <AlertIcon /> : <InfoIcon />}</span>
          <span className="status-banner-text">
            <strong>{notice?.title || (outage ? "Some things aren't working right now" : 'A note from Matchday')}</strong>
            <span>
              {status.drill && <span className="status-drill-tag">Drill</span>}
              {outage ? (signedIn ? 'Your data is safe · Tap for details' : 'Tap for details') : firstLine(notice?.message ?? '')}
            </span>
          </span>
          <span className="status-banner-chevron">
            <ChevronIcon />
          </span>
        </button>
      )}
      {back && !showing && (
        <div className="toast" role="status">
          Matchday&apos;s server is back - catching up now
        </div>
      )}
      <StatusSheet open={open && showing} status={status} onClose={() => setOpen(false)} />
    </>
  );
}

function firstLine(text: string): string {
  const line = text.split('\n')[0];
  return line.length > 90 ? `${line.slice(0, 88).trimEnd()}…` : line;
}

/** A few seconds of "it's back" when an outage ends - the drill's included. */
function useBack(status: StatusValue): boolean {
  const [back, setBack] = useState(false);
  const before = useRef(status.health);
  useEffect(() => {
    const was = before.current;
    before.current = status.health;
    if (was === 'outage' && status.health === 'ok') {
      setBack(true);
      const timer = setTimeout(() => setBack(false), 4_000);
      return () => clearTimeout(timer);
    }
  }, [status.health]);
  return back;
}

function StatusSheet({ open, status, onClose }: { open: boolean; status: StatusValue; onClose: () => void }) {
  const outage = status.health === 'outage';
  const notice = status.notice;
  return (
    <Sheet
      open={open}
      title={status.drill ? 'Outage drill' : outage ? "Matchday's server isn't answering" : notice?.title || 'A note from Matchday'}
      subtitle={status.drill ? 'This is what everyone would see' : undefined}
      onClose={onClose}
      footer={
        status.drill ? (
          <button className="primary-btn wide" onClick={() => status.setDrill(false)}>
            End the drill
          </button>
        ) : !outage ? (
          <button
            className="primary-btn wide"
            onClick={() => {
              status.dismissNotice();
              onClose();
            }}
          >
            Got it
          </button>
        ) : undefined
      }
    >
      {notice && (
        <div className="status-notice">
          {outage && notice.title && <strong>{notice.title}</strong>}
          {notice.message && <p>{notice.message}</p>}
          <span className="muted small">From Matchday{notice.postedAt ? ` · ${posted(notice.postedAt)}` : ''}</span>
        </div>
      )}
      {outage && <OutageDetails status={status} />}
    </Sheet>
  );
}

function posted(iso: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return at.toDateString() === new Date().toDateString()
    ? `posted at ${time}`
    : `posted ${at.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

function OutageDetails({ status }: { status: StatusValue }) {
  const sync = useSync();
  const academy = useAcademy();
  const signedIn = Boolean(sync.account);
  // Counted when the sheet opens and whenever a sync settles, not every second.
  const [waiting, setWaiting] = useState(() => sync.waiting());
  const { waiting: count, status: syncStatus } = sync;
  useEffect(() => setWaiting(count()), [count, syncStatus]);

  const working = [
    'Calendar, matches and results',
    'Training, stats and Wrapped',
    'Clips and photos',
    ...(proxyAvailable() ? ['Coach'] : []),
    ...(pushStatus() === 'on' ? ['Match reminders'] : []),
  ];
  const paused = [
    ...(signedIn ? ["Syncing with your family's phones"] : []),
    signedIn ? 'Signing in on another phone' : 'Signing in',
    ...(signedIn ? ['Inviting family'] : []),
    ...(ACADEMY && academy.enabled && academy.loaded ? ['Academy changes - you can still look at what this phone last saw'] : []),
  ];

  return (
    <>
      <div className="status-safe">
        <strong>Your data is safe</strong>
        <p>
          {signedIn
            ? `Everything you add or change is saved on this phone first, as always. ${
                waiting === 0
                  ? 'Nothing is waiting - your account has everything up to now.'
                  : `${waiting} change${waiting === 1 ? ' is' : 's are'} waiting, and will sync by ${waiting === 1 ? 'itself' : 'themselves'} once the server is back.`
              }`
            : 'Everything on this phone stays on this phone. Once the server is back, signing in saves it all to your account.'}
        </p>
      </div>

      <div className="status-lists">
        <div>
          <h3>Still working</h3>
          <ul className="status-list ok">
            {working.map((item) => (
              <li key={item}>
                <CheckIcon />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Paused until it&apos;s back</h3>
          <ul className="status-list paused">
            {paused.map((item) => (
              <li key={item}>
                <PauseIcon />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <NextCheck status={status} />
    </>
  );
}

function NextCheck({ status }: { status: StatusValue }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const due = status.nextCheckAt;
  return (
    <div className="status-check">
      <p>
        <strong>
          {status.checking || due === null ? 'Checking now…' : `Checking again in ${countdown(due - now)}`}
        </strong>
        <span className="muted small"> · every 30 seconds</span>
      </p>
      <p className="muted small">
        No need to refresh, close or reinstall the app - it notices by itself when the server is back, and catches up.
      </p>
    </div>
  );
}
