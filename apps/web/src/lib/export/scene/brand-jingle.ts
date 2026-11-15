/**
 * **LA SIGNATURE SONORE DE MEESHY** (#13997, #10537) — miroir TS de
 * `MeeshyBrandJingle` (Swift, `packages/MeeshySDK/.../Theme/`) et Kotlin
 * (`apps/android/core/model/.../brand/`). Synthétisée, jamais un fichier : le
 * même PCM, à l'échantillon près, sur toutes les plateformes.
 *
 * Arpège de La majeur ascendant (A4, C♯5, E5) puis résolution à l'octave (A5),
 * chaque note continuant de résonner sous la suivante ; sinusoïdes avec un
 * partiel à l'octave à −18 dB, attaque de 25 ms, décroissance exponentielle,
 * normalisation à 0,62 et fondu final jusqu'au silence exact. La fermeture
 * rejoue le motif en miroir descendant sur 2 s.
 */

export type BrandNote = { readonly frequency: number; readonly onsetSeconds: number };

const MOTIF: readonly BrandNote[] = [
  { frequency: 440.0, onsetSeconds: 0.0 },
  { frequency: 554.37, onsetSeconds: 0.28 },
  { frequency: 659.25, onsetSeconds: 0.56 },
  { frequency: 880.0, onsetSeconds: 0.84 },
];

const OUTRO_MOTIF: readonly BrandNote[] = [
  { frequency: 880.0, onsetSeconds: 0.0 },
  { frequency: 659.25, onsetSeconds: 0.26 },
  { frequency: 554.37, onsetSeconds: 0.52 },
  { frequency: 440.0, onsetSeconds: 0.78 },
];

export const BRAND_JINGLE = {
  durationSeconds: 2.2,
  outroDurationSeconds: 2.0,
  sampleRate: 48_000,
  motif: MOTIF,
  outroMotif: OUTRO_MOTIF,
} as const;

const ATTACK = 0.025;
const DECAY_HALF_LIFE = 0.62;
const RELEASE_TAIL = 0.35;
const PEAK_AMPLITUDE = 0.62;
const OCTAVE_PARTIAL_GAIN = 0.126;

function addNote(buffer: Float32Array, note: BrandNote, sampleRate: number): void {
  const onsetFrame = Math.trunc(note.onsetSeconds * sampleRate);
  if (onsetFrame >= buffer.length) return;
  const omega = 2.0 * Math.PI * note.frequency;
  const octaveOmega = omega * 2.0;
  for (let frame = onsetFrame; frame < buffer.length; frame += 1) {
    const t = (frame - onsetFrame) / sampleRate;
    const attackGain = t < ATTACK ? t / ATTACK : 1.0;
    const decayGain = 0.5 ** (t / DECAY_HALF_LIFE);
    const value = Math.sin(omega * t) + OCTAVE_PARTIAL_GAIN * Math.sin(octaveOmega * t);
    buffer[frame] = (buffer[frame] ?? 0) + value * attackGain * decayGain;
  }
}

function normalize(buffer: Float32Array): void {
  const peak = buffer.reduce((acc, sample) => Math.max(acc, Math.abs(sample)), 0);
  if (peak <= 0) return;
  const scale = PEAK_AMPLITUDE / peak;
  for (let index = 0; index < buffer.length; index += 1) buffer[index] = (buffer[index] ?? 0) * scale;
}

function release(buffer: Float32Array, sampleRate: number): void {
  const releaseFrames = Math.min(Math.trunc(RELEASE_TAIL * sampleRate), buffer.length);
  if (releaseFrames <= 0) return;
  const start = buffer.length - releaseFrames;
  for (let frame = start; frame < buffer.length; frame += 1) {
    buffer[frame] = (buffer[frame] ?? 0) * (1 - (frame - start) / releaseFrames);
  }
}

function render(notes: readonly BrandNote[], durationSeconds: number, sampleRate: number): Float32Array {
  const frameCount = Math.trunc(durationSeconds * sampleRate);
  const buffer = new Float32Array(Math.max(0, frameCount));
  if (frameCount <= 0) return buffer;
  for (const note of notes) addNote(buffer, note, sampleRate);
  normalize(buffer);
  release(buffer, sampleRate);
  return buffer;
}

/** Le PCM mono, dans `[-1, 1]`, de la signature d'OUVERTURE (2,2 s). */
export const brandIntroSamples = (sampleRate: number = BRAND_JINGLE.sampleRate): Float32Array =>
  render(MOTIF, BRAND_JINGLE.durationSeconds, sampleRate);

/** Le PCM mono de la signature de FERMETURE (2 s, cadence descendante). */
export const brandOutroSamples = (sampleRate: number = BRAND_JINGLE.sampleRate): Float32Array =>
  render(OUTRO_MOTIF, BRAND_JINGLE.outroDurationSeconds, sampleRate);
