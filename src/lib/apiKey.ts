/**
 * The Anthropic key, kept apart from the SDK so that importing it from Setup
 * doesn't pull the whole SDK into the main bundle.
 *
 * It lives in its own localStorage entry, never inside the app data, so it is
 * not carried into an exported backup.
 */
const KEY_STORAGE = 'matchday.anthropicKey';

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Private mode - the key just won't persist between sessions.
  }
}

export function hasApiKey(): boolean {
  return getApiKey().trim().length > 0;
}
