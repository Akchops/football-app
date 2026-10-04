import { useMemo, useState } from 'react';
import { useStore } from '../store/AppStore';
import {
  AGE_GROUPS, POSITIONS_BY_GROUP, POSITION_GROUP_BLURB, POSITION_GROUP_LABEL, TEAM_COLORS,
  type PositionGroup,
} from '../types';
import { currentAge, suggestAgeGroup } from '../lib/date';
import { Field } from './ui';
import { accountsAvailable } from '../lib/auth';
import { useSync } from '../store/SyncProvider';
import { JoinQuestionCard, SignInForm } from './AccountSettings';

interface DraftTeam {
  name: string;
  ageGroup: string;
  position: string;
  color: string;
}

const GROUPS: PositionGroup[] = ['goalkeeper', 'defender', 'midfielder', 'forward'];
const STEPS = ['You', 'Position', 'Teams'];

/**
 * First-run profile setup: the player's details, kept on the device, and
 * everything can be changed later. Someone joining a family that already uses
 * Matchday can sign in here instead - the family's player arrives with the
 * first sync, and this screen gives way to the app by itself.
 */
export function OnboardingScreen({ onBack }: { onBack?: () => void } = {}) {
  const { profile, updateProfile, addTeam, teams } = useStore();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');

  const [name, setName] = useState(profile.name);
  const [dob, setDob] = useState(profile.dateOfBirth);
  const [ageGroup, setAgeGroup] = useState(profile.ageGroup);
  const [touchedAgeGroup, setTouchedAgeGroup] = useState(Boolean(profile.ageGroup));
  const [group, setGroup] = useState<PositionGroup>(profile.positionGroup);
  const [position, setPosition] = useState(profile.position);
  const [draftTeams, setDraftTeams] = useState<DraftTeam[]>([
    { name: '', ageGroup: '', position: '', color: TEAM_COLORS[0] },
  ]);

  const age = useMemo(() => currentAge(dob), [dob]);
  const suggested = useMemo(() => suggestAgeGroup(dob), [dob]);
  const effectiveAgeGroup = touchedAgeGroup ? ageGroup : suggested;

  const pickGroup = (next: PositionGroup) => {
    setGroup(next);
    // Keep the specific position in step with the group.
    if (!POSITIONS_BY_GROUP[next].includes(position)) setPosition(POSITIONS_BY_GROUP[next][0]);
  };

  const setTeam = (index: number, patch: Partial<DraftTeam>) =>
    setDraftTeams((list) => list.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const addRow = () =>
    setDraftTeams((list) => [
      ...list,
      { name: '', ageGroup: '', position: '', color: TEAM_COLORS[list.length % TEAM_COLORS.length] },
    ]);

  const next = () => {
    setError('');
    if (step === 0) {
      if (!name.trim()) return setError('What should we call you?');
      return setStep(1);
    }
    if (step === 1) return setStep(2);

    const named = draftTeams.filter((t) => t.name.trim());
    if (named.length === 0) return setError('Add at least one team — you can add more later.');

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

  const back = () => {
    setError('');
    setStep((s) => Math.max(0, s - 1));
  };

  return (
    <div className="onboarding">
      <div className="onboard-top">
        <div className="onboard-brand">Matchday</div>
        <div className="onboard-steps">
          {STEPS.map((label, i) => (
            <span key={label} className={i === step ? 'ostep on' : i < step ? 'ostep done' : 'ostep'}>
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="onboard-body">
        {step === 0 && (
          <>
            <h1>Let's set you up</h1>
            <p className="onboard-lead">
              {accountsAvailable()
                ? 'Your details stay on this device unless you sign in to share them with your family.'
                : "Your details stay on this device — there's no account and nothing gets uploaded."}
            </p>
            <JoinFamily />

            <Field label="Your name">
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sam"
                autoFocus
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
            <h1>Where do you play?</h1>
            <p className="onboard-lead">
              This decides which stats the app tracks. A keeper gets saves and clean sheets, not shots and
              conversion.
            </p>

            <div className="position-grid">
              {GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={g === group ? 'position-card on' : 'position-card'}
                  onClick={() => pickGroup(g)}
                >
                  <span className="position-name">{POSITION_GROUP_LABEL[g]}</span>
                  <span className="position-blurb">{POSITION_GROUP_BLURB[g]}</span>
                </button>
              ))}
            </div>

            {POSITIONS_BY_GROUP[group].length > 1 && (
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
            <h1>Who do you play for?</h1>
            <p className="onboard-lead">
              Add every team you turn out for. Each gets its own colour, so you can tell them apart on the
              calendar.
            </p>

            {draftTeams.map((team, i) => (
              <div key={i} className="team-draft">
                <div className="team-draft-head">
                  <span className="swatch lg" style={{ background: team.color }} />
                  <input
                    className="input"
                    value={team.name}
                    onChange={(e) => setTeam(i, { name: e.target.value })}
                    placeholder={i === 0 ? 'e.g. Wanderers FC' : 'Another team'}
                  />
                  {draftTeams.length > 1 && (
                    <button
                      className="icon-btn"
                      onClick={() => setDraftTeams((list) => list.filter((_, idx) => idx !== i))}
                      aria-label="Remove team"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="row two">
                  <select
                    className="input"
                    value={team.ageGroup || effectiveAgeGroup}
                    onChange={(e) => setTeam(i, { ageGroup: e.target.value })}
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
              </div>
            ))}

            <button className="link-btn" onClick={addRow}>
              + Add another team
            </button>
            {teams.length > 0 && <p className="muted small">{teams.length} team(s) already saved.</p>}
          </>
        )}

        {error && <p className="form-error">{error}</p>}
      </div>

      <div className="onboard-foot">
        {step > 0 || onBack ? (
          <button className="ghost-btn wide" onClick={step > 0 ? back : onBack}>
            Back
          </button>
        ) : (
          <span className="wide" />
        )}
        <button className="primary-btn wide" onClick={next}>
          {step === 2 ? "Let's go" : 'Continue'}
        </button>
      </div>
    </div>
  );
}

/**
 * For a parent setting up their phone when the family already uses Matchday:
 * sign in, join, and skip setting up a player who already exists.
 */
function JoinFamily() {
  const sync = useSync();
  const [open, setOpen] = useState(false);
  if (!sync.available) return null;

  if (sync.account) {
    const email = sync.account.email;
    const searching = sync.status === 'checking' || sync.status === 'syncing';
    const retry = (
      <div className="button-row">
        <button className="ghost-btn" disabled={searching} onClick={() => sync.syncNow()}>
          Check again
        </button>
        <button className="link-btn" disabled={searching} onClick={() => void sync.signOut()}>
          Use a different email
        </button>
      </div>
    );

    if (sync.joinQuestion) return <JoinQuestionCard sync={sync} />;
    if (searching) return <p className="notice">Signed in as {email}. Looking for your family…</p>;
    if (sync.household) {
      return <p className="notice">Signed in as {email}, in {sync.household.name}. Finish setting up below.</p>;
    }
    if (sync.status === 'offline' || sync.status === 'error') {
      return (
        <div className="detail-block">
          <p>
            Signed in as {email}, but the family could not be checked
            {sync.status === 'offline' ? ' - there is no signal.' : `: ${sync.error}`}
          </p>
          {retry}
        </div>
      );
    }
    return (
      <div className="detail-block">
        <p>
          Signed in as <strong>{email}</strong>, but there is no invite for it yet. Ask whoever set up Matchday to
          invite this email from <strong>Setup → Sharing with your family</strong>, then check again.
        </p>
        <p className="muted small">Or carry on setting up below, and you will start a family of your own.</p>
        {retry}
      </div>
    );
  }

  return open ? (
    <div className="detail-block">
      <SignInForm intro={false} />
    </div>
  ) : (
    <button className="link-btn" onClick={() => setOpen(true)}>
      Joining your family on Matchday? Sign in instead
    </button>
  );
}
