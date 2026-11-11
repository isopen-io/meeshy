import type { TalkieSendPhase } from './talkie-sender';

/**
 * **L'EN-TÊTE D'UN DIRECT PREND LE TALKIE** (#17338, jumelle web de #17337 et
 * #17310) — transposition de `TalkieHeaderBarLaw.swift` (iOS, la référence).
 *
 * - Une voix qui PART (la mienne) ou qui ARRIVE (celle du pair) élargit le talkie
 *   sur toute la barre ; retour, identité et actions s'effacent sans libérer leur
 *   place. Un appui dont la voix n'est pas encore partie laisse la barre au repos.
 * - La barre dit AVANT la fin ce que devient la voix : `live` (entendue à
 *   l'instant), `relayed` (le pair est réveillé et l'entendra à son retour),
 *   `recorded` (le talkie ne passe pas : la voix part en message vocal).
 * - Le niveau d'une voix devient une onde : RMS → décibels → [0, 1], lissé
 *   (montée rapide, descente lente), en spectre MIROIR pour le direct et en
 *   TRAÎNE défilante pour l'enregistrement.
 */

/** `recording-copy` : la copie en message vocal qui s'enregistre quand le talkie ne passe pas (iOS `recordingCopy`). */
export type TalkieHeaderPhase = TalkieSendPhase['kind'] | 'recording-copy';

export type TalkieHeaderVoice = 'none' | 'outgoing' | 'incoming';

export type TalkieHeaderDelivery = 'live' | 'relayed' | 'recorded';

export type TalkieHeaderChrome = {
  readonly showsBackButton: boolean;
  readonly showsIdentity: boolean;
  readonly showsActions: boolean;
  readonly talkieSpansBar: boolean;
};

const VOICE_LEAVING: ReadonlySet<TalkieHeaderPhase> = new Set(['talking', 'recording-copy']);

export function resolveTalkieHeaderVoice({ phase, peerSpeaking }: { readonly phase: TalkieHeaderPhase; readonly peerSpeaking: boolean }): TalkieHeaderVoice {
  if (VOICE_LEAVING.has(phase)) return 'outgoing';
  return peerSpeaking ? 'incoming' : 'none';
}

export function resolveTalkieHeaderDelivery({
  voice,
  phase,
  waking,
}: {
  readonly voice: TalkieHeaderVoice;
  readonly phase: TalkieHeaderPhase;
  readonly waking: boolean;
}): TalkieHeaderDelivery {
  if (voice !== 'outgoing') return 'live';
  if (phase === 'recording-copy') return 'recorded';
  return waking ? 'relayed' : 'live';
}

export const isRealtimeDelivery = (delivery: TalkieHeaderDelivery): boolean => delivery === 'live';

export function headerTalkieChrome(voice: TalkieHeaderVoice): TalkieHeaderChrome {
  const rest = voice === 'none';
  return { showsBackButton: rest, showsIdentity: rest, showsActions: rest, talkieSpansBar: !rest };
}

/** Le talkie n'est pas chiffré de bout en bout : il reste fermé dans un direct `e2ee` (iOS `TalkieOfferRule.mayShowInHeader`). */
export const mayShowTalkieInHeader = (encryptionMode: string | null | undefined): boolean => encryptionMode !== 'e2ee';

/** Le pair à qui le talkie de l'en-tête parle : celui d'un direct, hors aperçu, hors invité sans compte, hors E2EE. */
export function threadHeaderTalkiePeer({
  group,
  preview,
  guest,
  encryptionMode,
  peerId,
}: {
  readonly group: boolean;
  readonly preview: boolean;
  readonly guest: boolean;
  readonly encryptionMode: string | null | undefined;
  readonly peerId: string | null | undefined;
}): string | null {
  if (group || preview || guest || !mayShowTalkieInHeader(encryptionMode)) return null;
  return peerId ?? null;
}

/** En deçà, c'est le silence ; 0 dBFS est le plafond. */
export const TALKIE_WAVE_FLOOR_DB = -50;
const ATTACK = 0.55;
const RELEASE = 0.12;
export const TALKIE_WAVE_TRAIL_CAPACITY = 72;
export const TALKIE_WAVE_TRAIL_STEP_MS = 1_000 / 30;

const clamp01 = (value: number): number => (Number.isNaN(value) ? 0 : Math.min(Math.max(value, 0), 1));

const squared = (total: number, sample: number): number => total + sample * sample;

/** Sans copie : appelée à chaque image sur la fenêtre de l'analyseur. */
export function talkieWaveRms(samples: Float32Array | readonly number[]): number {
  if (samples.length === 0) return 0;
  const energy = samples instanceof Float32Array ? samples.reduce(squared, 0) : samples.reduce(squared, 0);
  return Math.sqrt(energy / samples.length);
}

export function talkieWaveNormalized(rms: number): number {
  if (Number.isNaN(rms) || rms <= 0) return 0;
  return clamp01((20 * Math.log10(rms) - TALKIE_WAVE_FLOOR_DB) / -TALKIE_WAVE_FLOOR_DB);
}

export function talkieWaveSmoothed(previous: number, target: number): number {
  const goal = clamp01(target);
  const from = clamp01(previous);
  return clamp01(from + (goal - from) * (goal > from ? ATTACK : RELEASE));
}

export function talkieWaveBarCount({ width, barWidth, gap }: { readonly width: number; readonly barWidth: number; readonly gap: number }): number {
  const pitch = Math.max(barWidth + gap, 1);
  const fitting = Math.floor((width + gap) / pitch);
  return Math.min(Math.max(fitting, 1), TALKIE_WAVE_TRAIL_CAPACITY);
}

type BarBounds = { readonly minHeight: number; readonly maxHeight: number };

export function talkieWaveBarHeights({ levels, barCount, minHeight, maxHeight }: BarBounds & { readonly levels: readonly number[]; readonly barCount: number }): number[] {
  const count = Math.max(barCount, 0);
  const recent = count === 0 ? [] : levels.slice(-count);
  const padded = [...Array.from({ length: count - recent.length }, () => 0), ...recent];
  return padded.map((level) => minHeight + (maxHeight - minHeight) * clamp01(level));
}

/** Le spectre du direct : centré sur la voix de l'instant, le centre mène, une houle par distance l'anime sans briser la symétrie. */
export function talkieWaveMirroredBarHeights({ level, barCount, timeS, minHeight, maxHeight }: BarBounds & { readonly level: number; readonly barCount: number; readonly timeS: number }): number[] {
  const count = Math.max(barCount, 0);
  const voice = clamp01(level);
  const centre = (count - 1) / 2;
  const reach = Math.max(centre, 1);
  return Array.from({ length: count }, (_, index) => {
    const distance = Math.abs(index - centre);
    const envelope = 0.3 + 0.7 * Math.cos(((distance / reach) * Math.PI) / 2) ** 2;
    const swell = 0.78 + 0.22 * Math.sin(timeS * 8.3 + distance * 1.9) * Math.cos(timeS * 4.7 - distance * 0.8);
    return minHeight + (maxHeight - minHeight) * clamp01(voice * envelope * swell);
  });
}

export type TalkieWaveTrail = {
  /** Lisse le niveau à chaque image ; ajoute un pas d'histoire à cadence fixe (même défilement à 60 qu'à 120 Hz). */
  advance(nowMs: number, level: number): void;
  levels(): readonly number[];
};

export function createTalkieWaveTrail(): TalkieWaveTrail {
  let levels: readonly number[] = [];
  let smoothed = 0;
  let lastStep: number | null = null;
  return {
    advance: (nowMs, level) => {
      smoothed = talkieWaveSmoothed(smoothed, level);
      if (lastStep !== null && nowMs - lastStep < TALKIE_WAVE_TRAIL_STEP_MS) return;
      lastStep = nowMs;
      levels = [...levels, smoothed].slice(-TALKIE_WAVE_TRAIL_CAPACITY);
    },
    levels: () => levels,
  };
}

/** Le niveau d'une voix, lu par l'onde à chaque image sans rien publier : l'en-tête ne se re-rend pas pour lui. */
export type TalkieLevelReading = { readonly level: () => number };

export type TalkieLevelMeter = TalkieLevelReading & {
  /** Le fil audio pousse une moyenne quadratique. */
  readonly push: (rms: number) => void;
  readonly reset: () => void;
  /** Une source tirée à la lecture (un `AnalyserNode`) : elle rend une moyenne quadratique, `null` la débranche. */
  readonly probe: (read: (() => number) | null) => void;
};

export function createTalkieLevelMeter(): TalkieLevelMeter {
  let value = 0;
  let source: (() => number) | null = null;
  return {
    level: () => {
      if (source !== null) value = talkieWaveNormalized(source());
      return value;
    },
    push: (rms) => {
      value = talkieWaveNormalized(rms);
    },
    reset: () => {
      value = 0;
    },
    probe: (read) => {
      source = read;
    },
  };
}

/** Les deux voix du talkie : celle que mon micro capte, celle que le lecteur joue. */
export const talkieLevelMeters: { readonly outgoing: TalkieLevelMeter; readonly incoming: TalkieLevelMeter } = {
  outgoing: createTalkieLevelMeter(),
  incoming: createTalkieLevelMeter(),
};

export function talkieElapsed(ms: number): string {
  const seconds = Math.max(Math.floor(ms / 1_000), 0);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
