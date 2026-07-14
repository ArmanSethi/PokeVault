/**
 * Pack-reveal sound effects — synthesized with the Web Audio API (no bundled binary, offline-safe,
 * no licensing). A soft whoosh on each card reveal; an original celebratory "jackpot" flourish on
 * the final hit card. Played on a user gesture (opening the pack / swiping), so there are no
 * autoplay issues.
 *
 * The mute preference persists in localStorage (`pv-sim-muted`) — the app's established pattern for
 * UI prefs — and is exposed as a tiny external store so a toggle button stays in sync.
 */

import { useSyncExternalStore } from "react";

const KEY = "pv-sim-muted";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let muted = read();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
  listeners.forEach((l) => l());
}

export function toggleMuted(): void {
  setMuted(!muted);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive mute state for the toggle button. */
export function useMuted(): boolean {
  return useSyncExternalStore(subscribe, isMuted, isMuted);
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(
  ac: AudioContext,
  type: OscillatorType,
  from: number,
  to: number,
  start: number,
  dur: number,
  peak: number,
): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** A short, dry click for each card flip. */
export function playFlip(): void {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  blip(ac, "triangle", 520, 180, ac.currentTime, 0.08, 0.16);
}

// A short burst of white noise, cached per audio context — the raw material for the whoosh.
let noiseBuf: AudioBuffer | null = null;
function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const len = Math.floor(ac.sampleRate * 0.3);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

/** A soft "card whoosh" for each flip: filtered noise with a quick swell and a downward
 * band-pass sweep, like a card cutting the air. Governed by the same mute toggle. */
export function playWhoosh(): void {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(2600, t);
  bp.frequency.exponentialRampToValueAtTime(650, t + 0.18);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.13, t + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  src.connect(bp).connect(gain).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.24);
}

/** A rising chime for the hit finale — five notes climbing with a swelling volume (crescendo)
 * and a shimmer note on top. Kept to ~1s so ripping many packs doesn't get tiring. */
export function playChime(): void {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51]; // C5 · E5 · G5 · C6 · E6 — rising
  notes.forEach((f, i) => blip(ac, "sine", f, f, t + i * 0.1, 0.55, 0.11 + i * 0.03)); // swell
  blip(ac, "triangle", 1567.98, 1567.98, t + notes.length * 0.1, 0.55, 0.14); // G6 sparkle tail
}

/**
 * A celebratory, jackpot-style "big win" flourish for the final hit card: a fast rising build
 * (accelerating arpeggio + a noise riser sweeping up) that LANDS on a bright major-chord sting
 * with a shimmer tail. Evokes a slots/lottery win — but is wholly synthesized from oscillators
 * and noise here, so it's an original asset and imitates no real, copyrighted, or branded jingle.
 * Kept to ~0.8s so ripping many packs stays snappy. Governed by the same mute toggle.
 */
export function playJackpot(): void {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;

  // 1) Rising build — an accelerating arpeggio climbing ~an octave and a half into the sting.
  const build = [392.0, 523.25, 659.25, 783.99, 1046.5, 1318.51]; // G4 → E6, ascending
  const step = 0.05;
  build.forEach((f, i) => blip(ac, "square", f, f, t + i * step, 0.09, 0.045 + i * 0.01));
  const land = t + build.length * step; // ~0.30s: the moment the win "hits"

  // 2) Landing sting — a bright C-major chord across two octaves, with a low root for body.
  [523.25, 659.25, 783.99, 1046.5].forEach((f) => blip(ac, "sawtooth", f, f, land, 0.5, 0.07));
  blip(ac, "triangle", 261.63, 261.63, land, 0.5, 0.1); // C4 root

  // 3) Shimmer tail — high sparkle notes gliding/twinkling out over the sting.
  blip(ac, "sine", 1567.98, 2093.0, land + 0.06, 0.45, 0.08); // G6 → C7 glide
  blip(ac, "triangle", 2637.02, 2637.02, land + 0.14, 0.32, 0.05); // E7 twinkle

  // 4) A quiet filtered-noise riser under the build, sweeping up into the sting for excitement.
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.7;
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.exponentialRampToValueAtTime(4000, land); // sweep up to the hit
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, land);
  g.gain.exponentialRampToValueAtTime(0.0001, land + 0.2);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.3); // noise buffer is 0.3s
}
