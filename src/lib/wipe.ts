import { deleteAllMedia } from '../store/media';
import { freezeStorage } from '../store/storage';
import { forgetThisPhone } from './push';
import { sessionKey } from './supabase';

/**
 * Everything Matchday keeps in this browser, removed: the season, the sync
 * bookkeeping, the copy kept from joining a family, photos and clips, AI keys,
 * reminders and their server-side list, look and feel, and the sign-in.
 *
 * Only Matchday's own keys, never `localStorage.clear()`: the app is served
 * from an address other apps can share, and their data is not ours to delete.
 * The app's own files stay cached, so it still opens with no signal - they
 * hold nothing about anyone.
 */
const PREFIX = 'matchday.';

/** Shown once on the sign-in screen after a phone cleared itself because of a delete made somewhere else. */
const NOTICE_KEY = 'matchday.wipedNotice';

export type WipeReason = 'here' | 'elsewhere';

export async function wipeThisDevice(reason: WipeReason): Promise<void> {
  freezeStorage();
  await forgetThisPhone();
  await deleteAllMedia().catch(() => undefined);
  removeKeys(typeof localStorage === 'undefined' ? null : localStorage);
  removeKeys(typeof sessionStorage === 'undefined' ? null : sessionStorage);
  if (reason === 'elsewhere') {
    try {
      sessionStorage.setItem(NOTICE_KEY, '1');
    } catch {
      // No notice, then. The phone is still clear.
    }
  }
}

function removeKeys(store: Storage | null) {
  if (!store) return;
  try {
    const session = sessionKey();
    const ours: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && (key.startsWith(PREFIX) || (session && (key === session || key.startsWith(`${session}-`))))) ours.push(key);
    }
    for (const key of ours) store.removeItem(key);
  } catch {
    // Storage blocked: there was nothing saved in it to begin with.
  }
}

/** Starts the app over from nothing, as if it had just been put on the phone. */
export function startOver(): void {
  window.location.replace(window.location.origin + import.meta.env.BASE_URL);
}

/** Whether this phone cleared itself because of a delete made elsewhere. Lasts until the next sign-in. */
export function wipedElsewhere(): boolean {
  try {
    return sessionStorage.getItem(NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearWipedNotice(): void {
  try {
    sessionStorage.removeItem(NOTICE_KEY);
  } catch {
    // Nothing to clear.
  }
}
