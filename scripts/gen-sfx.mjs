// يولّد المؤثرات الصوتية (WAV) برمجيًا: node scripts/gen-sfx.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
const SR = 22050;
const out = new URL('../public/sfx/', import.meta.url);
mkdirSync(out, { recursive: true });

function wav(name, samples) {
  const n = samples.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let peak = 0; for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const g = peak > 0 ? 0.9 / peak : 1;
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * g)) * 32767), 44 + i * 2));
  writeFileSync(new URL(name + '.wav', out), buf);
}
const len = (sec) => new Float32Array(Math.floor(SR * sec));
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

// صفير القذيفة: ضجيج مرشّح بتردد صاعد
function launch() { const a = len(0.9); let lp = 0; for (let i = 0; i < a.length; i++) { const t = i / a.length; const k = 0.02 + t * 0.25; lp += k * (rnd() - lp); a[i] = lp * Math.sin(Math.PI * t) * 1.2 + Math.sin(2 * Math.PI * (300 + 900 * t) * i / SR) * 0.15 * t; } return a; }
// انفجار: ضجيج منخفض + نبضة جهيرة
function boom() { const a = len(1.6); let lp = 0; for (let i = 0; i < a.length; i++) { const t = i / SR; const env = Math.exp(-t * 3.2); lp += (0.08 * Math.exp(-t * 2) + 0.01) * (rnd() - lp); a[i] = lp * env * 3 + Math.sin(2 * Math.PI * (70 * Math.exp(-t * 1.5)) * t) * Math.exp(-t * 4) * 0.9; } return a; }
function tone(freqs, step, dur, type = 'sine', vol = 1) {
  const a = len(step * freqs.length + dur);
  freqs.forEach((f, k) => { const s0 = Math.floor(k * step * SR); for (let i = 0; i < dur * SR && s0 + i < a.length; i++) { const t = i / SR; const ph = 2 * Math.PI * f * t; const w = type === 'square' ? Math.sign(Math.sin(ph)) * 0.5 : type === 'tri' ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : Math.sin(ph); a[s0 + i] += w * Math.exp(-t * 6) * Math.min(1, t * 200) * vol; } });
  return a;
}
function fail() { const a = len(0.7); for (let i = 0; i < a.length; i++) { const t = i / SR; const f = 320 * Math.exp(-t * 1.6); a[i] = (Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.4 + Math.sin(2 * Math.PI * f * 0.5 * t) * 0.5) * Math.exp(-t * 3); } return a; }
function thud() { const a = len(0.5); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = Math.sin(2 * Math.PI * 140 * Math.exp(-t * 3) * t) * Math.exp(-t * 9) + rnd() * 0.15 * Math.exp(-t * 20); } return a; }

wav('launch', launch());
wav('boom', boom());
wav('coin', tone([988, 1319, 1568, 2093], 0.07, 0.35, 'tri'));
wav('fanfare', tone([392, 523, 659, 784, 659, 784, 1047, 1047], 0.13, 0.45, 'square', 0.6));
wav('fail', fail());
wav('thud', thud());
wav('tick', tone([1200], 0, 0.06, 'square', 0.4));
wav('click', tone([760], 0, 0.05, 'tri'));
wav('correct', tone([523, 659, 784], 0.09, 0.3, 'tri'));
console.log('sfx ok');
