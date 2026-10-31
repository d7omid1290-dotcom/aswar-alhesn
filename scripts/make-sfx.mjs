// يولد المؤثرات الصوتية الأصلية للعبة (WAV) دون أي أصول خارجية: node scripts/make-sfx.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
const SR = 22050;
mkdirSync('public/sfx', { recursive: true });
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function wav(name, samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const k = peak > 0 ? 0.89 / peak : 1;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s * k * 32767))), 44 + i * 2));
  writeFileSync(`public/sfx/${name}.wav`, buf);
}
const make = (sec, fn) => Array.from({ length: Math.floor(sec * SR) }, (_, i) => fn(i / SR, i));
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
function lowpass(arr, cut) { const rc = 1 / (2 * Math.PI * cut), dt = 1 / SR, al = dt / (rc + dt); let y = 0; return arr.map((x) => (y += al * (x - y))); }
function reverb(arr, mix = 0.3) {
  const out = arr.slice(); const taps = [[0.031, 0.5], [0.047, 0.4], [0.071, 0.33], [0.113, 0.25], [0.163, 0.18]];
  for (const [d, g] of taps) { const n = Math.floor(d * SR); for (let i = n; i < out.length; i++) out[i] += out[i - n] * g * mix; }
  return out;
}
const tone = (f, t) => Math.sin(2 * Math.PI * f * t);
const brass = (f, t) => tone(f, t) * 0.6 + tone(f * 2, t) * 0.3 + tone(f * 3, t) * 0.18 + tone(f * 4, t) * 0.08;

wav('click', make(0.06, (t) => tone(1800, t) * env(t, 0.002, 0.012) * 0.6));
wav('tick', make(0.08, (t) => (tone(1200, t) + tone(2400, t) * 0.3) * env(t, 0.001, 0.02)));
wav('countdown', reverb(make(0.5, (t) => (tone(880, t) * 0.7 + tone(1760, t) * 0.2) * env(t, 0.004, 0.12)), 0.4));
wav('go', reverb(make(0.8, (t) => (tone(1320, t) * 0.7 + tone(660, t) * 0.4) * env(t, 0.004, 0.25)), 0.4));
// بخار الوقود: هسهسة
wav('steam', lowpass(make(1.6, (t) => rnd() * (t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 1.45)) * 0.8), 5000));
// الإطلاق: هدير منخفض متصاعد مع صفير
{
  const n = make(3.2, (t) => rnd());
  const low = lowpass(n, 220), mid = lowpass(n, 1400);
  wav('launch', low.map((x, i) => {
    const t = i / SR; const e = Math.min(1, t / 0.25) * (t > 2.4 ? Math.max(0, 1 - (t - 2.4) / 0.8) : 1);
    return (x * 3.2 + mid[i] * 0.9 * Math.min(1, t / 1.2) + tone(90 + t * 40, t) * 0.25) * e;
  }));
}
// انفجار: نقرة صدمة + ضوضاء مخففة تتلاشى + طنين منخفض
{
  const n = make(2.6, () => rnd());
  const lp = lowpass(n, 600), lp2 = lowpass(n, 160);
  wav('explosion', reverb(lp.map((x, i) => {
    const t = i / SR;
    return x * 1.6 * env(t, 0.004, 0.35) + lp2[i] * 4 * env(t, 0.01, 0.9) + tone(48, t) * env(t, 0.005, 0.5) * 0.8 + (t < 0.01 ? rnd() : 0);
  }), 0.35));
}
// ضربة في فراغ: صوت ارتطام بالتراب
{
  const n = make(1.2, () => rnd());
  const lp = lowpass(n, 400);
  wav('thud', lp.map((x, i) => { const t = i / SR; return x * 2.5 * env(t, 0.004, 0.25) + tone(60, t) * env(t, 0.003, 0.18); }));
}
// إجابة صحيحة: نغمات صاعدة
wav('correct', reverb(make(0.9, (t) => {
  const notes = [523.25, 659.25, 783.99, 1046.5]; let s = 0;
  notes.forEach((f, k) => { const st = k * 0.09; if (t >= st) s += brass(f, t - st) * env(t - st, 0.01, 0.3) * 0.5; });
  return s;
}), 0.45));
// خطأ: نغمتان نازلتان
wav('wrong', reverb(make(0.8, (t) => {
  const f = t < 0.25 ? 311 : 233; const tt = t < 0.25 ? t : t - 0.25;
  return (tone(f, t) * 0.6 + tone(f * 1.5, t) * 0.2 + Math.sign(tone(f, t)) * 0.08) * env(tt, 0.01, 0.2);
}), 0.3));
// كشف العنصر: لمعان
wav('reveal', reverb(make(1.2, (t) => {
  let s = 0; for (let k = 0; k < 6; k++) { const st = k * 0.05; if (t >= st) s += tone(1046.5 * Math.pow(1.122, k), t) * env(t - st, 0.005, 0.25) * 0.25; }
  return s;
}), 0.6));
// سقوط الملك: نفير نحاسي حزين وطبل
wav('king', reverb(make(3.2, (t) => {
  const seq = [[0, 392], [0.45, 349.23], [0.9, 311.13], [1.5, 261.63]]; let s = 0;
  for (const [st, f] of seq) if (t >= st) s += brass(f, t - st) * env(t - st, 0.04, st === 1.5 ? 0.9 : 0.35) * 0.45;
  s += tone(55, t) * env(t, 0.005, 0.3) * 0.9 + tone(55, t - 1.5) * (t > 1.5 ? env(t - 1.5, 0.005, 0.4) : 0);
  return s;
}), 0.5));
// الفوز: فانفار
wav('win', reverb(make(3.4, (t) => {
  const seq = [[0, 523.25, 0.18], [0.2, 523.25, 0.18], [0.4, 523.25, 0.18], [0.6, 659.25, 0.5], [1.2, 587.33, 0.2], [1.45, 659.25, 0.2], [1.7, 783.99, 1.1]]; let s = 0;
  for (const [st, f, d] of seq) if (t >= st) s += brass(f, t - st) * env(t - st, 0.02, d) * 0.4;
  return s + tone(65.4, t) * env(t, 0.01, 0.4) * 0.6;
}), 0.55));
// بداية المباراة: طبول
wav('start', reverb(make(2.0, (t) => {
  let s = 0; for (const st of [0, 0.3, 0.6, 0.75, 0.9]) if (t >= st) { const tt = t - st; s += (tone(70 - tt * 40, tt) * 0.9 + rnd() * 0.25) * env(tt, 0.002, 0.15); }
  return s;
}), 0.5));
console.log('sfx ok');
