import type { Competition, Match } from '../types';
import { isIOS, isStandalone } from './install';
import { reminderSchedule, type ReminderPrefs } from './reminders';

/**
 * Match reminders on this phone. The browser gives the app a push address; the
 * app works out its reminders from the fixtures and sends the list to the
 * Matchday server (the same worker as the shared coach), which sends each one
 * at its time. Turned on per phone - each phone that should buzz asks for itself.
 */

const SERVER = (import.meta.env.VITE_AI_PROXY_URL ?? '').replace(/\/+$/, '');
const PREFS_KEY = 'matchday.reminders';
const SENT_KEY = 'matchday.remindersSent';

export type PushStatus =
  /** No server to send them in this build. */
  | 'no-server'
  /** An iPhone in Safari: reminders need the app on the Home Screen first. */
  | 'needs-install'
  | 'unsupported'
  /** Turned down in the phone's settings - only the phone can undo that. */
  | 'blocked'
  | 'off'
  | 'on';

interface Stored extends ReminderPrefs {
  on: boolean;
}

const DEFAULTS: Stored = { on: false, dayBefore: true, results: true };

function read(): Stored {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Stored>) };
  } catch {
    return DEFAULTS;
  }
}

function write(prefs: Stored) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: they'll be off again next time, which is the safe way round.
  }
}

export function reminderPrefs(): ReminderPrefs {
  const { dayBefore, results } = read();
  return { dayBefore, results };
}

export function pushStatus(): PushStatus {
  if (!SERVER) return 'no-server';
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  if (!('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'blocked';
  return read().on && Notification.permission === 'granted' ? 'on' : 'off';
}

async function call<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${SERVER}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the Matchday server. Check your signal and try again.");
  }
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  // A server from before reminders existed doesn't know these addresses at all.
  if (response.status === 404) throw new Error('Reminders aren’t set up on the Matchday server yet.');
  if (!response.ok) throw new Error(payload.error || `The Matchday server said no (${response.status}).`);
  return payload;
}

let serverKey: Promise<string> | null = null;

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((byte, i) => byte === b[i]);
}

/**
 * This phone's push subscription, made against the server's current key. One
 * made against an older key can't be sent to any more, so it's replaced.
 */
async function subscription(create: boolean): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  // Asked for once a session: it only changes if the server's store is wiped.
  serverKey ??= call<{ publicKey: string }>('/push/key', {}).then((reply) => reply.publicKey);
  const key = keyBytes(await serverKey.catch((error: unknown) => {
    serverKey = null;
    throw error;
  }));
  if (existing && sameKey(existing.options?.applicationServerKey, key)) return existing;
  if (!existing && !create) return null;
  await existing?.unsubscribe();
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

/** Asks the phone for permission - which has to come straight from a tap - and sends today's reminders. */
export async function turnOnReminders(data: { matches: Match[]; competitions: Competition[] }): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked for Matchday. Allow them in the phone’s settings, then try again.'
        : 'Reminders need notifications allowed - tap Allow when the phone asks.',
    );
  }
  const sub = await subscription(true);
  if (!sub) throw new Error('This phone wouldn’t give Matchday a push address.');
  write({ ...read(), on: true });
  forgetSent();
  await syncReminders(data);
}

export async function turnOffReminders(): Promise<void> {
  write({ ...read(), on: false });
  forgetSent();
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return;
  // Clear the server's copy first: it can only be found by the address being given up.
  await call('/push/forget', { subscription: existing.toJSON() }).catch(() => undefined);
  await existing.unsubscribe();
}

export async function setReminderPrefs(prefs: ReminderPrefs, data: { matches: Match[]; competitions: Competition[] }) {
  write({ ...read(), ...prefs });
  await syncReminders(data);
}

export async function sendTestReminder(): Promise<void> {
  const sub = await subscription(false);
  if (!sub) throw new Error('Reminders aren’t on for this phone.');
  await call('/push/test', { subscription: sub.toJSON() });
}

function forgetSent() {
  try {
    localStorage.removeItem(SENT_KEY);
  } catch {
    // Nothing kept, nothing to forget.
  }
}

/** A short fingerprint of a list, so an unchanged one isn't sent again. */
function fingerprint(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${text.length}:${hash >>> 0}`;
}

/**
 * Sends this phone's reminders to the server when they've changed - a fixture
 * added, moved or played. Quietly does nothing while reminders are off.
 */
export async function syncReminders(data: { matches: Match[]; competitions: Competition[] }, now = new Date()): Promise<void> {
  if (pushStatus() !== 'on') return;
  const sub = await subscription(false);
  if (!sub) {
    // The browser dropped the subscription (it does, now and then): ask again next time it's turned on.
    write({ ...read(), on: false });
    return;
  }
  const reminders = reminderSchedule(data.matches, data.competitions, reminderPrefs(), now);
  const json = sub.toJSON();
  const print = fingerprint(JSON.stringify([json.endpoint, reminders]));
  try {
    if (localStorage.getItem(SENT_KEY) === print) return;
  } catch {
    // Can't remember what was sent - send it anyway.
  }
  await call('/push/schedule', { subscription: json, reminders });
  try {
    localStorage.setItem(SENT_KEY, print);
  } catch {
    // Sent, just not remembered.
  }
}
