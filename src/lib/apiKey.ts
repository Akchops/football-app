import type { Provider } from './aiTypes';

/**
 * Provider settings, kept apart from the SDKs so importing them from Setup
 * doesn't pull either SDK into the main bundle.
 *
 * Keys live in their own localStorage entries, never inside the app data, so
 * they are not carried into an exported backup.
 */
const KEYS: Record<Provider, string> = {
  gemini: 'matchday.geminiKey',
  claude: 'matchday.anthropicKey',
};
const PROVIDER_STORAGE = 'matchday.aiProvider';
const MODEL_STORAGE = 'matchday.aiModel';

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function write(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Private mode - it just won't persist between sessions.
  }
}

export function getProvider(): Provider {
  return read(PROVIDER_STORAGE) === 'claude' ? 'claude' : 'gemini';
}

export function setProvider(provider: Provider): void {
  write(PROVIDER_STORAGE, provider);
}

export function getApiKey(provider: Provider = getProvider()): string {
  return read(KEYS[provider]);
}

export function setApiKey(provider: Provider, key: string): void {
  write(KEYS[provider], key);
}

export function hasApiKey(provider: Provider = getProvider()): boolean {
  return getApiKey(provider).trim().length > 0;
}

/** The chosen model for the current provider, discovered from its API. */
export function getModel(provider: Provider = getProvider()): string {
  return read(`${MODEL_STORAGE}.${provider}`);
}

export function setModel(provider: Provider, model: string): void {
  write(`${MODEL_STORAGE}.${provider}`, model);
}
