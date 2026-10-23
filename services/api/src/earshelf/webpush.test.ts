import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createPublicKey, verify } from 'node:crypto';
import { b64u, encryptPayload, fromB64u, sendWebPush, vapidHeader } from './webpush.ts';

// The worked example from RFC 8291, section 5 and Appendix A.
const RFC = {
  plaintext: Buffer.from('When I grow up, I want to be a watermelon'),
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  senderPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  header: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
  // the request body as printed in section 5
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

test('encryption matches the RFC 8291 example exactly', () => {
  const out = encryptPayload(RFC.plaintext, { p256dh: RFC.uaPublic, auth: RFC.auth }, { senderPrivate: fromB64u(RFC.senderPrivate), salt: fromB64u(RFC.salt) });
  assert.equal(b64u(out), RFC.body);
  assert.deepEqual(out, Buffer.concat([fromB64u(RFC.header), fromB64u(RFC.ciphertext)]));
  // 86 header + 41 text + 1 delimiter + 16 tag. (The RFC prints Content-Length: 145 above its example, which is one more than the body it shows.)
  assert.equal(out.length, 144);
});

test('with random keys the message still has the right shape and differs every time', () => {
  const a = encryptPayload(Buffer.from('hello'), { p256dh: RFC.uaPublic, auth: RFC.auth });
  const b = encryptPayload(Buffer.from('hello'), { p256dh: RFC.uaPublic, auth: RFC.auth });
  assert.equal(a.length, 86 + 5 + 1 + 16); // header, text, delimiter, tag
  assert.equal(a.readUInt32BE(16), 4096); assert.equal(a[20], 65); assert.equal(a[21], 0x04);
  assert.notDeepEqual(a, b);
});

test('a bad subscription key or a too-long message is refused', () => {
  assert.throws(() => encryptPayload(Buffer.from('x'), { p256dh: 'AAAA', auth: RFC.auth }), /not valid/);
  assert.throws(() => encryptPayload(Buffer.from('x'), { p256dh: RFC.uaPublic, auth: 'AAAA' }), /not valid/);
  // a point that is not on the curve must be rejected rather than used
  const off = Buffer.from(fromB64u(RFC.uaPublic)); off[64] ^= 1;
  assert.throws(() => encryptPayload(Buffer.from('x'), { p256dh: b64u(off), auth: RFC.auth }));
  assert.throws(() => encryptPayload(Buffer.alloc(4000), { p256dh: RFC.uaPublic, auth: RFC.auth }), /too long/);
});

test('the VAPID header carries a valid ES256 signature for the push service address', () => {
  const k = createECDH('prime256v1'); k.generateKeys();
  const vapid = { publicKey: k.getPublicKey('base64url'), privateKey: k.getPrivateKey('base64url'), subject: 'mailto:owner@example.com' };
  const now = Date.parse('2026-10-15T12:00:00Z');
  const h = vapidHeader('https://fcm.googleapis.com/fcm/send/abc', vapid, now);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h)!;
  assert.ok(m); assert.equal(m[4], vapid.publicKey);
  const claims = JSON.parse(fromB64u(m[2]).toString());
  assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: Math.floor(now / 1000) + 43200, sub: 'mailto:owner@example.com' });
  const pub = fromB64u(vapid.publicKey);
  const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
  assert.equal(verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: 'ieee-p1363' }, fromB64u(m[3])), true);
});

test('sending reports success, and a gone subscription is flagged for removal', async () => {
  const k = createECDH('prime256v1'); k.generateKeys();
  const vapid = { publicKey: k.getPublicKey('base64url'), privateKey: k.getPrivateKey('base64url'), subject: 'mailto:o@x.org' };
  const sub = { endpoint: 'https://push.example.net/abc', keys: { p256dh: RFC.uaPublic, auth: RFC.auth } };
  let seen: { headers: Record<string, string>; len: number } | null = null;
  const ok = await sendWebPush(sub, { title: 'Hi' }, vapid, { fetchImpl: (async (_u: unknown, init: RequestInit) => { seen = { headers: init.headers as Record<string, string>, len: (init.body as Buffer).length }; return new Response(null, { status: 201 }); }) as typeof fetch });
  assert.deepEqual(ok, { ok: true });
  assert.equal(seen!.headers['Content-Encoding'], 'aes128gcm'); assert.match(seen!.headers.Authorization, /^vapid t=/); assert.ok(seen!.len > 100);
  const gone = await sendWebPush(sub, { title: 'Hi' }, vapid, { fetchImpl: (async () => new Response(null, { status: 410 })) as typeof fetch });
  assert.deepEqual(gone, { ok: false, gone: true, status: 410 });
  const err = await sendWebPush(sub, { title: 'Hi' }, vapid, { fetchImpl: (async () => new Response(null, { status: 503 })) as typeof fetch });
  assert.deepEqual(err, { ok: false, gone: false, status: 503 });
});
