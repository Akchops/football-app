import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/AppStore';
import {
  analyseClipBlob, costNote, describeError, requestDrills,
  type ClipAnalysis, type ClipMode, type DrillPlan,
} from '../lib/ai';
import { getProvider, hasApiKey } from '../lib/apiKey';
import { ClipTooLongError, MAX_CLIP_SECONDS } from '../lib/frames';
import { scoreBand, scoreVerdict } from '../lib/score';
import { getMediaBlob, listAllMedia, type MediaMeta } from '../store/media';
import { formatDateShort } from '../lib/date';
import { EmptyState, Field, Section } from './ui';

type Tab = 'drills' | 'clip';

const SUGGESTIONS: Record<string, string[]> = {
  goalkeeper: ['Improve my diving', 'Better footwork across the goal', 'Handling crosses', 'Distribution with both feet'],
  defender: ['Defending 1v1', 'Heading and aerial duels', 'Jockeying and body shape', 'Playing out from the back'],
  midfielder: ['Turning under pressure', 'Passing range', 'Scanning before I receive', 'Box-to-box fitness'],
  forward: ['Finishing under pressure', 'First touch in the box', 'Beating a defender 1v1', 'Movement off the shoulder'],
};

export default function AIScreen({ onOpenSetup }: { onOpenSetup: () => void }) {
  const { profile, matches } = useStore();
  const [tab, setTab] = useState<Tab>('drills');
  const keyed = hasApiKey();

  if (!keyed) {
    return (
      <div className="screen">
        <div className="screen-head">
          <h1>Coach</h1>
        </div>
        <EmptyState
          icon="🧠"
          title="Add an API key to switch the coach on"
          message="The coach writes training sessions and reads your match clips. That runs on Google's or Anthropic's servers, so it needs your own API key — added once in Setup, kept on this device, and it is the only part of the app that uses the internet."
          action={
            <button className="primary-btn" onClick={onOpenSetup}>
              Go to Setup
            </button>
          }
        />
        <p className="muted small">
          Gemini has a free tier — get a key at aistudio.google.com/apikey and it costs nothing to run.
        </p>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Coach</h1>
      </div>

      <div className="segmented">
        <button className={tab === 'drills' ? 'seg on' : 'seg'} onClick={() => setTab('drills')}>
          Drills
        </button>
        <button className={tab === 'clip' ? 'seg on' : 'seg'} onClick={() => setTab('clip')}>
          Analyse a clip
        </button>
      </div>

      {tab === 'drills' ? <DrillsPanel /> : <ClipPanel matchCount={matches.length} />}

      <p className="muted small">
        Advice comes from an AI reading what you give it. Treat it as a second opinion, not a replacement for {profile.ageGroup ? 'your coach' : 'a coach'}.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- drills

function DrillsPanel() {
  const { profile } = useStore();
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<DrillPlan | null>(null);

  const suggestions = SUGGESTIONS[profile.positionGroup] ?? SUGGESTIONS.midfielder;

  const run = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true);
    setError('');
    setPlan(null);
    try {
      setPlan(await requestDrills(profile, question.trim()));
    } catch (e) {
      setError(await describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Field label="What do you want to work on?">
        <textarea
          className="input"
          rows={2}
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="e.g. I want to improve my diving to my left"
        />
      </Field>

      <div className="chip-wrap">
        {suggestions.map((s) => (
          <button
            key={s}
            className="filter-chip"
            onClick={() => {
              setAsk(s);
              void run(s);
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <button className="primary-btn" onClick={() => void run(ask)} disabled={busy || !ask.trim()}>
        {busy ? 'Writing your session…' : 'Get drills'}
      </button>

      {error && <p className="form-error">{error}</p>}

      {plan && (
        <div className="plan">
          <div className="plan-head">
            <h2>{plan.title}</h2>
            <p>{plan.focus}</p>
          </div>

          {plan.kit.length > 0 && (
            <div className="chips">
              {plan.kit.map((k) => (
                <span key={k} className="chip">
                  {k}
                </span>
              ))}
            </div>
          )}

          <Section title="Warm up">
            <ol className="plan-list">
              {plan.warmup.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ol>
          </Section>

          <Section title="Drills">
            <div className="list">
              {plan.drills.map((d, i) => (
                <div key={i} className="drill">
                  <div className="drill-head">
                    <span className="drill-number">{i + 1}</span>
                    <strong>{d.name}</strong>
                  </div>
                  <p className="drill-setup">{d.setup}</p>
                  <div className="drill-meta">
                    <span className="chip">{d.reps}</span>
                  </div>
                  <p className="drill-cue">
                    <strong>Cue:</strong> {d.coaching}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Make it harder">
            <p className="muted small">{plan.progression}</p>
          </Section>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- clip analysis

function ClipPanel({ matchCount }: { matchCount: number }) {
  const { profile, matches } = useStore();
  const [clips, setClips] = useState<MediaMeta[]>([]);
  const [selected, setSelected] = useState<MediaMeta | null>(null);
  const [whichPlayer, setWhichPlayer] = useState('');
  const [context, setContext] = useState('');
  const [run, setRun] = useState<{ mode: ClipMode; frameCount: number } | null>(null);
  const [stage, setStage] = useState<'idle' | 'working'>('idle');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ClipAnalysis | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploaded, setUploaded] = useState<File | null>(null);

  useEffect(() => {
    listAllMedia()
      .then((items) => setClips(items.filter((i) => i.kind === 'video')))
      .catch(() => setClips([]));
  }, [matchCount]);

  const matchLabel = useMemo(() => {
    if (!selected) return '';
    const match = matches.find((m) => m.id === selected.matchId);
    if (!match) return 'Not filed to a match';
    return `${match.venue === 'away' ? '@' : 'vs'} ${match.opponent} · ${formatDateShort(match.date)}`;
  }, [selected, matches]);

  const reset = () => {
    setRun(null);
    setResult(null);
    setError('');
  };

  const start = async () => {
    setError('');
    setResult(null);
    if (!whichPlayer.trim()) {
      setError('Say which player you are, so the coach knows who to watch.');
      return;
    }

    let blob: Blob | null = uploaded;
    if (!blob && selected) blob = await getMediaBlob(selected.id);
    if (!blob) {
      setError('Pick a clip first.');
      return;
    }

    try {
      setStage('working');
      setProgress('Reading the clip…');
      const outcome = await analyseClipBlob(profile, blob, whichPlayer.trim(), context.trim(), setProgress);
      setRun({ mode: outcome.mode, frameCount: outcome.frameCount });
      setResult(outcome.analysis);
    } catch (e) {
      if (e instanceof ClipTooLongError) {
        setError(
          `That clip is ${Math.round(e.seconds)} seconds. The coach reads clips up to ${MAX_CLIP_SECONDS} seconds — trim it to the passage of play you want looked at.`,
        );
      } else {
        setError(await describeError(e));
      }
    } finally {
      setStage('idle');
      setProgress('');
    }
  };

  const busy = stage !== 'idle';

  return (
    <>
      {clips.length === 0 && !uploaded ? (
        <EmptyState
          icon="🎬"
          title="No clips saved yet"
          message="Add a video in the Media tab, or pick one from your phone below. Short clips work best — one save, one passage of play."
        />
      ) : (
        <Field label="Which clip?">
          <div className="clip-picker">
            {clips.map((clip) => (
              <button
                key={clip.id}
                className={selected?.id === clip.id && !uploaded ? 'clip-option on' : 'clip-option'}
                onClick={() => {
                  setUploaded(null);
                  setSelected(clip);
                  reset();
                }}
              >
                {clip.thumbnail ? <img src={clip.thumbnail} alt="" /> : <span className="media-fallback">🎬</span>}
                <span className="clip-option-name">{clip.name}</span>
              </button>
            ))}
          </div>
        </Field>
      )}

      <button className="ghost-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
        {uploaded ? `Chosen: ${uploaded.name}` : 'Or pick a video from this phone'}
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
          reset();
        }}
      />

      {selected && !uploaded && <p className="muted small">{matchLabel}</p>}

      <Field label="Which player are you?" hint="The coach has to be able to pick you out">
        <input
          className="input"
          value={whichPlayer}
          onChange={(e) => setWhichPlayer(e.target.value)}
          placeholder="e.g. the keeper in the green top, number 1"
        />
      </Field>

      <Field label="Anything else?" hint="Optional — what to look at">
        <input
          className="input"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. look at my starting position for the cross"
        />
      </Field>

      <button className="primary-btn" onClick={() => void start()} disabled={busy || (!selected && !uploaded)}>
        {busy ? progress : 'Analyse this clip'}
      </button>

      {getProvider() === 'gemini' && (
        <p className="muted small">Gemini watches the clip itself, so movement and timing are visible — not just stills.</p>
      )}

      {run && !busy && (
        <p className="muted small">
          {run.mode === 'video' ? 'Whole clip watched' : 'Read as stills'} · {costNote(run.mode, run.frameCount)}
        </p>
      )}

      {error && <p className="form-error">{error}</p>}

      {result && (
        <div className="analysis">
          <div className={`perf-head band-${scoreBand(result.rating)}`}>
            <div className="perf-score">
              {result.rating}
              <span>/100</span>
            </div>
            <div className="perf-verdict">
              <strong>{result.headline}</strong>
              <span>
                {scoreVerdict(result.rating)} · confidence {result.confidence}
              </span>
            </div>
          </div>

          <p className="analysis-text">{result.whatHappened}</p>

          {result.didWell.length > 0 && (
            <Section title="Done well">
              <ul className="plan-list good">
                {result.didWell.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </Section>
          )}

          {result.improve.length > 0 && (
            <Section title="Work on">
              <div className="list">
                {result.improve.map((item, i) => (
                  <div key={i} className="drill">
                    <div className="drill-head">
                      <span className="drill-number">{i + 1}</span>
                      <strong>{item.point}</strong>
                    </div>
                    <p className="drill-setup">{item.why}</p>
                    <p className="drill-cue">
                      <strong>Try:</strong> {item.drill}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {result.caveat && (
            <div className="ai-slot">
              <div className="ai-slot-head">
                <span className="ai-badge">Read this</span>
                <strong>What it couldn't see</strong>
              </div>
              <p>{result.caveat}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
