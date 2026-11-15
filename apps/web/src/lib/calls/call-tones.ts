/**
 * **LES SONS D'UN APPEL** (#6382) — sonnerie de l'appelé, tonalité de retour
 * de l'appelant, signal de connexion et de fin, miroir de
 * `RingbackTonePlayer.swift` (`Ringtone.caf`, `RingbackTone.caf`, cues
 * « connected » / « ended »).
 *
 * Synthétisés par Web Audio plutôt que servis en fichiers : aucun octet à
 * télécharger au moment exact où la sonnerie doit partir, et rien à mettre en
 * cache pour qu'un appel sonne hors du réseau lent. La sonnerie reprend les
 * deux notes de l'ancien web (do 523,25 Hz puis mi 659,25 Hz) ; la tonalité de
 * retour est le 440 Hz européen (1 s de son, 3 s de silence).
 *
 * Un navigateur peut refuser de jouer avant tout geste (politique
 * d'autoplay) : la sonnerie est alors doublée par la vibration et par le
 * titre de l'onglet, jamais par une erreur.
 */

export type ToneKind = 'ring' | 'ringback';

type Note = { readonly frequency: number; readonly at: number; readonly duration: number };

const RING_PATTERN: readonly Note[] = [
  { frequency: 523.25, at: 0, duration: 0.4 },
  { frequency: 659.25, at: 0.4, duration: 0.4 },
  { frequency: 523.25, at: 1.2, duration: 0.4 },
  { frequency: 659.25, at: 1.6, duration: 0.4 },
];
const RING_PERIOD_S = 3;
const RINGBACK_PATTERN: readonly Note[] = [{ frequency: 440, at: 0, duration: 1 }];
const RINGBACK_PERIOD_S = 4;
const VIBRATION: readonly number[] = [400, 200, 400, 1000];

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

let context: AudioContext | null = null;
let loop: ReturnType<typeof setInterval> | null = null;
let vibrating: ReturnType<typeof setInterval> | null = null;
let savedTitle: string | null = null;
let titleTimer: ReturnType<typeof setInterval> | null = null;

function ensureContext(): AudioContext | null {
  if (context !== null) return context;
  const Ctor = audioContextCtor();
  if (Ctor === null) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

function play(notes: readonly Note[], gain: number): void {
  const ctx = ensureContext();
  if (ctx === null) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  const start = ctx.currentTime + 0.02;
  for (const note of notes) {
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = note.frequency;
    envelope.gain.setValueAtTime(0, start + note.at);
    envelope.gain.linearRampToValueAtTime(gain, start + note.at + 0.02);
    envelope.gain.setValueAtTime(gain, start + note.at + note.duration - 0.04);
    envelope.gain.linearRampToValueAtTime(0, start + note.at + note.duration);
    oscillator.connect(envelope).connect(ctx.destination);
    oscillator.start(start + note.at);
    oscillator.stop(start + note.at + note.duration + 0.01);
  }
}

function vibrate(pattern: readonly number[] | number): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(typeof pattern === 'number' ? pattern : [...pattern]);
  } catch {
    /* Vibration refusée hors geste : sans conséquence. */
  }
}

function flashTitle(label: string): void {
  if (typeof document === 'undefined' || titleTimer !== null) return;
  savedTitle = document.title;
  let on = false;
  titleTimer = setInterval(() => {
    on = !on;
    document.title = on ? label : (savedTitle ?? '');
  }, 1000);
}

function restoreTitle(): void {
  if (titleTimer !== null) clearInterval(titleTimer);
  titleTimer = null;
  if (savedTitle !== null && typeof document !== 'undefined') document.title = savedTitle;
  savedTitle = null;
}

export function startTone(kind: ToneKind, options?: { readonly titleLabel?: string }): void {
  stopTone();
  const [pattern, period, gain] = kind === 'ring' ? [RING_PATTERN, RING_PERIOD_S, 0.18] : [RINGBACK_PATTERN, RINGBACK_PERIOD_S, 0.08];
  play(pattern, gain);
  loop = setInterval(() => play(pattern, gain), period * 1000);
  if (kind === 'ring') {
    vibrate(VIBRATION);
    vibrating = setInterval(() => vibrate(VIBRATION), 2000);
    if (options?.titleLabel !== undefined) flashTitle(options.titleLabel);
  }
}

export function stopTone(): void {
  if (loop !== null) clearInterval(loop);
  loop = null;
  if (vibrating !== null) {
    clearInterval(vibrating);
    vibrate(0);
  }
  vibrating = null;
  restoreTitle();
}

/** Deux notes montantes à la connexion, deux descendantes à la fin. */
export function playCue(kind: 'connected' | 'ended'): void {
  const notes: readonly Note[] =
    kind === 'connected'
      ? [
          { frequency: 659.25, at: 0, duration: 0.12 },
          { frequency: 880, at: 0.12, duration: 0.16 },
        ]
      : [
          { frequency: 659.25, at: 0, duration: 0.14 },
          { frequency: 440, at: 0.14, duration: 0.2 },
        ];
  play(notes, 0.12);
}

/** Déverrouille l'audio pendant un geste (clic « Appeler » / « Accepter »). */
export function primeTones(): void {
  const ctx = ensureContext();
  if (ctx !== null && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}
