import { fromB64url, generateVapidKeys, isPushEndpoint, sendPush, type Delivery, type PushTarget, type VapidKeys } from './webpush';

/**
 * Match reminders. The app works out what to say and when - "Tomorrow: vs
 * Oakfield" the evening before, "How did it go?" after full time - and sends
 * the list here whenever the fixtures change. Each phone gets one Durable
 * Object holding its list and an alarm set for the first one due. All this
 * server ever keeps is that list, and it's gone once sent.
 */

/** One reminder, as the app worked it out. */
export interface Reminder {
  /** When to show it, in ms since 1970. */
  at: number;
  title: string;
  body: string;
  /** Where tapping it goes, inside the app. */
  url: string;
  /** A newer one with the same tag replaces it on the phone rather than stacking up. */
  tag: string;
  /** Sends that failed for a reason worth trying again. */
  tries?: number;
}

/** Later than this, a reminder is dropped rather than sent: "tomorrow" a day late helps nobody. */
export const STALE_MS = 3 * 60 * 60 * 1000;
const MAX_REMINDERS = 60;
const HORIZON_MS = 62 * 24 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const MAX_TRIES = 3;

/** A subscription the server can actually send to, or null. */
export function cleanTarget(raw: unknown): PushTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const { endpoint, keys } = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (!isPushEndpoint(endpoint) || !keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return null;
  try {
    if (fromB64url(keys.p256dh).length !== 65 || fromB64url(keys.auth).length !== 16) return null;
  } catch {
    return null;
  }
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');

/** The list as sent, minus anything malformed, long gone or too far off - soonest first. */
export function cleanReminders(raw: unknown, now: number): Reminder[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Reminder[] = [];
  for (const item of raw.slice(0, MAX_REMINDERS * 2)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const at = typeof r.at === 'number' && Number.isFinite(r.at) ? Math.round(r.at) : NaN;
    if (Number.isNaN(at) || at < now - STALE_MS || at > now + HORIZON_MS) continue;
    const title = text(r.title, 80).trim();
    if (!title) continue;
    const url = text(r.url, 200);
    out.push({
      at,
      title,
      body: text(r.body, 200),
      // Only somewhere inside the app.
      url: url.startsWith('./') || url.startsWith('?') ? url : './',
      tag: text(r.tag, 64) || `r${at}`,
    });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_REMINDERS);
}

type Message =
  | { action: 'vapid' }
  | { action: 'schedule'; target: PushTarget; reminders: Reminder[]; vapid: VapidKeys; subject: string }
  | { action: 'test'; target: PushTarget; vapid: VapidKeys; subject: string }
  | { action: 'forget' };

/**
 * One per phone, named from its push address - plus one, named "vapid", that
 * makes the server's signing key the first time it's asked and keeps it.
 */
export class PushStore {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const message = (await request.json()) as Message;
    const storage = this.state.storage;
    switch (message.action) {
      case 'vapid': {
        let keys = await storage.get<VapidKeys>('vapid');
        if (!keys) {
          keys = await generateVapidKeys();
          await storage.put('vapid', keys);
        }
        return Response.json(keys);
      }
      case 'schedule': {
        await storage.put({ target: message.target, reminders: message.reminders, vapid: message.vapid, subject: message.subject });
        return Response.json({ next: await this.arm(message.reminders) });
      }
      case 'test': {
        const delivery = await sendPush(
          message.target,
          { title: 'Matchday', body: "Reminders are on. You'll hear from us the evening before each match.", url: './', tag: 'test' },
          message.vapid,
          message.subject,
          600,
        );
        if (delivery.gone) await this.forget();
        return Response.json(delivery);
      }
      case 'forget':
        await this.forget();
        return Response.json({ ok: true });
      default:
        return new Response('Unknown action', { status: 400 });
    }
  }

  private async forget() {
    await this.state.storage.deleteAlarm();
    await this.state.storage.deleteAll();
  }

  /** Sets the alarm for the first reminder still to come, or clears it when there's none. */
  private async arm(reminders: Reminder[]): Promise<number | null> {
    const next = reminders.reduce<number | null>((soonest, r) => (soonest === null || r.at < soonest ? r.at : soonest), null);
    if (next === null) await this.state.storage.deleteAlarm();
    else await this.state.storage.setAlarm(Math.max(next, Date.now()));
    return next;
  }

  async alarm(): Promise<void> {
    const storage = this.state.storage;
    const [target, reminders, vapid, subject] = await Promise.all([
      storage.get<PushTarget>('target'),
      storage.get<Reminder[]>('reminders'),
      storage.get<VapidKeys>('vapid'),
      storage.get<string>('subject'),
    ]);
    if (!target || !reminders || !vapid || !subject) return;

    const now = Date.now();
    const keep: Reminder[] = [];
    for (const reminder of reminders) {
      if (reminder.at > now) {
        keep.push(reminder);
        continue;
      }
      const late = now - reminder.at;
      if (late > STALE_MS) continue;
      let delivery: Delivery;
      try {
        delivery = await sendPush(
          target,
          { title: reminder.title, body: reminder.body, url: reminder.url, tag: reminder.tag },
          vapid,
          subject,
          (STALE_MS - late) / 1000,
        );
      } catch {
        delivery = { status: 0, gone: false };
      }
      // Unsubscribed, or the browser threw the subscription away: nothing more to send, ever.
      if (delivery.gone) return this.forget();
      // The push service was busy or out of reach - another go in a few minutes.
      const worthRetrying = delivery.status === 0 || delivery.status === 429 || delivery.status >= 500;
      if (worthRetrying && (reminder.tries ?? 0) < MAX_TRIES) {
        keep.push({ ...reminder, at: now + RETRY_MS, tries: (reminder.tries ?? 0) + 1 });
      }
    }
    await storage.put('reminders', keep);
    await this.arm(keep);
  }
}

export interface PushEnv {
  /** The PushStore namespace. Missing until the worker is redeployed with it. */
  PUSH?: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
  /** Who to contact about these pushes, for the push services - a mailto: or https: address. */
  PUSH_CONTACT?: string;
}

async function ask(stub: DurableObjectStub, message: Message): Promise<Response> {
  return stub.fetch('https://push.internal/', { method: 'POST', body: JSON.stringify(message) });
}

async function deviceName(endpoint: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));
  return `device:${[...digest].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** The contact the push services see: set explicitly, or the app's own address. */
function contactFor(env: PushEnv): string {
  if (env.PUSH_CONTACT && /^(mailto:|https:\/\/)/.test(env.PUSH_CONTACT)) return env.PUSH_CONTACT;
  const origin = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).find((o) => o.startsWith('https://'));
  return origin ?? 'mailto:reminders@matchday.invalid';
}

/** /push/key, /push/schedule, /push/test and /push/forget. */
export async function handlePush(
  path: string,
  payload: Record<string, unknown>,
  env: PushEnv,
  reply: (body: unknown, status: number) => Response,
): Promise<Response> {
  if (!env.PUSH) return reply({ error: 'Reminders are not switched on for this server yet.' }, 501);
  const keys = (await (await ask(env.PUSH.get(env.PUSH.idFromName('vapid')), { action: 'vapid' })).json()) as VapidKeys;
  if (path.endsWith('/push/key')) return reply({ publicKey: keys.publicKey }, 200);

  const target = cleanTarget(payload.subscription);
  if (!target) return reply({ error: "This phone's notification details didn't work. Turn reminders off and on again." }, 400);
  const device = env.PUSH.get(env.PUSH.idFromName(await deviceName(target.endpoint)));
  const subject = contactFor(env);

  if (path.endsWith('/push/schedule')) {
    const reminders = cleanReminders(payload.reminders, Date.now());
    if (!reminders) return reply({ error: 'Bad request.' }, 400);
    const { next } = (await (await ask(device, { action: 'schedule', target, reminders, vapid: keys, subject })).json()) as {
      next: number | null;
    };
    return reply({ count: reminders.length, next }, 200);
  }
  if (path.endsWith('/push/test')) {
    const delivery = (await (await ask(device, { action: 'test', target, vapid: keys, subject })).json()) as Delivery;
    return delivery.status >= 200 && delivery.status < 300
      ? reply({ sent: true }, 200)
      : reply({ error: `The phone's push service turned it down (${delivery.status}). Turn reminders off and on again.` }, 502);
  }
  if (path.endsWith('/push/forget')) {
    await ask(device, { action: 'forget' });
    return reply({ ok: true }, 200);
  }
  return reply({ error: 'Unknown endpoint.' }, 404);
}
