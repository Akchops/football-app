import { describe, expect, it } from 'vitest';
import { b64url, encryptPayload, fromB64url, generateVapidKeys, isPushEndpoint, vapidAuthorization } from './webpush';

// RFC 8291 section 5: the worked example, every input fixed.
const RFC = {
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  plaintext: 'When I grow up, I want to be a watermelon',
  message:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

const subtle = crypto.subtle;
const ecdhJwk = (publicKey: string, d?: string) => {
  const raw = fromB64url(publicKey);
  return { kty: 'EC', crv: 'P-256', x: b64url(raw.slice(1, 33)), y: b64url(raw.slice(33, 65)), ...(d ? { d } : {}), ext: true };
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: string | Uint8Array, bytes: number) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const infoBytes = typeof info === 'string' ? new TextEncoder().encode(info) : info;
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: infoBytes }, key, bytes * 8));
}

/** What the phone does on receiving it - written from the receiving side, to check the sending side. */
async function open(message: Uint8Array, uaPublic: string, uaPrivate: string, auth: string): Promise<string> {
  const salt = message.slice(0, 16);
  const idLength = message[20];
  const asPublic = message.slice(21, 21 + idLength);
  const sealed = message.slice(21 + idLength);
  const mine = await subtle.importKey('jwk', ecdhJwk(uaPublic, uaPrivate), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const theirs = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: theirs } as never, mine, 256));
  const ua = fromB64url(uaPublic);
  const info = new Uint8Array([...new TextEncoder().encode('WebPush: info\0'), ...ua, ...asPublic]);
  const ikm = await hkdf(fromB64url(auth), shared, info, 32);
  const cek = await hkdf(salt, ikm, 'Content-Encoding: aes128gcm\0', 16);
  const nonce = await hkdf(salt, ikm, 'Content-Encoding: nonce\0', 12);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, sealed));
  // The last record ends at its 0x02 delimiter.
  return new TextDecoder().decode(padded.slice(0, padded.lastIndexOf(2)));
}

describe('encryptPayload', () => {
  it("matches RFC 8291's worked example byte for byte", async () => {
    const privateKey = await subtle.importKey('jwk', ecdhJwk(RFC.asPublic, RFC.asPrivate), { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const publicKey = await subtle.importKey('raw', fromB64url(RFC.asPublic), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    const sealed = await encryptPayload(
      { endpoint: 'https://push.example.net/x', keys: { p256dh: RFC.uaPublic, auth: RFC.auth } },
      new TextEncoder().encode(RFC.plaintext),
      { senderKeys: { privateKey, publicKey }, salt: fromB64url(RFC.salt) },
    );
    expect(b64url(sealed)).toBe(RFC.message);
  });

  it('can be opened by the phone it was sealed for, and only that phone', async () => {
    const phone = (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const p256dh = b64url((await subtle.exportKey('raw', phone.publicKey)) as ArrayBuffer);
    const d = ((await subtle.exportKey('jwk', phone.privateKey)) as JsonWebKey).d!;
    const auth = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const text = JSON.stringify({ title: 'Tomorrow: vs Oakfield', body: 'Kick-off 10:30 AM · Riverside Park' });
    const sealed = await encryptPayload({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh, auth } }, new TextEncoder().encode(text));
    expect(await open(sealed, p256dh, d, auth)).toBe(text);
    // A fresh key pair and salt every time: the same words never look the same twice.
    const again = await encryptPayload({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh, auth } }, new TextEncoder().encode(text));
    expect(b64url(again)).not.toBe(b64url(sealed));
    // Someone else's auth secret gets nothing.
    await expect(open(sealed, p256dh, d, b64url(new Uint8Array(16)))).rejects.toThrow();
  });
});

describe('vapidAuthorization', () => {
  it('signs a JWT for the push service with the key it hands over', async () => {
    const keys = await generateVapidKeys();
    const header = await vapidAuthorization('https://web.push.apple.com/abc', keys, 'https://akchops.github.io', Date.UTC(2026, 9, 6));
    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(k).toBe(keys.publicKey);
    const [h, c, signature] = token.split('.');
    expect(JSON.parse(new TextDecoder().decode(fromB64url(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(new TextDecoder().decode(fromB64url(c)))).toEqual({
      aud: 'https://web.push.apple.com',
      exp: Date.UTC(2026, 9, 6) / 1000 + 12 * 3600,
      sub: 'https://akchops.github.io',
    });
    const verify = await subtle.importKey('raw', fromB64url(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const valid = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verify, fromB64url(signature), new TextEncoder().encode(`${h}.${c}`));
    expect(valid).toBe(true);
  });
});

describe('isPushEndpoint', () => {
  it('accepts the push services browsers use', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/QH4sK',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ]) {
      expect(isPushEndpoint(endpoint)).toBe(true);
    }
  });

  it('refuses anything else, so the server cannot be aimed at another site', () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://evil.example.com/fcm.googleapis.com',
      'https://fcm.googleapis.com.evil.example/x',
      'https://localhost:8787/x',
      'not a url',
      42,
    ]) {
      expect(isPushEndpoint(endpoint)).toBe(false);
    }
  });
});
