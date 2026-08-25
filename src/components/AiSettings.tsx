import { useState } from 'react';
import { PROVIDER_LABEL, type Provider } from '../lib/aiTypes';
import { getApiKey, getModel, getProvider, setApiKey, setModel, setProvider } from '../lib/apiKey';
import { proxyAvailable, sharedUsage } from '../lib/proxy';
import { Field, Section } from './ui';

interface Option {
  id: string;
  label: string;
  free: boolean;
}

const KEY_HELP: Record<Provider, { where: string; hint: string; cost: string }> = {
  gemini: {
    where: 'aistudio.google.com/apikey',
    hint: 'Starts with AIza',
    cost: 'Gemini has a free tier, so normal use costs nothing. Free-tier requests are rate limited, and Google may use free-tier data to improve their models — worth knowing before uploading match video.',
  },
  claude: {
    where: 'console.anthropic.com',
    hint: 'Starts with sk-ant-',
    cost: 'Claude is pay-as-you-go: a drills session is a fraction of a penny, reading a clip is roughly 20–30p. Set a spend limit in the console if you are handing the phone over.',
  },
};

export function AiSection() {
  const [provider, setProviderState] = useState<Provider>(() => getProvider());
  const [key, setKeyState] = useState(() => getApiKey(getProvider()));
  const [model, setModelState] = useState(() => getModel(getProvider()));
  const [visible, setVisible] = useState(false);
  const [models, setModels] = useState<Option[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const help = KEY_HELP[provider];
  const shared = proxyAvailable();
  const usage = sharedUsage();
  const usingOwn = key.trim().length > 0;

  const switchProvider = (next: Provider) => {
    setProviderState(next);
    setProvider(next);
    setKeyState(getApiKey(next));
    setModelState(getModel(next));
    setModels(null);
    setStatus('');
    setError('');
  };

  const saveKey = (value: string) => {
    setKeyState(value);
    setApiKey(provider, value.trim());
    setModels(null);
    setStatus('');
    setError('');
  };

  /** Ask the provider what this key can actually reach, rather than guessing an id. */
  const checkKey = async () => {
    setChecking(true);
    setStatus('');
    setError('');
    try {
      if (provider === 'gemini') {
        const { listModels } = await import('../lib/gemini');
        const found = await listModels();
        setModels(found);
        if (!model && found[0]) {
          setModel('gemini', found[0].id);
          setModelState(found[0].id);
        }
        setStatus(`Key works — ${found.length} models available.`);
      } else {
        const { CLAUDE_DEFAULT_MODEL, claudeDrills } = await import('../lib/claude');
        await claudeDrills(
          { name: '', photo: '', dateOfBirth: '', ageGroup: '', position: 'GK', positionGroup: 'goalkeeper', onboardedAt: null },
          'one quick warm-up only, keep it very short',
        );
        setModels([{ id: CLAUDE_DEFAULT_MODEL, label: 'Claude Opus 5', free: false }]);
        setStatus('Key works.');
      }
    } catch (e) {
      const { describeError } = await import('../lib/ai');
      setError(await describeError(e));
    } finally {
      setChecking(false);
    }
  };

  return (
    <Section title="AI coach">
      {shared ? (
        <div className={usingOwn ? 'shared-coach' : 'shared-coach on'}>
          <div className="shared-coach-head">
            <strong>{usingOwn ? 'Using your own key' : 'Shared coach — no setup needed'}</strong>
            {!usingOwn && <span className="ai-badge">Free</span>}
          </div>
          <p>
            {usingOwn
              ? 'Your own key is being used, so you have no daily limit. Clear it below to go back to the shared coach.'
              : `The Coach tab already works — it runs through Matchday's own coach, so there is nothing to set up. There is a daily limit${usage ? ` (${Math.max(0, usage.limit - usage.used)} of ${usage.limit} left today)` : ''} so one person can't use it all up.`}
          </p>
          {!usingOwn && (
            <p className="muted small">
              Adding your own free key below removes the limit entirely. Optional — most people won't need it.
            </p>
          )}
        </div>
      ) : (
        <p className="muted small">
          The Coach tab writes training sessions and reviews your match clips. That runs on the provider's servers, so
          it needs your own API key. The key is stored on this device only, is never included in a backup file, and is
          used for nothing else.
        </p>
      )}

      <Field label="Provider">
        <div className="chip-wrap">
          {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
            <button
              key={p}
              type="button"
              className={p === provider ? 'filter-chip on' : 'filter-chip'}
              onClick={() => switchProvider(p)}
            >
              {PROVIDER_LABEL[p]}
              {p === 'gemini' ? ' · free' : ''}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label={`${PROVIDER_LABEL[provider]} API key${shared ? ' (optional)' : ''}`}
        hint={key ? 'Saved on this device. Clear the box to remove it.' : help.hint}
      >
        <input
          className="input"
          type={visible ? 'text' : 'password'}
          value={key}
          spellCheck={false}
          autoComplete="off"
          placeholder={provider === 'gemini' ? 'AIza...' : 'sk-ant-...'}
          onChange={(e) => saveKey(e.target.value)}
        />
      </Field>

      <div className="button-row">
        <button className="ghost-btn" onClick={() => setVisible((v) => !v)}>
          {visible ? 'Hide key' : 'Show key'}
        </button>
        <button className="ghost-btn" onClick={() => void checkKey()} disabled={!key.trim() || checking}>
          {checking ? 'Checking…' : 'Check key'}
        </button>
        {key && (
          <button
            className="danger-link"
            onClick={() => {
              saveKey('');
              setStatus('Key removed.');
            }}
          >
            Remove
          </button>
        )}
      </div>

      {status && <p className="notice">{status}</p>}
      {error && <p className="form-error">{error}</p>}

      {models && models.length > 1 && (
        <Field label="Model" hint="Free models are listed first">
          <select
            className="input"
            value={model}
            onChange={(e) => {
              setModelState(e.target.value);
              setModel(provider, e.target.value);
            }}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.free ? ' (free)' : ''}
              </option>
            ))}
          </select>
        </Field>
      )}

      <p className="muted small">
        Get a key at {help.where}. {help.cost}
      </p>
    </Section>
  );
}
