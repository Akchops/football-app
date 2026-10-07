import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useStore } from '../store/AppStore';
import { TRAINING_TYPE_LABEL, type PositionGroup } from '../types';
import { formatDateLong } from '../lib/date';
import { shareCard } from '../lib/share';
import { placingLabel } from '../lib/stats';
import { wrappedFor, wrappedTiles, type Wrapped } from '../lib/wrapped';
import { renderWrappedCard } from '../lib/wrappedCard';
import { Avatar } from './Avatar';

/** How long each slide stays up before the next one, unless held. */
const SLIDE_MS = 5500;

/** A colour pair per slide, plus the light shade its big number is set in. Dark enough for white text. */
const THEMES: [string, string, string][] = [
  ['#15803d', '#052e16', '#bbf7d0'],
  ['#6d28d9', '#be185d', '#fbcfe8'],
  ['#c2410c', '#9f1239', '#fed7aa'],
  ['#0369a1', '#1e3a8a', '#bae6fd'],
  ['#b45309', '#7c2d12', '#fde68a'],
  ['#7e22ce', '#312e81', '#e9d5ff'],
  ['#0f766e', '#134e4a', '#99f6e4'],
  ['#be185d', '#5b21b6', '#fbcfe8'],
  ['#4d7c0f', '#14532d', '#d9f99d'],
  ['#be123c', '#4c0519', '#fecdd3'],
];

const WHERE: Record<PositionGroup, string> = {
  goalkeeper: 'In goal',
  defender: 'At the back',
  midfielder: 'In midfield',
  forward: 'Up front',
};

interface Slide {
  id: string;
  kicker: string;
  /** Counted up from nothing as the slide arrives. */
  big?: number;
  /** A word or two in place of a number. */
  word?: string;
  unit?: string;
  lines: string[];
  list?: { text: string; mark: string }[];
}

const s = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const real = (lines: (string | false | null | undefined)[]) => lines.filter((l): l is string => Boolean(l));

/** The year as a run of slides, one story each, leaving out any it has nothing to say for. */
function storyOf(w: Wrapped, complete: boolean): Slide[] {
  const slides: Slide[] = [
    {
      id: 'intro',
      kicker: 'Matchday Wrapped',
      word: String(w.year),
      lines: [complete ? 'Your year on the pitch.' : 'Your year on the pitch, so far.', 'Tap to start'],
    },
    {
      id: 'played',
      kicker: 'This year you played',
      big: w.appearances,
      unit: s(w.appearances, 'match', 'matches'),
      lines: real([
        w.minutes > 0 && `That's ${w.minutes.toLocaleString()} minutes on the pitch.`,
        w.teams > 1 && `For ${w.teams} different teams.`,
      ]),
    },
    w.wins > 0
      ? {
          id: 'record',
          kicker: 'Your teams won',
          big: w.wins,
          unit: s(w.wins, 'game'),
          lines: real([
            `${w.wins}W ${w.draws}D ${w.losses}L`,
            w.longestUnbeaten >= 3 && `Longest unbeaten run: ${w.longestUnbeaten} games.`,
          ]),
        }
      : {
          id: 'record',
          kicker: 'Your teams played',
          big: w.played,
          unit: s(w.played, 'game'),
          lines: [`${w.wins}W ${w.draws}D ${w.losses}L`, 'Every one of them counts.'],
        },
  ];
  if (w.headline.length > 0) {
    const [first, ...rest] = w.headline;
    slides.push({
      id: 'position',
      kicker: WHERE[w.group],
      big: first.value,
      unit: first.value === 1 ? first.one : first.label,
      lines: rest.map((h) => `${h.value} ${h.value === 1 ? h.one : h.label}`),
    });
  }
  if (w.best) {
    const m = w.best.match;
    slides.push({
      id: 'best',
      kicker: 'Your best game',
      big: w.best.score,
      unit: '/ 100',
      lines: real([
        `${m.venue === 'away' ? '@' : 'vs'} ${m.opponent || 'TBC'} · ${formatDateLong(m.date)}`,
        w.best.line,
        w.motm > 1 && `Man of the match ${w.motm} times this year.`,
      ]),
    });
  }
  if (w.tournaments.length > 0) {
    slides.push({
      id: 'tournaments',
      kicker: 'Tournaments',
      big: w.tournaments.length,
      unit: s(w.tournaments.length, 'tournament'),
      list: w.tournaments.slice(0, 5).map((t) => ({ text: t.name, mark: t.placing ? placingLabel(t.placing) : 'Played' })),
      lines: real([w.trophies > 0 && `${w.trophies} ${s(w.trophies, 'trophy', 'trophies')} for the cabinet.`]),
    });
  }
  if (w.rival) {
    const r = w.rival;
    slides.push({
      id: 'rival',
      kicker: 'Your most-played opponent',
      word: r.name,
      lines: [
        `${r.played} games · ${r.wins}W ${r.draws}D ${r.losses}L`,
        r.wins > r.losses ? 'You had their number.' : r.losses > r.wins ? 'Next year.' : 'Honours even.',
      ],
    });
  }
  if (w.busiestMonth) {
    slides.push({
      id: 'month',
      kicker: 'Your busiest month',
      word: w.busiestMonth.name,
      lines: [`${w.busiestMonth.matches} matches in one month.`],
    });
  }
  if (w.training) {
    slides.push({
      id: 'training',
      kicker: 'Behind the scenes',
      big: w.training.sessions,
      unit: s(w.training.sessions, 'training session'),
      lines: real([
        w.training.hours > 0 && `${w.training.hours} ${s(w.training.hours, 'hour')} of work nobody saw.`,
        w.training.topType && `Mostly ${TRAINING_TYPE_LABEL[w.training.topType].toLowerCase()}.`,
      ]),
    });
  }
  slides.push({ id: 'type', kicker: 'Your player type', word: w.type.name, lines: [w.type.why] });
  return slides;
}

/** Counts up to `target` as a slide arrives, easing out like a scoreboard settling. */
function useCountUp(target: number, run: boolean, reduced: boolean): number {
  const [value, setValue] = useState(run && !reduced ? 0 : target);
  useEffect(() => {
    if (!run || reduced) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1100);
      setValue(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    setValue(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run, reduced]);
  return value;
}

function SlideView({ slide, accent, reduced }: { slide: Slide; accent: string; reduced: boolean }) {
  const count = useCountUp(slide.big ?? 0, slide.big !== undefined, reduced);
  const at = (d: number) => ({ '--d': d }) as CSSProperties;
  const said = [slide.kicker, slide.big !== undefined ? `${slide.big} ${slide.unit ?? ''}` : slide.word, ...(slide.list ?? []).map((i) => `${i.text}: ${i.mark}`), ...slide.lines]
    .filter(Boolean)
    .join('. ');
  return (
    <div className="wr-body">
      {/* Read out once, whole - not every tick of the count-up. */}
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      <div aria-hidden="true">
        <p className="wr-kicker wr-in" style={at(0)}>
          {slide.kicker}
        </p>
        {slide.big !== undefined ? (
          <p className="wr-big wr-in" style={{ ...at(1), color: accent }}>
            {count.toLocaleString()}
            {slide.unit && <span className="wr-unit">{slide.unit}</span>}
          </p>
        ) : (
          <p className={`wr-word wr-in${(slide.word ?? '').length > 12 ? ' long' : ''}`} style={{ ...at(1), color: accent }}>
            {slide.word}
          </p>
        )}
        {slide.list && (
          <ul className="wr-list">
            {slide.list.map((item, i) => (
              <li key={item.text + i} className="wr-in" style={at(2 + i)}>
                <span>{item.text}</span>
                <strong>{item.mark}</strong>
              </li>
            ))}
          </ul>
        )}
        {slide.lines.map((line, i) => (
          <p key={line} className="wr-line wr-in" style={at(2 + (slide.list?.length ?? 0) + i)}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * The year, Spotify Wrapped style: a story that moves itself on, a slide at a
 * time. Tap the right of the screen for the next, the left to go back, and hold
 * anywhere to pause. Ends on a summary that can be shared as a picture.
 */
export function WrappedStory({ year, complete, onClose }: { year: number; complete: boolean; onClose: () => void }) {
  const { matches, training, competitions, profile } = useStore();
  const wrapped = useMemo(
    () => wrappedFor({ matches, training, competitions, profile }, year),
    [matches, training, competitions, profile, year],
  );
  const slides = useMemo(() => (wrapped ? storyOf(wrapped, complete) : []), [wrapped, complete]);
  const total = slides.length + 1;
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [shareState, setShareState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');
  const reduced = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);
  const rootRef = useRef<HTMLDivElement>(null);
  const onSummary = index === total - 1;
  // Moving on by itself only where motion is welcome - otherwise it's tap to go on.
  const auto = !reduced && !onSummary;

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, total - 1)), [total]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  // The latest close, without re-running the effect below every time the app re-renders.
  const close = useRef(onClose);
  close.current = onClose;

  // Once, as it opens: focus for the keyboard, and the page behind held still.
  useEffect(() => {
    rootRef.current?.focus();
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  // Hold to pause: a press that lasts is a pause, not a tap.
  const holdTimer = useRef<number>();
  const wasHeld = useRef(false);
  const press = () => {
    wasHeld.current = false;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      wasHeld.current = true;
      setHeld(true);
    }, 250);
  };
  const letGo = () => {
    window.clearTimeout(holdTimer.current);
    setHeld(false);
  };
  const tap = (go: () => void) => () => {
    if (wasHeld.current) {
      wasHeld.current = false;
      return;
    }
    go();
  };
  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  if (!wrapped) return null;

  const theme = onSummary ? null : THEMES[index % THEMES.length];
  const share = async () => {
    setShareState('working');
    try {
      const blob = await renderWrappedCard(wrapped, profile);
      if (!blob) return setShareState('failed');
      const how = await shareCard(blob, `matchday-wrapped-${year}.png`, `My ${year} on the pitch - Matchday Wrapped`);
      setShareState(how === 'cancelled' ? 'idle' : 'done');
    } catch {
      setShareState('failed');
    }
  };

  const summary = wrappedTiles(wrapped);

  return (
    <div
      ref={rootRef}
      className={`wr${onSummary ? ' summary' : ''}${reduced ? ' still' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Your ${year} Wrapped`}
      tabIndex={-1}
      style={theme ? ({ '--wr-a': theme[0], '--wr-b': theme[1] } as CSSProperties) : undefined}
    >
      <div className="wr-glow one" aria-hidden="true" />
      <div className="wr-glow two" aria-hidden="true" />

      <div className="wr-top">
        <div className="wr-bars" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className="wr-bar">
              <i
                className={i < index || (i === index && !auto) ? 'full' : i === index ? 'run' : ''}
                style={
                  i === index && auto
                    ? ({ animationDuration: `${SLIDE_MS}ms`, animationPlayState: held || hidden ? 'paused' : 'running' } as CSSProperties)
                    : undefined
                }
                onAnimationEnd={i === index && auto ? next : undefined}
              />
            </span>
          ))}
        </div>
        <button className="wr-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {onSummary ? (
        <div className="wr-body wr-summary">
          <p className="wr-kicker wr-in">Your {year} Wrapped</p>
          <div className="wr-who wr-in" style={{ '--d': 1 } as CSSProperties}>
            <Avatar photo={profile.photo} name={profile.name} size={56} />
            <div>
              <strong>{profile.name || 'You'}</strong>
              <span>{wrapped.type.name}</span>
            </div>
          </div>
          <div className="wr-tiles">
            {summary.map((tile, i) => (
              <div key={tile.label} className="wr-tile wr-in" style={{ '--d': 2 + i } as CSSProperties}>
                <strong>{tile.value}</strong>
                <span>{tile.label}</span>
              </div>
            ))}
          </div>
          {wrapped.tournaments.some((t) => t.placing) && (
            <p className="wr-line wr-in" style={{ '--d': 8 } as CSSProperties}>
              {wrapped.tournaments
                .filter((t) => t.placing)
                .slice(0, 2)
                .map((t) => `${placingLabel(t.placing)} · ${t.name}`)
                .join('  ·  ')}
            </p>
          )}
          <div className="wr-actions">
            <button className="primary-btn" onClick={() => void share()} disabled={shareState === 'working'}>
              {shareState === 'working' ? 'Making image…' : '📤 Share'}
            </button>
            <button className="ghost-btn" onClick={() => setIndex(0)}>
              Watch again
            </button>
          </div>
          {shareState === 'done' && <p className="wr-line">Image ready — saved or shared.</p>}
          {shareState === 'failed' && <p className="wr-line">Couldn't make the image on this phone.</p>}
        </div>
      ) : (
        <>
          <SlideView key={slides[index].id} slide={slides[index]} accent={theme?.[2] ?? '#fff'} reduced={reduced} />
          {/* The left third goes back, the rest goes on - like any story. */}
          <button
            className="wr-tap back"
            aria-label="Previous"
            onPointerDown={press}
            onPointerUp={letGo}
            onPointerLeave={letGo}
            onPointerCancel={letGo}
            onClick={tap(prev)}
            onContextMenu={(e) => e.preventDefault()}
          />
          <button
            className="wr-tap on"
            aria-label="Next"
            onPointerDown={press}
            onPointerUp={letGo}
            onPointerLeave={letGo}
            onPointerCancel={letGo}
            onClick={tap(next)}
            onContextMenu={(e) => e.preventDefault()}
          />
          {held && <p className="wr-paused">Paused</p>}
        </>
      )}
    </div>
  );
}
