'use client';
import { Howl, Howler } from 'howler';

const NAMES = ['launch', 'boom', 'coin', 'fanfare', 'fail', 'thud', 'tick', 'click', 'correct'] as const;
export type Sfx = (typeof NAMES)[number];

let bank: Partial<Record<Sfx, Howl>> = {};
let muted = false;

function load() {
  if (typeof window === 'undefined' || Object.keys(bank).length) return;
  try { muted = localStorage.getItem('aswar-muted') === '1'; } catch {}
  Howler.mute(muted);
  bank = Object.fromEntries(NAMES.map((n) => [n, new Howl({ src: [`/sfx/${n}.wav`], volume: n === 'tick' || n === 'click' ? 0.35 : 0.8, preload: true })]));
}

/** تشغيل مؤثر صوتي عبر Howler */
export function play(name: Sfx, opts?: { rate?: number; volume?: number }) {
  load();
  const h = bank[name];
  if (!h) return;
  const id = h.play();
  if (opts?.rate) h.rate(opts.rate, id);
  if (opts?.volume != null) h.volume(opts.volume, id);
}

export const isMuted = () => { load(); return muted; };
export function toggleMute() {
  load();
  muted = !muted;
  Howler.mute(muted);
  try { localStorage.setItem('aswar-muted', muted ? '1' : '0'); } catch {}
  return muted;
}
export function vibrate(p: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(p);
}
