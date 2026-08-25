import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/AppStore';
import {
  AGE_GROUPS, COMPETITION_TYPE_LABEL, POSITIONS_BY_GROUP, POSITION_GROUP_BLURB, POSITION_GROUP_LABEL,
  type Competition, type PositionGroup, type Team,
} from '../types';
import { MATCH_LENGTHS, REMINDER_LEADS, TRAINING_LENGTHS } from '../types';
import { currentAge, suggestAgeGroup } from '../lib/date';
import { computeStats } from '../lib/stats';
import { formatBytes, listAllMedia } from '../store/media';
import { getApiKey, setApiKey } from '../lib/apiKey';
import { DurationPicker, EmptyState, Field, Section } from './ui';
import { AvatarPicker } from './Avatar';
import type { CompetitionFormTarget } from './CompetitionFormSheet';
import type { TeamFormTarget } from './TeamFormSheet';

const PROMPT_DELAYS = [
  { value: 0, label: 'At kickoff' },
  { value: 60, label: '1 hour after' },
  { value: 105, label: 'After full time (1h45)' },
  { value: 480, label: 'Later that day' },
];

const GROUPS: PositionGroup[] = ['goalkeeper', 'defender', 'midfielder', 'forward'];

export function SetupScreen({
  onEditCompetition,
  onEditTeam,
}: {
  onEditCompetition: (t: CompetitionFormTarget) => void;
  onEditTeam: (t: TeamFormTarget) => void;
}) {
  const store = useStore();
  const { settings, profile, competitions, teams, matches, updateSettings, updateProfile, deleteCompetition, deleteTeam } =
    store;
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [mediaUsage, setMediaUsage] = useState<{ count: number; bytes: number } | null>(null);
  const [apiKey, setKeyState] = useState(() => getApiKey());
  const [keyVisible, setKeyVisible] = useState(false);

  useEffect(() => {
    listAllMedia()
      .then((items) => setMediaUsage({ count: items.length, bytes: items.reduce((sum, i) => sum + i.size, 0) }))
      .catch(() => setMediaUsage(null));
  }, [matches]);

  const age = currentAge(profile.dateOfBirth);
  const matchCount = (c: Competition) => matches.filter((m) => m.competitionId === c.id).length;
  const teamMatchCount = (t: Team) => matches.filter((m) => m.teamId === t.id).length;

  const removeCompetition = (c: Competition) => {
    const count = matchCount(c);
    const warning = count
      ? `Delete "${c.name}"? Its ${count} match${count === 1 ? '' : 'es'} will be kept but left without a competition.`
      : `Delete "${c.name}"?`;
    if (confirm(warning)) deleteCompetition(c.id);
  };

  const removeTeam = (t: Team) => {
    const count = teamMatchCount(t);
    const warning = count
      ? `Delete "${t.name}"? Its ${count} match${count === 1 ? '' : 'es'} will be kept but left without a team.`
      : `Delete "${t.name}"?`;
    if (confirm(warning)) deleteTeam(t.id);
  };

  const exportBackup = () => {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `matchday-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Backup downloaded. Videos and photos stay on the device — they are not in the backup file.');
  };

  const importBackup = async (file: File) => {
    const text = await file.text();
    const result = store.importData(text);
    setMessage(result.ok ? 'Backup restored.' : result.error);
  };

  const pickGroup = (group: PositionGroup) => {
    const position = POSITIONS_BY_GROUP[group].includes(profile.position)
      ? profile.position
      : POSITIONS_BY_GROUP[group][0];
    updateProfile({ positionGroup: group, position });
  };

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Setup</h1>
      </div>

      <Section title="Your profile">
        <AvatarPicker
          photo={profile.photo}
          name={profile.name}
          onChange={(photo) => updateProfile({ photo })}
        />
        <Field label="Name">
          <input className="input" value={profile.name} onChange={(e) => updateProfile({ name: e.target.value })} />
        </Field>
        <div className="row two">
          <Field label="Date of birth" hint={age !== null ? `Age ${age}` : undefined}>
            <input
              className="input"
              type="date"
              value={profile.dateOfBirth}
              onChange={(e) => updateProfile({ dateOfBirth: e.target.value })}
            />
          </Field>
          <Field
            label="Age group"
            hint={
              profile.dateOfBirth && suggestAgeGroup(profile.dateOfBirth) !== profile.ageGroup
                ? `Suggested: ${suggestAgeGroup(profile.dateOfBirth)}`
                : undefined
            }
          >
            <select className="input" value={profile.ageGroup} onChange={(e) => updateProfile({ ageGroup: e.target.value })}>
              <option value="">Not set</option>
              {AGE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Position">
        <p className="muted small">This decides which stats the app tracks and how your match score is worked out.</p>
        <div className="position-grid">
          {GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              className={g === profile.positionGroup ? 'position-card on' : 'position-card'}
              onClick={() => pickGroup(g)}
            >
              <span className="position-name">{POSITION_GROUP_LABEL[g]}</span>
              <span className="position-blurb">{POSITION_GROUP_BLURB[g]}</span>
            </button>
          ))}
        </div>
        {POSITIONS_BY_GROUP[profile.positionGroup].length > 1 && (
          <Field label="More specifically">
            <div className="chip-wrap">
              {POSITIONS_BY_GROUP[profile.positionGroup].map((p) => (
                <button
                  key={p}
                  type="button"
                  className={p === profile.position ? 'filter-chip on' : 'filter-chip'}
                  onClick={() => updateProfile({ position: p })}
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>
        )}
      </Section>

      <Section
        title="Your teams"
        action={
          <button className="ghost-btn" onClick={() => onEditTeam({ mode: 'create' })}>
            + New
          </button>
        }
      >
        {teams.length === 0 ? (
          <EmptyState
            icon="👕"
            title="No teams yet"
            message="Add every team you play for. Each gets its own colour on the calendar."
            action={
              <button className="primary-btn" onClick={() => onEditTeam({ mode: 'create' })}>
                Add a team
              </button>
            }
          />
        ) : (
          <div className="list">
            {teams.map((t) => (
              <div key={t.id} className="comp-row">
                <span className="swatch" style={{ background: t.color }} />
                <button className="comp-main" onClick={() => onEditTeam({ mode: 'edit', team: t })}>
                  <span className="comp-name">{t.name}</span>
                  <span className="comp-meta">
                    {[t.ageGroup, t.position].filter(Boolean).join(' · ')}
                    {t.ageGroup || t.position ? ' · ' : ''}
                    {teamMatchCount(t)} match{teamMatchCount(t) === 1 ? '' : 'es'}
                  </span>
                </button>
                <button className="icon-btn" onClick={() => removeTeam(t)} aria-label={`Delete ${t.name}`}>
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Competitions"
        action={
          <button className="ghost-btn" onClick={() => onEditCompetition({ mode: 'create' })}>
            + New
          </button>
        }
      >
        {competitions.length === 0 ? (
          <EmptyState
            icon="🏆"
            title="No competitions yet"
            message="Group your matches into leagues, cups and tournaments to get a breakdown in your stats."
            action={
              <button className="primary-btn" onClick={() => onEditCompetition({ mode: 'create' })}>
                Add a competition
              </button>
            }
          />
        ) : (
          <div className="list">
            {competitions.map((c) => {
              const compStats = computeStats(matches.filter((m) => m.competitionId === c.id));
              return (
                <div key={c.id} className="comp-row">
                  <span className="swatch" style={{ background: c.color }} />
                  <button className="comp-main" onClick={() => onEditCompetition({ mode: 'edit', competition: c })}>
                    <span className="comp-name">{c.name}</span>
                    <span className="comp-meta">
                      {COMPETITION_TYPE_LABEL[c.type]}
                      {c.season ? ` · ${c.season}` : ''} · {matchCount(c)} match{matchCount(c) === 1 ? '' : 'es'}
                      {compStats.played > 0 && ` · ${compStats.wins}W ${compStats.draws}D ${compStats.losses}L`}
                    </span>
                  </button>
                  <button className="icon-btn" onClick={() => removeCompetition(c)} aria-label={`Delete ${c.name}`}>
                    🗑
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Match defaults">
        <Field label="Ask me for the result" hint="When a match has kicked off, the app prompts you next time you open it.">
          <select
            className="input"
            value={settings.resultPromptDelayMinutes}
            onChange={(e) => updateSettings({ resultPromptDelayMinutes: Number(e.target.value) })}
          >
            {PROMPT_DELAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Remind me before a match" hint="Used by the alarm on calendar entries you add to your phone.">
          <select
            className="input"
            value={settings.reminderLeadMinutes}
            onChange={(e) => updateSettings({ reminderLeadMinutes: Number(e.target.value) })}
          >
            {REMINDER_LEADS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default training length">
          <DurationPicker
            value={settings.defaultTrainingLength}
            onChange={(minutes) => updateSettings({ defaultTrainingLength: minutes })}
            presets={TRAINING_LENGTHS}
          />
        </Field>
        <Field label="Colour the calendar by" hint="Which colour the dots on a match day use">
          <select
            className="input"
            value={settings.calendarColorBy}
            onChange={(e) => updateSettings({ calendarColorBy: e.target.value === 'team' ? 'team' : 'competition' })}
          >
            <option value="competition">Competition</option>
            <option value="team">Team</option>
          </select>
        </Field>
        <Field label="Default match length" hint="Starting point for a new match — each match can override it.">
          <DurationPicker
            value={settings.defaultMatchLength}
            onChange={(minutes) => updateSettings({ defaultMatchLength: minutes })}
            presets={MATCH_LENGTHS}
          />
        </Field>
        <div className="row two">
          <Field label="Default kickoff time">
            <input
              className="input"
              type="time"
              value={settings.defaultKickoff}
              onChange={(e) => updateSettings({ defaultKickoff: e.target.value })}
            />
          </Field>
          <Field label="Week starts on">
            <select
              className="input"
              value={settings.weekStartsOn}
              onChange={(e) => updateSettings({ weekStartsOn: Number(e.target.value) === 0 ? 0 : 1 })}
            >
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Your data">
        <p className="muted small">
          Everything is stored on this device only — nothing is uploaded. Back it up before changing phones.
          {mediaUsage && mediaUsage.count > 0
            ? ` Videos and photos use ${formatBytes(mediaUsage.bytes)} across ${mediaUsage.count} file${mediaUsage.count === 1 ? '' : 's'}.`
            : ''}
        </p>
        {message && <p className="notice">{message}</p>}
        <div className="button-row">
          <button className="ghost-btn" onClick={exportBackup}>
            Export backup
          </button>
          <button className="ghost-btn" onClick={() => fileRef.current?.click()}>
            Import backup
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importBackup(file);
            e.target.value = '';
          }}
        />
        <div className="button-row">
          <button
            className="ghost-btn"
            onClick={() => {
              if (matches.length === 0 || confirm('Replace everything with demo data?')) {
                store.loadSampleData();
                setMessage('Demo data loaded.');
              }
            }}
          >
            Load demo data
          </button>
          <button
            className="danger-link"
            onClick={() => {
              if (confirm('Delete every match, team, competition and setting? This cannot be undone.')) {
                store.clearAllData();
                setMessage('All data cleared.');
              }
            }}
          >
            Clear all data
          </button>
        </div>
      </Section>

      <Section title="AI coach">
        <p className="muted small">
          The Coach tab writes training sessions and reviews your match clips. That runs on Anthropic's servers, so it
          needs your own API key from console.anthropic.com. The key is stored on this device only, is never included in
          a backup file, and is used for nothing else.
        </p>
        <Field
          label="Anthropic API key"
          hint={apiKey ? 'Saved on this device. Clear the box to remove it.' : 'Starts with sk-ant-'}
        >
          <input
            className="input"
            type={keyVisible ? 'text' : 'password'}
            value={apiKey}
            spellCheck={false}
            autoComplete="off"
            placeholder="sk-ant-..."
            onChange={(e) => {
              setKeyState(e.target.value);
              setApiKey(e.target.value.trim());
            }}
          />
        </Field>
        <div className="button-row">
          <button className="ghost-btn" onClick={() => setKeyVisible((v) => !v)}>
            {keyVisible ? 'Hide key' : 'Show key'}
          </button>
          {apiKey && (
            <button
              className="danger-link"
              onClick={() => {
                setKeyState('');
                setApiKey('');
                setMessage('API key removed.');
              }}
            >
              Remove key
            </button>
          )}
        </div>
        <p className="muted small">
          Costs land on your Anthropic account: a drills session is a fraction of a penny, reading a clip is roughly
          20–30p. Set a spend limit in the Anthropic console if you're handing the phone over.
        </p>
      </Section>

      <Section title="The app on your phone">
        <p className="muted small">
          Matchday installs to your home screen and runs like any other app — full screen, its own icon, and it
          works with no signal, which is the normal state at a pitch. On Android, use the Install prompt when it
          appears. On iPhone, open it in Safari and tap Share → Add to Home Screen.
        </p>
        <p className="muted small">
          It stores everything on this device, so each phone that opens it keeps its own separate data.
        </p>
      </Section>

      <p className="version-note">
        Matchday · {matches.length} matches tracked
        <br />© {new Date().getFullYear()} Akchops. All rights reserved.
      </p>
    </div>
  );
}
