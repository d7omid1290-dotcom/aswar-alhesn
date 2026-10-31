import { Howl, Howler } from 'howler';

// مؤثرات صوتية أصلية مولدة (scripts/make-sfx.mjs) تُشغّل عبر Howler.js
const NAMES = ['click', 'tick', 'countdown', 'go', 'steam', 'launch', 'explosion', 'thud', 'correct', 'wrong', 'reveal', 'king', 'win', 'start'] as const;
export type Sfx = (typeof NAMES)[number];
const cache = new Map<Sfx, Howl>();
let muted = false;
try { muted = localStorage.getItem('aswar:muted') === '1'; } catch { /* */ }

function get(n: Sfx) {
  let h = cache.get(n);
  if (!h) { h = new Howl({ src: [`/sfx/${n}.wav`], preload: true }); cache.set(n, h); }
  return h;
}
export const sound = {
  play(n: Sfx, vol = 1) { if (muted) return; try { const h = get(n); const id = h.play(); h.volume(vol, id); } catch { /* */ } },
  setVolume(v: number) { Howler.volume(Math.max(0, Math.min(1, v))); },
  get muted() { return muted; },
  setMuted(v: boolean) { muted = v; Howler.mute(v); try { localStorage.setItem('aswar:muted', v ? '1' : '0'); } catch { /* */ } },
  preload() { NAMES.forEach(get); },
};
