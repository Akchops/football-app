import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { childOnly, useAgeGate } from '../lib/ageGate';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'motion/react';
import { useStore } from '../store/AppStore';
import {
  ProxyLimitError, analyseClipBlob, coachReady, costNote, describeError, requestDrills,
  usingSharedCoach, type ClipAnalysis, type DrillPlan,
} from '../lib/ai';
import { getProvider } from '../lib/apiKey';
import { ClipTooLongError, MAX_CLIP_SECONDS } from '../lib/frames';
import { scoreBand, scoreVerdict } from '../lib/score';
import { getMediaBlob, listAllMedia, type MediaMeta } from '../store/media';
import { formatDateShort } from '../lib/date';
import { springs } from '../lib/motion';
import { Field, Sheet } from './ui';
import { CoachIcon, ComposeIcon, FilmIcon, SendIcon } from './icons';

/**
 * The coach, as a conversation: ask for a session and a plan comes back as a
 * message; send a clip and the coach watches it and replies. The thread is
 * kept on this phone so last week's drills are still there to scroll back to.
 */

const SUGGESTIONS: Record<string, string[]> = {
  goalkeeper: ['Improve my diving', 'Better footwork across the goal', 'Handling crosses', 'Distribution with both feet'],
  defender: ['Defending 1v1', 'Heading and aerial duels', 'Jockeying and body shape', 'Playing out from the back'],
  midfielder: ['Turning under pressure', 'Passing range', 'Scanning before I receive', 'Box-to-box fitness'],
  forward: ['Finishing under pressure', 'First touch in the box', 'Beating a defender 1v1', 'Movement off the shoulder'],
};

type Message =
  | { id: string; at: string; from: 'me'; kind: 'text'; text: string }
  | { id: string; at: string; from: 'me'; kind: 'clip'; name: string; thumbnail?: string; player: string; context: string }
  | { id: string; at: string; from: 'coach'; kind: 'plan'; plan: DrillPlan }
  | { id: string; at: string; from: 'coach'; kind: 'analysis'; analysis: ClipAnalysis; note: string }
  | { id: string; at: string; from: 'coach'; kind: 'error'; text: string; outOfAllowance: boolean };

type NewMessage = Message extends infer T ? (T extends Message ? Omit<T, 'id' | 'at'> : never) : never;

// ---------------------------------------------------------------- the thread, kept on this phone

const THREAD_KEY = 'matchday.coach.v1';
const PLAYER_KEY = 'matchday.coach.player.v1';
const KEEP = 40;

let thread: Message[] = load();
const listeners = new Set<() => void>();

function load(): Message[] {
  try {
    const raw = localStorage.getItem(THREAD_KEY);
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch {
    return [];
  }
}

function save(next: Message[]): void {
  thread = next.slice(-KEEP);
  try {
    localStorage.setItem(THREAD_KEY, JSON.stringify(thread));
  } catch {
    // A full phone: the thread lives until the app closes.
  }
  listeners.forEach((l) => l());
}

function post(message: NewMessage): void {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  save([...thread, { ...message, id, at: new Date().toISOString() } as Message]);
}

function useThread(): Message[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => thread,
  );
}

function storedPlayer(): string {
  try {
    return localStorage.getItem(PLAYER_KEY) ?? '';
  } catch {
    return '';
  }
}

// What the coach is busy with survives switching tabs, like the thread does.
let pending: { label: string } | null = null;
const pendingListeners = new Set<() => void>();
function setPending(next: { label: string } | null) {
  pending = next;
  pendingListeners.forEach((l) => l());
}
function usePending() {
  return useSyncExternalStore(
    (l) => {
      pendingListeners.add(l);
      return () => pendingListeners.delete(l);
    },
    () => pending,
  );
}

// ---------------------------------------------------------------- screen

export default function AIScreen({ onOpenSetup }: { onOpenSetup: () => void }) {
  const gate = useAgeGate();
  if (childOnly(gate)) {
    return (
      <div className="screen">
        <div className="screen-head">
          <h1>Coach</h1>
        </div>
        <div className="coach-off">
          <span className="coach-avatar big" aria-hidden="true">
            <CoachIcon on />
          </span>
          <h2>Ask a parent or guardian</h2>
          <p>
            The coach sends what you ask, and any clip you pick, to an AI service to read - so for anyone under 18, a
            parent or guardian signs in first. They can do that in Setup, under Sharing with your family.
          </p>
          <button className="primary-btn" onClick={onOpenSetup}>
            Go to Setup
          </button>
        </div>
      </div>
    );
  }
  if (!coachReady()) {
    return (
      <div className="screen">
        <div className="screen-head">
          <h1>Coach</h1>
        </div>
        <div className="coach-off">
          <span className="coach-avatar big" aria-hidden="true">
            <CoachIcon on />
          </span>
          <h2>Switch the coach on</h2>
          <p>
            The coach writes training sessions and watches your match clips. This build has no shared coach, so it needs
            your own API key, added once in Setup and kept on this phone. It's the only part of the app that uses the
            internet.
          </p>
          <button className="primary-btn" onClick={onOpenSetup}>
            Go to Setup
          </button>
          <p className="muted small">Gemini has a free tier: get a key at aistudio.google.com/apikey.</p>
        </div>
      </div>
    );
  }
  return <Chat />;
}

function Chat() {
  const { profile, matches } = useStore();
  const messages = useThread();
  const busy = usePending();
  const [draft, setDraft] = useState('');
  const [clipOpen, setClipOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const suggestions = SUGGESTIONS[profile.positionGroup] ?? SUGGESTIONS.midfielder;
  const shared = usingSharedCoach();

  // Keep the newest message in view, as Messages does: jump on opening, glide after.
  useLayoutEffect(() => {
    const scroller = rootRef.current?.closest('.content');
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: first.current ? 'auto' : 'smooth' });
    first.current = false;
  }, [messages.length, busy]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setDraft('');
    post({ from: 'me', kind: 'text', text });
    setPending({ label: 'Writing your session' });
    try {
      post({ from: 'coach', kind: 'plan', plan: await requestDrills(profile, text) });
    } catch (e) {
      post({ from: 'coach', kind: 'error', text: await describeError(e), outOfAllowance: e instanceof ProxyLimitError });
    } finally {
      setPending(null);
    }
  };

  const sendClip = async (clip: { blob: Blob; name: string; thumbnail?: string }, player: string, context: string) => {
    setClipOpen(false);
    post({ from: 'me', kind: 'clip', name: clip.name, thumbnail: clip.thumbnail, player, context });
    setPending({ label: 'Reading the clip' });
    try {
      const outcome = await analyseClipBlob(profile, clip.blob, player, context, (label) =>
        setPending({ label: label.replace(/…$/, '') }),
      );
      post({ from: 'coach', kind: 'analysis', analysis: outcome.analysis, note: costNote(outcome.mode, outcome.frameCount) });
    } catch (e) {
      const text =
        e instanceof ClipTooLongError
          ? `That clip is ${Math.round(e.seconds)} seconds. I can watch up to ${MAX_CLIP_SECONDS} seconds, so trim it to the bit you want me to look at.`
          : await describeError(e);
      post({ from: 'coach', kind: 'error', text, outOfAllowance: e instanceof ProxyLimitError });
    } finally {
      setPending(null);
    }
  };

  const name = profile.name?.split(' ')[0];

  return (
    <div className="screen coach-screen" ref={rootRef}>
      <div className="screen-head">
        <h1>Coach</h1>
        {messages.length > 0 && (
          <button
            className="toolbar-btn"
            aria-label="New conversation"
            disabled={Boolean(busy)}
            onClick={() => {
              save([]);
              setDraft('');
            }}
          >
            <ComposeIcon />
          </button>
        )}
      </div>

      <div className="thread" role="log" aria-live="polite" aria-label="Conversation with the coach">
        <p className="thread-note">
          The coach is an AI. Treat it as a second opinion, not a replacement for {profile.ageGroup ? 'your coach' : 'a coach'}.
          {shared && ' It is shared, so there is a daily limit.'}
        </p>

        <Bubble from="coach" still>
          <p>
            {name ? `Hi ${name}. ` : 'Hi. '}Tell me what you want to work on and I'll write you a session, or send me a clip
            and I'll watch it.
          </p>
        </Bubble>

        {messages.map((msg, i) => (
          <MessageView key={msg.id} message={msg} showTime={i === 0 || gapBetween(messages[i - 1], msg)} />
        ))}

        <AnimatePresence>
          {busy && (
            <Bubble key="typing" from="coach" typing>
              <span className="typing" aria-label={`${busy.label}…`}>
                <span />
                <span />
                <span />
              </span>
              <span className="typing-label">{busy.label}</span>
            </Bubble>
          )}
        </AnimatePresence>
      </div>

      {!busy && (
        <div className="suggest-row chip-scroll" aria-label="Ideas">
          {suggestions.map((s, i) => (
            <m.button
              key={s}
              className="suggest-chip"
              onClick={() => void ask(s)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springs.snappy, delay: i * 0.04 }}
            >
              {s}
            </m.button>
          ))}
        </div>
      )}

      <div className="composer-spacer" aria-hidden="true" />

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => void ask(draft)}
        onClip={() => setClipOpen(true)}
        busy={Boolean(busy)}
      />

      <ClipSheet
        open={clipOpen}
        matchCount={matches.length}
        onClose={() => setClipOpen(false)}
        onSend={(clip, player, context) => void sendClip(clip, player, context)}
      />
    </div>
  );
}

/** A new timestamp when more than an hour passes between messages. */
function gapBetween(a: Message, b: Message): boolean {
  return new Date(b.at).getTime() - new Date(a.at).getTime() > 60 * 60 * 1000;
}

function stamp(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return today ? `Today ${time}` : `${formatDateShort(iso.slice(0, 10))} ${time}`;
}

// ---------------------------------------------------------------- bubbles

function Bubble({
  from,
  children,
  wide,
  still,
  typing,
}: {
  from: 'me' | 'coach';
  children: React.ReactNode;
  wide?: boolean;
  still?: boolean;
  typing?: boolean;
}) {
  // A message pops up from its own side, with a little give - Messages' arrival.
  return (
    <m.div
      className={`bubble-row ${from}`}
      initial={still ? false : { opacity: 0, y: 14, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
      transition={springs.bouncy}
      style={{ transformOrigin: from === 'me' ? '100% 100%' : '0% 100%' }}
      layout={typing ? 'position' : undefined}
    >
      {from === 'coach' && (
        <span className="coach-avatar" aria-hidden="true">
          <CoachIcon on />
        </span>
      )}
      <div className={`bubble ${from}${wide ? ' wide' : ''}${typing ? ' is-typing' : ''}`}>{children}</div>
    </m.div>
  );
}

function MessageView({ message, showTime }: { message: Message; showTime: boolean }) {
  return (
    <>
      {showTime && <p className="thread-time">{stamp(message.at)}</p>}
      {message.kind === 'text' && (
        <Bubble from="me">
          <p>{message.text}</p>
        </Bubble>
      )}
      {message.kind === 'clip' && (
        <Bubble from="me">
          <span className="bubble-clip">
            {message.thumbnail ? <img src={message.thumbnail} alt="" /> : <span className="bubble-clip-fallback"><FilmIcon /></span>}
            <span className="bubble-clip-play" aria-hidden="true" />
          </span>
          <p>
            Watch me: {message.player}
            {message.context && `. ${message.context}`}
          </p>
        </Bubble>
      )}
      {message.kind === 'plan' && (
        <Bubble from="coach" wide>
          <PlanView plan={message.plan} />
        </Bubble>
      )}
      {message.kind === 'analysis' && (
        <Bubble from="coach" wide>
          <AnalysisView analysis={message.analysis} />
          {message.note && <p className="bubble-foot">{message.note}</p>}
        </Bubble>
      )}
      {message.kind === 'error' && (
        <Bubble from="coach">
          <p className="bubble-error">{message.text}</p>
          {message.outOfAllowance && (
            <p className="bubble-foot">
              The shared coach has a daily limit. A free Gemini key of your own removes it: get one at
              aistudio.google.com/apikey and paste it into Setup.
            </p>
          )}
        </Bubble>
      )}
    </>
  );
}

function PlanView({ plan }: { plan: DrillPlan }) {
  return (
    <div className="plan">
      <div className="plan-head">
        <span className="plan-eyebrow">Session</span>
        <h2>{plan.title}</h2>
        <p>{plan.focus}</p>
      </div>
      {plan.kit.length > 0 && (
        <div className="plan-kit">
          {plan.kit.map((k) => (
            <span key={k} className="plan-kit-item">
              {k}
            </span>
          ))}
        </div>
      )}
      <div className="plan-part">
        <h3>Warm up</h3>
        <ol className="plan-list">
          {plan.warmup.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ol>
      </div>
      <div className="plan-part">
        <h3>Drills</h3>
        {plan.drills.map((d, i) => (
          <div key={i} className="drill">
            <div className="drill-head">
              <span className="drill-number">{i + 1}</span>
              <strong>{d.name}</strong>
              <span className="drill-reps">{d.reps}</span>
            </div>
            <p className="drill-setup">{d.setup}</p>
            <p className="drill-cue">
              <strong>Cue</strong> {d.coaching}
            </p>
          </div>
        ))}
      </div>
      <div className="plan-part">
        <h3>Make it harder</h3>
        <p>{plan.progression}</p>
      </div>
    </div>
  );
}

function AnalysisView({ analysis }: { analysis: ClipAnalysis }) {
  return (
    <div className="analysis">
      <div className={`perf-head band-${scoreBand(analysis.rating)}`}>
        <div className="perf-score">
          {analysis.rating}
          <span>/100</span>
        </div>
        <div className="perf-verdict">
          <strong>{analysis.headline}</strong>
          <span>
            {scoreVerdict(analysis.rating)} · {analysis.confidence} confidence
          </span>
        </div>
      </div>
      <p className="analysis-text">{analysis.whatHappened}</p>
      {analysis.didWell.length > 0 && (
        <div className="plan-part">
          <h3>Done well</h3>
          <ul className="plan-list good">
            {analysis.didWell.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}
      {analysis.improve.length > 0 && (
        <div className="plan-part">
          <h3>Work on</h3>
          {analysis.improve.map((item, i) => (
            <div key={i} className="drill">
              <div className="drill-head">
                <span className="drill-number">{i + 1}</span>
                <strong>{item.point}</strong>
              </div>
              <p className="drill-setup">{item.why}</p>
              <p className="drill-cue">
                <strong>Try</strong> {item.drill}
              </p>
            </div>
          ))}
        </div>
      )}
      {analysis.caveat && (
        <div className="plan-part caveat">
          <h3>What I couldn't see</h3>
          <p>{analysis.caveat}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- composer

/**
 * The text box, pinned above the tab bar like Messages'. It lives on the app
 * itself rather than in the scrolling page, so it stays put as the thread
 * scrolls, and rides up with the keyboard.
 */
function Composer({
  value,
  onChange,
  onSend,
  onClip,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onClip: () => void;
  busy: boolean;
}) {
  const [host, setHost] = useState<Element | null>(null);
  const [lift, setLift] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setHost(document.querySelector('.app')), []);

  // The keyboard: lift the box clear of it, where the browser says how tall it is.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setLift(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // Grow with the text, to a few lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  if (!host) return null;
  const ready = value.trim().length > 0 && !busy;
  return createPortal(
    <m.form
      className={lift > 80 ? 'composer over-keyboard' : 'composer'}
      style={lift > 80 ? { bottom: lift + 8 } : undefined}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.smooth}
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSend();
      }}
    >
      <button type="button" className="composer-clip" onClick={onClip} aria-label="Send a clip" disabled={busy}>
        <FilmIcon />
      </button>
      <div className="composer-field">
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (ready) onSend();
            }
          }}
          placeholder="What do you want to work on?"
          aria-label="Message the coach"
          enterKeyHint="send"
        />
        <AnimatePresence>
          {ready && (
            <m.button
              type="submit"
              className="composer-send"
              aria-label="Send"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={springs.bouncy}
            >
              <SendIcon />
            </m.button>
          )}
        </AnimatePresence>
      </div>
    </m.form>,
    host,
  );
}

// ---------------------------------------------------------------- sending a clip

function ClipSheet({
  open,
  matchCount,
  onClose,
  onSend,
}: {
  open: boolean;
  matchCount: number;
  onClose: () => void;
  onSend: (clip: { blob: Blob; name: string; thumbnail?: string }, player: string, context: string) => void;
}) {
  const { matches } = useStore();
  const [clips, setClips] = useState<MediaMeta[]>([]);
  const [selected, setSelected] = useState<MediaMeta | null>(null);
  const [uploaded, setUploaded] = useState<File | null>(null);
  const [player, setPlayer] = useState(storedPlayer);
  const [context, setContext] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    listAllMedia()
      .then((items) => setClips(items.filter((i) => i.kind === 'video')))
      .catch(() => setClips([]));
  }, [open, matchCount]);

  const matchLabel = useMemo(() => {
    if (!selected) return '';
    const match = matches.find((x) => x.id === selected.matchId);
    if (!match) return 'Not filed to a match';
    return `${match.venue === 'away' ? '@' : 'vs'} ${match.opponent} · ${formatDateShort(match.date)}`;
  }, [selected, matches]);

  const send = async () => {
    if (!player.trim()) {
      setError('Say which player you are, so I know who to watch.');
      return;
    }
    let blob: Blob | null = uploaded;
    if (!blob && selected) blob = await getMediaBlob(selected.id);
    if (!blob) {
      setError('Pick a clip first.');
      return;
    }
    try {
      localStorage.setItem(PLAYER_KEY, player.trim());
    } catch {
      // Fine: it'll just be asked again.
    }
    onSend(
      { blob, name: uploaded?.name ?? selected?.name ?? 'Clip', thumbnail: uploaded ? undefined : selected?.thumbnail ?? undefined },
      player.trim(),
      context.trim(),
    );
    setContext('');
    setSelected(null);
    setUploaded(null);
  };

  return (
    <Sheet
      open={open}
      title="Send a clip"
      subtitle="Short clips work best: one save, one passage of play"
      onClose={onClose}
      footer={
        <button className="primary-btn" onClick={() => void send()} disabled={!selected && !uploaded}>
          Send to the coach
        </button>
      }
    >
      {clips.length > 0 && (
        <Field label="Your clips">
          <div className="clip-grid">
            {clips.map((clip) => {
              const on = selected?.id === clip.id && !uploaded;
              return (
                <m.button
                  key={clip.id}
                  className={on ? 'clip-option on' : 'clip-option'}
                  aria-pressed={on}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setUploaded(null);
                    setSelected(clip);
                  }}
                >
                  {clip.thumbnail ? <img src={clip.thumbnail} alt="" /> : <span className="media-fallback"><FilmIcon /></span>}
                  <span className="clip-option-name">{clip.name}</span>
                  {on && <m.span layoutId="clip-check" className="clip-check" transition={springs.snappy} aria-hidden="true" />}
                </m.button>
              );
            })}
          </div>
        </Field>
      )}
      {selected && !uploaded && <p className="muted small">{matchLabel}</p>}

      <button className="ghost-btn" onClick={() => fileRef.current?.click()}>
        {uploaded ? `Chosen: ${uploaded.name}` : clips.length ? 'Or choose a video from this phone' : 'Choose a video from this phone'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setUploaded(file);
          setSelected(null);
        }}
      />

      <Field label="Which player are you?" hint="So the coach can pick you out">
        <input
          className="input"
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
          placeholder="e.g. the keeper in the green top, number 1"
        />
      </Field>
      <Field label="Anything to look at?" hint="Optional">
        <input
          className="input"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. my starting position for the cross"
        />
      </Field>
      {(usingSharedCoach() || getProvider() === 'gemini') && (
        <p className="muted small">The coach watches the clip itself, so movement and timing count, not just stills.</p>
      )}
      {error && <p className="form-error">{error}</p>}
    </Sheet>
  );
}
