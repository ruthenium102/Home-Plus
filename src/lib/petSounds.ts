// Cute pet interaction sounds, synthesised with the Web Audio API so there are
// no audio asset files to bundle and it works the same in the browser and the
// iOS WKWebView. Every sound is triggered from a tap (feed/water/pat/play/…),
// which satisfies the iOS autoplay policy: we lazily create/resume the shared
// AudioContext inside that user gesture.

import { storage } from '@/lib/storage';

export type PetSound = 'pat' | 'feed' | 'water' | 'play' | 'reward' | 'catch' | 'evolve';

const MUTE_KEY = 'pet:soundMuted';
let muted = storage.get<boolean>(MUTE_KEY, false);

export function isPetSoundMuted(): boolean {
  return muted;
}

/** Toggle (or set) mute; persisted. Returns the new muted state. */
export function setPetSoundMuted(next?: boolean): boolean {
  muted = next ?? !muted;
  storage.set(MUTE_KEY, muted);
  return muted;
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  // Safari/WKWebView suspends the context until a gesture resumes it.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  from: number; // start frequency (Hz)
  to?: number; // glide-to frequency; omitted = steady
  dur: number; // seconds
  gain?: number; // peak gain (0..1); kept low so layered tones don't clip
  delay?: number; // seconds after now
}

function tone(ac: AudioContext, { type = 'sine', from, to, dur, gain = 0.12, delay = 0 }: ToneOpts) {
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to && to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  // Quick attack, exponential decay — a soft, plucky envelope. exp ramps can't
  // hit 0, so we floor at a tiny value.
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** Play a short, cute sound for a pet interaction. No-op when muted. */
export function playPetSound(sound: PetSound) {
  if (muted) return;
  const ac = getCtx();
  if (!ac) return;
  switch (sound) {
    case 'pat': // happy rising two-note chirp ("boo-eep!")
      tone(ac, { type: 'sine', from: 520, to: 880, dur: 0.12, gain: 0.12 });
      tone(ac, { type: 'sine', from: 760, to: 1200, dur: 0.10, gain: 0.08, delay: 0.09 });
      break;
    case 'feed': // two soft, low "nom nom" blips
      tone(ac, { type: 'triangle', from: 300, to: 170, dur: 0.09, gain: 0.17 });
      tone(ac, { type: 'triangle', from: 320, to: 180, dur: 0.09, gain: 0.15, delay: 0.13 });
      break;
    case 'water': // a single falling water droplet "bloop"
      tone(ac, { type: 'sine', from: 950, to: 300, dur: 0.16, gain: 0.13 });
      break;
    case 'play': // bouncy "boing" (up then down)
      tone(ac, { type: 'sine', from: 420, to: 820, dur: 0.10, gain: 0.12 });
      tone(ac, { type: 'sine', from: 820, to: 480, dur: 0.12, gain: 0.10, delay: 0.10 });
      break;
    case 'reward': // bright two-tone coin "ding"
      tone(ac, { type: 'triangle', from: 988, dur: 0.08, gain: 0.11 });
      tone(ac, { type: 'triangle', from: 1319, dur: 0.16, gain: 0.11, delay: 0.08 });
      break;
    case 'catch': // tiny high blip (mini-game)
      tone(ac, { type: 'sine', from: 1150, to: 1600, dur: 0.06, gain: 0.08 });
      break;
    case 'evolve': // ascending celebratory arpeggio (C-E-G-C)
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(ac, { type: 'triangle', from: f, dur: 0.2, gain: 0.12, delay: i * 0.12 }),
      );
      break;
  }
}
