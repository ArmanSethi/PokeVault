/**
 * Pack-reveal sound effects — synthesized with the Web Audio API (no bundled binary, offline-safe,
 * no licensing). A short click on each flip; a rising chime on the finale. Played only on a user
 * gesture (the tap that flips), so there are no autoplay issues.
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

/** A rising chime for the hit finale. */
export function playChime(): void {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 · E5 · G5 · C6 — rising
  notes.forEach((f, i) => blip(ac, "sine", f, f, ac.currentTime + i * 0.09, 0.5, 0.22));
}
