import { useRef, useState } from 'react';
import { useStore } from '../store/AppStore';
import { COMPETITION_TYPE_LABEL, POSITIONS, type Competition } from '../types';
import { computeStats } from '../lib/stats';
import { EmptyState, Field, Section } from './ui';
import type { CompetitionFormTarget } from './CompetitionFormSheet';

const PROMPT_DELAYS = [
  { value: 0, label: 'At kickoff' },
  { value: 60, label: '1 hour after' },
  { value: 105, label: 'After full time (1h45)' },
  { value: 480, label: 'Later that day' },
];

export function SetupScreen({ onEditCompetition }: { onEditCompetition: (t: CompetitionFormTarget) => void }) {
  const store = useStore();
  const { settings, competitions, matches, updateSettings, deleteCompetition } = store;
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  const matchCount = (c: Competition) => matches.filter((m) => m.competitionId === c.id).length;

  const removeCompetition = (c: Competition) => {
    const count = matchCount(c);
    const warning = count
      ? `Delete "${c.name}"? Its ${count} match${count === 1 ? '' : 'es'} will be kept but left without a competition.`
      : `Delete "${c.name}"?`;
    if (confirm(warning)) deleteCompetition(c.id);
  };

  const exportBackup = () => {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `matchday-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Backup downloaded.');
  };

  const importBackup = async (file: File) => {
    const text = await file.text();
    const result = store.importData(text);
    setMessage(result.ok ? 'Backup restored.' : result.error);
  };

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Setup</h1>
      </div>

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

      <Section title="You & your team">
        <Field label="Team name" hint="Used on the scoreboard when you log a result">
          <input
            className="input"
            value={settings.teamName}
            onChange={(e) => updateSettings({ teamName: e.target.value })}
            placeholder="e.g. Wanderers FC"
          />
        </Field>
        <Field label="Your name" hint="Optional">
          <input
            className="input"
            value={settings.playerName}
            onChange={(e) => updateSettings({ playerName: e.target.value })}
          />
        </Field>
        <Field label="Usual position">
          <select
            className="input"
            value={settings.defaultPosition}
            onChange={(e) => updateSettings({ defaultPosition: e.target.value })}
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
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
      </Section>

      <Section title="Your data">
        <p className="muted small">
          Everything is stored on this device only — nothing is uploaded. Back it up before changing phones.
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
              if (confirm('Delete every match, competition and setting? This cannot be undone.')) {
                store.clearAllData();
                setMessage('All data cleared.');
              }
            }}
          >
            Clear all data
          </button>
        </div>
      </Section>

      <p className="version-note">Matchday · {matches.length} matches tracked</p>
    </div>
  );
}
