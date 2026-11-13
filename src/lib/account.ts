import { clearAllMedia } from '../store/media';
import { reloadGate } from './ageGate';
import { pushStatus, turnOffReminders } from './push';
import { sessionKey, supabase } from './supabase';

/**
 * The account itself: telling the server the age band of whoever signed in,
 * and deleting the account with everything stored for it.
 */

export async function declareAge(band: 'teen' | 'adult'): Promise<void> {
  const { error } = await (await supabase()).rpc('declare_age', { band });
  if (error) throw new Error(error.message);
}

function describeDeleteError(message: string): string {
  if (/failed to fetch|load failed|network/i.test(message)) {
    return 'Deleting your account needs signal. Nothing has been deleted - try again when you are online.';
  }
  if (/could not find the function|schema cache/i.test(message)) {
    return "Matchday's server hasn't been updated to delete accounts yet. Nothing has been deleted. Email the address in the privacy notice and it will be done by hand.";
  }
  return message;
}

/**
 * Deletes the account on the server (supabase/schema.sql, delete_my_account):
 * the email address, username and age answer, and - when nobody else shares
 * it, or the owner asks for everything - the player and every record. All of
 * it or none of it: a refusal leaves everything as it was.
 */
export async function deleteAccount(everything: boolean): Promise<void> {
  const client = await supabase();
  const { error } = await client.rpc('delete_my_account', { everything });
  if (error) throw new Error(describeDeleteError(error.message));
  // The account is gone, so there is no session left to end on the server.
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

function within<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([work, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

/** Stops the reminder server sending to this phone - it keeps nothing else about it. */
async function stopReminders(): Promise<void> {
  if (pushStatus() !== 'on') return;
  await within(turnOffReminders().catch(() => undefined), 5_000);
}

/**
 * Everything Matchday keeps on this phone: the player's records and settings,
 * match photos and clips, AI keys, the coach's conversation, the sign-in, and
 * the reminders the server holds for it. What is left is an app that has never
 * been opened.
 */
export async function wipePhone(): Promise<void> {
  await stopReminders();
  await within(clearAllMedia().catch(() => undefined), 5_000);
  try {
    const session = sessionKey();
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('matchday.') || key === session) localStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was kept to begin with.
  }
  try {
    sessionStorage.clear();
  } catch {
    // As above.
  }
  reloadGate();
}

/**
 * After an under-13's own account is deleted: the phone keeps the player's
 * records, but nothing that tied it to the account - or to the reminder server.
 */
export async function forgetAccountOnPhone(): Promise<void> {
  await stopReminders();
  try {
    for (const key of ['matchday.sync.v1', 'matchday.backup.beforeJoin', sessionKey()]) localStorage.removeItem(key);
  } catch {
    // Nothing to forget.
  }
}
