import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto';

// Web Push without a library: message encryption (RFC 8291, "aes128gcm" from RFC 8188) and the VAPID sender identity (RFC 8292).
// Only Node's built-in crypto is used. webpush.test.ts checks the output byte for byte against the example in RFC 8291.

export const b64u = (b: Uint8Array | Buffer): string => Buffer.from(b).toString('base64url');
export const fromB64u = (s: string): Buffer => Buffer.from(s, 'base64url');

export interface Subscription { endpoint: string; keys: { p256dh: string; auth: string } }
export interface Vapid { publicKey: string; privateKey: string; subject: string }

/** Encrypts a push message for one subscription. The sender key and salt are random unless a test supplies them. */
export function encryptPayload(plaintext: Buffer, sub: Subscription['keys'], fixed?: { senderPrivate: Buffer; salt: Buffer }): Buffer {
  const uaPublic = fromB64u(sub.p256dh);
  const auth = fromB64u(sub.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04 || auth.length !== 16) throw new Error('That push subscription is not valid.');
  if (plaintext.length > 3993) throw new Error('The message is too long for a push notification.');

  const sender = createECDH('prime256v1');
  if (fixed) sender.setPrivateKey(fixed.senderPrivate); else sender.generateKeys();
  const asPublic = sender.getPublicKey(); // 65 bytes, uncompressed
  const ecdh = sender.computeSecret(uaPublic); // throws unless the receiver's key is a point on the P-256 curve, as the RFC requires
  const salt = fixed?.salt ?? randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', ecdh, auth, keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([0x02])])), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, body]);
}

/** The Authorization header that identifies this server to the push service. */
export function vapidHeader(endpoint: string, vapid: Vapid, now = Date.now()): string {
  const pub = fromB64u(vapid.publicKey);
  const key = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: vapid.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject };
  const input = `${b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))}.${b64u(Buffer.from(JSON.stringify(claims)))}`;
  const sig = sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${input}.${b64u(sig)}, k=${vapid.publicKey}`;
}

export type SendResult = { ok: true } | { ok: false; gone: boolean; status: number };

/** Sends one notification. `gone` is true when the push service says the subscription no longer exists, so it should be forgotten. */
export async function sendWebPush(sub: Subscription, message: unknown, vapid: Vapid, opts: { ttlSeconds?: number; fetchImpl?: typeof fetch } = {}): Promise<SendResult> {
  const body = encryptPayload(Buffer.from(JSON.stringify(message)), sub.keys);
  const res = await (opts.fetchImpl ?? fetch)(sub.endpoint, {
    method: 'POST',
    headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(opts.ttlSeconds ?? 6 * 3600), Urgency: 'normal', Authorization: vapidHeader(sub.endpoint, vapid) },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(15000),
  });
  if (res.status >= 200 && res.status < 300) return { ok: true };
  return { ok: false, gone: res.status === 404 || res.status === 410, status: res.status };
}
