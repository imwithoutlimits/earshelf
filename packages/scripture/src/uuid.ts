/** Shared tables key items by uuid, so a passage gets a stable uuid derived from its canonical reference (UUID v5, pure JS so it runs in the browser and in tests). */
const NS = '6f1d3a52-7c0e-4b8a-9d41-5e2a8b7c3f10';
function sha1(bytes: number[]): number[] {
  const rol = (n: number, s: number) => ((n << s) | (n >>> (32 - s))) >>> 0;
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const len = bytes.length;
  const m = bytes.slice(); m.push(0x80);
  while (m.length % 64 !== 56) m.push(0);
  const hi = Math.floor((len * 8) / 0x100000000), lo = (len * 8) >>> 0;
  for (const v of [hi, lo]) m.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  for (let i = 0; i < m.length; i += 64) {
    const w: number[] = [];
    for (let t = 0; t < 16; t++) w[t] = ((m[i + 4 * t] << 24) | (m[i + 4 * t + 1] << 16) | (m[i + 4 * t + 2] << 8) | m[i + 4 * t + 3]) >>> 0;
    for (let t = 16; t < 80; t++) w[t] = rol(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let [a, b, c, d, e] = h;
    for (let t = 0; t < 80; t++) {
      const [f, k] = t < 20 ? [(b & c) | (~b & d), 0x5a827999] : t < 40 ? [b ^ c ^ d, 0x6ed9eba1] : t < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6];
      const tmp = (rol(a, 5) + (f >>> 0) + e + k + w[t]) >>> 0;
      e = d; d = c; c = rol(b, 30); b = a; a = tmp;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0; h[4] = (h[4] + e) >>> 0;
  }
  return h.flatMap((x) => [(x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255]);
}
const utf8 = (s: string) => Array.from(new TextEncoder().encode(s));
const hexToBytes = (u: string) => u.replace(/-/g, '').match(/../g)!.map((x) => parseInt(x, 16));
export function uuid5(name: string, ns: string = NS): string {
  const d = sha1([...hexToBytes(ns), ...utf8(name)]).slice(0, 16);
  d[6] = (d[6] & 0x0f) | 0x50; d[8] = (d[8] & 0x3f) | 0x80;
  const x = d.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
export const passageId = (refKey: string): string => uuid5(`passage:${refKey}`);
export { uuid5 as _uuid5 };
