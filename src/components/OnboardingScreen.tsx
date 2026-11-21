import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, animate, m, useReducedMotion, type Variants } from 'motion/react';
import { useStore } from '../store/AppStore';
import {
  AGE_GROUPS, DEFAULT_PROFILE, POSITIONS_BY_GROUP, POSITION_GROUP_BLURB, POSITION_GROUP_LABEL, TEAM_COLORS,
  type PositionGroup,
} from '../types';
import { currentAge, suggestAgeGroup } from '../lib/date';
import { springs } from '../lib/motion';
import { BusyLabel, Field } from './ui';
import { accountsAvailable } from '../lib/auth';
import { useSync } from '../store/SyncProvider';
import { JoinQuestionCard } from './AccountSettings';
import { Logo } from './Logo';

interface DraftTeam {
  /** Stable across adds and removes, so the right row animates out. */
  id: number;
  name: string;
  ageGroup: string;
  position: string;
  color: string;
}

let draftSeq = 0;
const newDraft = (color: string): DraftTeam => ({ id: ++draftSeq, name: '', ageGroup: '', position: '', color });

const GROUPS: PositionGroup[] = ['goalkeeper', 'defender', 'midfielder', 'forward'];
const STEPS = ['You', 'Position', 'Teams'];

type Errors = { name?: string; group?: string; teams?: string };

/**
 * The steps move like an iOS navigation push: Continue slides the next one in
 * from the right over the last, which drifts left and dims; Back is the same
 * path in reverse. On springs, so a tap halfway through turns it round from
 * where it is. With Reduce Motion, a cross-fade.
 */
function slideVariants(reduce: boolean): Variants {
  if (reduce) return { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } };
  return {
    enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-30%', opacity: dir > 0 ? 1 : 0.6, zIndex: dir > 0 ? 1 : 0 }),
    center: (dir: number) => ({ x: 0, opacity: 1, zIndex: dir > 0 ? 1 : 0 }),
    exit: (dir: number) => ({ x: dir > 0 ? '-30%' : '100%', opacity: dir > 0 ? 0.6 : 1, zIndex: dir > 0 ? 0 : 1 }),
  };
}

/**
 * A no, the way iOS says it to a wrong passcode: the thing that needs fixing
 * shakes, with a buzz on the same frame where the phone can. Without the shake
 * under Reduce Motion - the message under the field still says what's wrong.
 */
function useShake<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const reduce = useReducedMotion();
  const shake = () => {
    const el = ref.current;
    if (typeof navigator !== 'undefined') navigator.vibrate?.([24, 40, 24]);
    if (!el || reduce) return;
    void animate(el, { x: [0, -10, 9, -7, 5, -3, 0] }, { duration: 0.42, ease: 'easeOut' });
  };
  return [ref, shake] as const;
}

/** Each step's title takes focus when it slides in, so a screen reader hears where it now is. */
function StepTitle({ children, focus }: { children: ReactNode; focus: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus({ preventScroll: true });
  }, [focus]);
  return (
    <h1 ref={ref} tabIndex={-1}>
      {children}
    </h1>
  );
}

/**
 * First-run profile setup: the player's details, and everything can be changed
 * later. With accounts, only ever for an account that has no player yet - it
 * comes after signing in, so someone coming back gets theirs from the account
 * instead. Someone joining a family that already uses Matchday can still be
 * invited meanwhile: the family's player arrives with the next sync, and this
 * screen gives way to the app by itself.
 */
export function OnboardingScreen({ onBack }: { onBack?: () => void } = {}) {
  const { profile, updateProfile, addTeam, teams } = useStore();
  const reduce = useReducedMotion() ?? false;
  // dir: 1 forward, -1 back, 0 before anyone has moved.
  const [[step, dir], setNav] = useState<[number, number]>([0, 0]);
  const [errors, setErrors] = useState<Errors>({});

  const [name, setName] = useState(profile.name);
  const [dob, setDob] = useState(profile.dateOfBirth);
  const [ageGroup, setAgeGroup] = useState(profile.ageGroup);
  const [touchedAgeGroup, setTouchedAgeGroup] = useState(Boolean(profile.ageGroup));
  // A fresh profile defaults to keeper. Nobody should get keeper stats for
  // tapping Continue without looking, so nothing is picked until they pick.
  const unchosen =
    profile.position === DEFAULT_PROFILE.position && profile.positionGroup === DEFAULT_PROFILE.positionGroup;
  const [group, setGroup] = useState<PositionGroup | null>(unchosen ? null : profile.positionGroup);
  const [position, setPosition] = useState(unchosen ? '' : profile.position);
  const [draftTeams, setDraftTeams] = useState<DraftTeam[]>(() => [newDraft(TEAM_COLORS[0])]);
  const [focusTeam, setFocusTeam] = useState<number | null>(null);

  const [nameRef, shakeName] = useShake<HTMLInputElement>();
  const [groupRef, shakeGroup] = useShake<HTMLDivElement>();
  const [teamRef, shakeTeam] = useShake<HTMLInputElement>();

  const age = useMemo(() => currentAge(dob), [dob]);
  const suggested = useMemo(() => suggestAgeGroup(dob), [dob]);
  const effectiveAgeGroup = touchedAgeGroup ? ageGroup : suggested;
  const variants = useMemo(() => slideVariants(reduce), [reduce]);

  const ready = step === 0 ? Boolean(name.trim()) : step === 1 ? group !== null : draftTeams.some((t) => t.name.trim());

  const go = (to: number) => {
    setErrors({});
    setNav(([from]) => [to, to > from ? 1 : -1]);
  };

  const pickGroup = (next: PositionGroup) => {
    setGroup(next);
    setErrors({});
    // Keep the specific position in step with the group.
    if (!POSITIONS_BY_GROUP[next].includes(position)) setPosition(POSITIONS_BY_GROUP[next][0]);
  };

  const setTeam = (index: number, patch: Partial<DraftTeam>) => {
    if (patch.name !== undefined && errors.teams) setErrors({});
    setDraftTeams((list) => list.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const addRow = () => {
    const row = newDraft(TEAM_COLORS[draftTeams.length % TEAM_COLORS.length]);
    setDraftTeams((list) => [...list, row]);
    setFocusTeam(row.id);
  };

  const next = () => {
    if (step === 0) {
      if (!name.trim()) {
        setErrors({ name: 'What should we call you?' });
        nameRef.current?.focus();
        return shakeName();
      }
      return go(1);
    }
    if (step === 1) {
      if (!group) {
        setErrors({ group: 'Pick where you play — you can change it later.' });
        return shakeGroup();
      }
      return go(2);
    }

    const named = draftTeams.filter((t) => t.name.trim());
    if (named.length === 0) {
      setErrors({ teams: 'Add at least one team — you can add more later.' });
      teamRef.current?.focus();
      return shakeTeam();
    }
    if (!group) return go(1);

    for (const team of named) {
      addTeam({
        name: team.name.trim(),
        ageGroup: team.ageGroup || effectiveAgeGroup,
        position: team.position || position,
        color: team.color,
        notes: '',
      });
    }
    updateProfile({
      name: name.trim(),
      dateOfBirth: dob,
      ageGroup: effectiveAgeGroup,
      ageGroupYear: new Date().getFullYear(),
      position,
      positionGroup: group,
      onboardedAt: new Date().toISOString(),
    });
  };

  const moved = dir !== 0;

  return (
    <div className="onboarding">
      <div className="onboard-top">
        <div className="onboard-brand">
          <Logo />
          Matchday
        </div>
        <nav className="onboard-steps" aria-label="Setup steps">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              className={i === step ? 'ostep on' : i < step ? 'ostep done' : 'ostep'}
              aria-current={i === step ? 'step' : undefined}
              // Only back: a step ahead may need something not given yet.
              disabled={i >= step}
              onClick={() => go(i)}
            >
              <span className="ostep-track">
                <m.span
                  className="ostep-fill"
                  initial={false}
                  animate={{ scaleX: i <= step ? 1 : 0 }}
                  transition={springs.smooth}
                />
              </span>
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="onboard-body staged">
        <AnimatePresence initial={false} custom={dir}>
          <m.div
            key={step}
            className="onboard-step"
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={springs.smooth}
          >
            {step === 0 && (
              <>
                <StepTitle focus={moved}>Let's set you up</StepTitle>
                <p className="onboard-lead">
                  {accountsAvailable()
                    ? 'Saved to your account, so signing in on another phone brings it all back. You can change any of it later in Setup.'
                    : "Your details stay on this device — there's no account and nothing gets uploaded."}
                </p>
                <SignedInAs />

                <Field label="Your name" error={errors.name}>
                  <input
                    ref={nameRef}
                    className="input"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors({});
                    }}
                    placeholder="e.g. Sam"
                    aria-invalid={errors.name ? true : undefined}
                    autoFocus={!moved}
                  />
                </Field>

                <Field label="Date of birth" hint={age !== null ? `You're ${age}` : 'Used to suggest your age group'}>
                  <input className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                </Field>

                <Field
                  label="Age group you play in"
                  hint={suggested && !touchedAgeGroup ? `Suggested from your date of birth: ${suggested}` : undefined}
                >
                  <select
                    className="input"
                    value={effectiveAgeGroup}
                    onChange={(e) => {
                      setTouchedAgeGroup(true);
                      setAgeGroup(e.target.value);
                    }}
                  >
                    <option value="">Not sure yet</option>
                    {AGE_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}

            {step === 1 && (
              <>
                <StepTitle focus={moved}>Where do you play?</StepTitle>
                <p className="onboard-lead">
                  This decides which stats the app tracks. A keeper gets saves and clean sheets, not shots and
                  conversion.
                </p>

                <div className="position-grid" ref={groupRef} role="radiogroup" aria-label="Where you play">
                  {GROUPS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      role="radio"
                      aria-checked={g === group}
                      className={g === group ? 'position-card on' : 'position-card'}
                      onClick={() => pickGroup(g)}
                    >
                      <span className="position-name">{POSITION_GROUP_LABEL[g]}</span>
                      <span className="position-blurb">{POSITION_GROUP_BLURB[g]}</span>
                    </button>
                  ))}
                </div>
                {errors.group && (
                  <p className="field-hint bad" role="alert">
                    {errors.group}
                  </p>
                )}

                {group && POSITIONS_BY_GROUP[group].length > 1 && (
                  <Field group label="More specifically">
                    <div className="chip-wrap">
                      {POSITIONS_BY_GROUP[group].map((p) => (
                        <button
                          key={p}
                          type="button"
                          className={p === position ? 'filter-chip on' : 'filter-chip'}
                          onClick={() => setPosition(p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </Field>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <StepTitle focus={moved}>Who do you play for?</StepTitle>
                <p className="onboard-lead">
                  Add every team you turn out for. Each gets its own colour, so you can tell them apart on the
                  calendar.
                </p>

                {/* popLayout: a removed team leaves the flow at once and the rest slide up to close the gap. */}
                <AnimatePresence initial={false} mode="popLayout">
                  {draftTeams.map((team, i) => (
                    <m.div
                      key={team.id}
                      layout
                      className="team-draft"
                      initial={{ opacity: 0, scale: 0.96, y: -8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={springs.smooth}
                    >
                      <div className="team-draft-head">
                        <span className="swatch lg" style={{ background: team.color }} />
                        <input
                          ref={i === 0 ? teamRef : undefined}
                          className="input"
                          value={team.name}
                          onChange={(e) => setTeam(i, { name: e.target.value })}
                          placeholder={i === 0 ? 'e.g. Wanderers FC' : 'Another team'}
                          aria-label="Team name"
                          aria-invalid={i === 0 && errors.teams ? true : undefined}
                          autoFocus={team.id === focusTeam}
                        />
                        {draftTeams.length > 1 && (
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => setDraftTeams((list) => list.filter((t) => t.id !== team.id))}
                            aria-label={team.name.trim() ? `Remove ${team.name.trim()}` : 'Remove team'}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      {i === 0 && errors.teams && (
                        <p className="field-hint bad" role="alert">
                          {errors.teams}
                        </p>
                      )}
                      <div className="row two">
                        <select
                          className="input"
                          value={team.ageGroup || effectiveAgeGroup}
                          onChange={(e) => setTeam(i, { ageGroup: e.target.value })}
                          aria-label="Age group"
                        >
                          <option value="">Age group</option>
                          {AGE_GROUPS.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                        <select
                          className="input"
                          value={team.position || position}
                          onChange={(e) => setTeam(i, { position: e.target.value })}
                          aria-label="Position"
                        >
                          {Object.values(POSITIONS_BY_GROUP)
                            .flat()
                            .map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="color-row">
                        {TEAM_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={c === team.color ? 'color-dot on' : 'color-dot'}
                            style={{ background: c }}
                            aria-label={`Colour ${c}`}
                            onClick={() => setTeam(i, { color: c })}
                          />
                        ))}
                      </div>
                    </m.div>
                  ))}

                  <m.button key="add" layout type="button" className="link-btn" onClick={addRow}>
                    + Add another team
                  </m.button>
                  {teams.length > 0 && (
                    <m.p key="saved" layout className="muted small">
                      {teams.length} team(s) already saved.
                    </m.p>
                  )}
                </AnimatePresence>
              </>
            )}
          </m.div>
        </AnimatePresence>
      </div>

      <div className="onboard-foot">
        {step > 0 || onBack ? (
          <button className="ghost-btn wide" onClick={step > 0 ? () => go(step - 1) : onBack}>
            Back
          </button>
        ) : (
          <span className="wide" />
        )}
        {/* Dimmed until the step has what it needs, but never dead: a tap says what's missing. */}
        <button className={ready ? 'primary-btn wide' : 'primary-btn wide waiting'} onClick={next}>
          {step === 2 ? "Let's go" : 'Continue'}
        </button>
      </div>
    </div>
  );
}

/**
 * Who this is being set up for, and the way out for someone who meant to join
 * a family that already uses Matchday: be invited, then check again.
 */
function SignedInAs() {
  const sync = useSync();
  if (!sync.available || !sync.account) return null;
  const email = sync.account.email;
  const searching = sync.status === 'checking' || sync.status === 'syncing';

  if (sync.joinQuestion) return <JoinQuestionCard sync={sync} />;
  if (sync.household) {
    return <p className="notice">Signed in as {email}, in {sync.household.name}. Finish setting up below.</p>;
  }
  return (
    <div className="detail-block">
      <p className="small">
        Signed in as <strong>{email}</strong>. There&apos;s no player on this account yet, so set one up below.
      </p>
      <p className="muted small">
        Joining a family that already uses Matchday? Ask them to invite this email from{' '}
        <strong>Setup → Sharing with your family</strong>, then check again.
      </p>
      <div className="button-row">
        <button className="link-btn" disabled={searching} onClick={() => sync.syncNow()}>
          <BusyLabel busy={searching} text="Checking…">
            Check again
          </BusyLabel>
        </button>
        <button className="link-btn" disabled={searching} onClick={() => void sync.signOut()}>
          Use a different email
        </button>
      </div>
    </div>
  );
}
