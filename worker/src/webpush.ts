/**
 * Web Push with nothing but WebCrypto, so it runs in a Worker with no
 * libraries: the VAPID signature that tells a push service this server is
 * allowed to send to the phone (RFC 8292), and the encryption that means only
 * the phone can read what's sent (RFC 8291, the aes128gcm coding of RFC 8188).
 */

/** What a browser hands over from pushManager.subscribe(), as JSON. */
export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** The server's signing key: the public half goes to the app, the private half never leaves. */
export interface VapidKeys {
  /** The P-256 public key as an uncompressed point, base64url - the app's applicationServerKey. */
  publicKey: string;
  privateJwk: JsonWebKey;
}

const encoder = new TextEncoder();

export function b64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = (await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer;
  const privateJwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  return { publicKey: b64url(raw), privateJwk };
}

/**
 * The Authorization header for one push: a JWT for the push service's origin,
 * signed with the VAPID key, valid for 12 hours (the spec allows up to 24).
 */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const header = b64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })),
  );
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto signs ECDSA as r||s, which is exactly what a JWS wants.
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

export interface EncryptOptions {
  /** Fixed only to check against the RFC's worked example - a fresh pair is made per message otherwise. */
  senderKeys?: CryptoKeyPair;
  salt?: Uint8Array;
}

/**
 * The message as the phone will receive it: a one-off key agreed between a
 * throwaway key pair and the phone's own key, mixed with the phone's auth
 * secret, sealed with AES-128-GCM as a single record.
 */
export async function encryptPayload(target: PushTarget, plaintext: Uint8Array, options: EncryptOptions = {}): Promise<Uint8Array> {
  const uaPublic = fromB64url(target.keys.p256dh);
  const authSecret = fromB64url(target.keys.auth);
  const sender =
    options.senderKeys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', sender.publicKey)) as ArrayBuffer);
  const phoneKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // The Workers types spell this field $public (escaping a reserved word); at runtime it's `public`, as everywhere.
  const agree = { name: 'ECDH', public: phoneKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const shared = new Uint8Array(await crypto.subtle.deriveBits(agree, sender.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  // One record, so it ends with the last-record delimiter and no padding.
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));

  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, sealed);
}

/** The push services browsers actually use. Anything else is refused, so the server can't be pointed at an arbitrary URL. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /\.push\.apple\.com$/,
  /\.notify\.windows\.com$/,
];

export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

export interface Delivery {
  status: number;
  /** The phone has unsubscribed, or the subscription expired: stop sending to it. */
  gone: boolean;
}

/** Sends one notification. `ttl` is how long the push service may hold it for a phone that's off. */
export async function sendPush(
  target: PushTarget,
  message: unknown,
  keys: VapidKeys,
  subject: string,
  ttlSeconds: number,
): Promise<Delivery> {
  const body = await encryptPayload(target, encoder.encode(JSON.stringify(message)));
  const response = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(target.endpoint, keys, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(Math.max(0, Math.round(ttlSeconds))),
      Urgency: 'high',
    },
    body,
  });
  return { status: response.status, gone: response.status === 404 || response.status === 410 };
}
