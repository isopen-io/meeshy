/**
 * **COUPER UN AUDIO EN ATTENTE** (#9136, miroir de `MeeshyAudioEditorView`
 * iOS, qui cuit la coupe dans le fichier livré) — la fenêtre gardée seule
 * repart, en WAV PCM 16 bits : un encodage exact, sans attendre la durée du
 * son comme le ferait un enregistreur.
 */
export type AudioWindow = { readonly start: number; readonly end: number };

/** La part d'`AudioBuffer` que la coupe lit — les témoins en passent un faux. */
export type DecodedAudio = {
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  readonly length: number;
  readonly getChannelData: (channel: number) => Float32Array;
};

/** La fenêtre la plus courte qu'on laisse produire (`MediaTrimRule.minimumDuration`). */
export const MINIMUM_AUDIO_WINDOW = 0.4;

const EDGE = 0.01;

export function audioTrimUntouched(window: AudioWindow, duration: number): boolean {
  return window.start <= EDGE && window.end >= duration - EDGE;
}

/** Les échantillons de la seule fenêtre gardée, canal par canal — une VUE en
 * lecture seule des échantillons décodés, jamais une copie (#11312). */
export function windowChannels(audio: DecodedAudio, window: AudioWindow): Float32Array[] {
  const first = Math.max(0, Math.floor(window.start * audio.sampleRate));
  const last = Math.min(audio.length, Math.ceil(window.end * audio.sampleRate));
  const frames = Math.max(0, last - first);
  return Array.from({ length: audio.numberOfChannels }, (_, channel) => audio.getChannelData(channel).subarray(first, first + frames));
}

/** WAV PCM 16 bits des canaux donnés — tout échantillon hors [-1, 1] s'écrête. */
export function wavOf(channels: readonly Float32Array[], sampleRate: number): Blob {
  const frames = channels[0]?.length ?? 0;
  const blockAlign = channels.length * 2;
  const dataBytes = frames * blockAlign;
  const view = new DataView(new ArrayBuffer(44 + dataBytes));
  const ascii = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let frame = 0; frame < frames; frame += 1) {
    channels.forEach((samples, channel) => {
      const value = Math.max(-1, Math.min(1, samples[frame] ?? 0));
      view.setInt16(44 + frame * blockAlign + channel * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    });
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}

export function trimmedWav(audio: DecodedAudio, window: AudioWindow): Blob {
  return wavOf(windowChannels(audio, window), audio.sampleRate);
}

export function trimmedAudioFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}-coupe.wav`;
}

/**
 * **LA MÉMOIRE DE LA COUPE EST BORNÉE** (#11312) — `decodeAudioData` pose le
 * son ENTIER en PCM float32 (4 o par échantillon et par canal) : c'est la
 * DURÉE qui fait la mémoire, pas la taille compressée (un vocal Opus de 5 Mo
 * dure 20 min et pèse 460 Mo décodé en stéréo 48 kHz). On borne donc deux
 * choses avant d'ouvrir un décodeur : la source compressée (copiée une fois
 * en `ArrayBuffer`) et le PCM décodé, tenu sous son budget par la fréquence
 * de décodage d'un `OfflineAudioContext`, qui ne touche aucun matériel audio.
 * iOS n'a pas ce coût : `AudioEditEngine` exporte la coupe par `AVAsset`
 * sans décoder le fichier en mémoire.
 *
 * Repli : sans `OfflineAudioContext` (Safari < 14.1), rien n'est décodé et
 * l'éditeur dit son échec (`story.studio.retouch.failed`).
 */
export const MAXIMUM_TRIM_SOURCE_BYTES = 24 * 1024 * 1024;
export const DECODED_AUDIO_BUDGET_BYTES = 192 * 1024 * 1024;
export const PREFERRED_DECODE_RATE = 48_000;
/** Whisper transcrit à 16 kHz : en dessous, la voix perdrait ce que la transcription lit. */
export const MINIMUM_DECODE_RATE = 16_000;
const WORST_CASE_CHANNELS = 2;
const PCM_BYTES_PER_SAMPLE = 4;
/** 8 kbit/s, le plus bas débit vocal courant : majorant de la durée quand on ne la connaît pas. */
const LOWEST_BYTES_PER_SECOND = 1_000;
const PROBE_TIMEOUT_MS = 3_000;

export type TrimSource = Pick<Blob, 'size' | 'arrayBuffer'>;

export function trimSourceFits(source: Pick<TrimSource, 'size'>): boolean {
  return source.size <= MAXIMUM_TRIM_SOURCE_BYTES;
}

const positiveFinite = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** La durée qu'on budgète : connue, sinon majorée par la taille. */
export function trimSourceSeconds(source: { readonly size: number; readonly seconds: number | null }): number {
  return positiveFinite(source.seconds) ? source.seconds : source.size / LOWEST_BYTES_PER_SECOND;
}

/** La fréquence de décodage qui tient le PCM sous le budget ; `null` si même le plancher ne tient pas. */
export function decodeRateFor(seconds: number): number | null {
  if (!positiveFinite(seconds)) return null;
  const affordable = Math.floor(DECODED_AUDIO_BUDGET_BYTES / (seconds * WORST_CASE_CHANNELS * PCM_BYTES_PER_SAMPLE));
  return affordable < MINIMUM_DECODE_RATE ? null : Math.min(PREFERRED_DECODE_RATE, affordable);
}

/** La durée lue dans les métadonnées par le navigateur ; `null` si elle manque (un WebM de MediaRecorder dit `Infinity`). */
export function probeAudioSeconds(file: Blob): Promise<number | null> {
  if (typeof Audio === 'undefined' || typeof URL.createObjectURL !== 'function') return Promise.resolve(null);
  const url = URL.createObjectURL(file);
  const element = new Audio();
  return new Promise((resolve) => {
    const settle = (seconds: number | null) => {
      clearTimeout(timer);
      element.onloadedmetadata = null;
      element.onerror = null;
      element.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    const timer = setTimeout(() => settle(null), PROBE_TIMEOUT_MS);
    element.preload = 'metadata';
    element.onloadedmetadata = () => settle(positiveFinite(element.duration) ? element.duration : null);
    element.onerror = () => settle(null);
    element.src = url;
  });
}

const probeBlobSeconds = (source: TrimSource): Promise<number | null> => (source instanceof Blob ? probeAudioSeconds(source) : Promise.resolve(null));

export type DecodeAudioOptions = {
  /** La durée d'un enregistrement vocal (`PendingAttachment.durationMs`). */
  readonly durationMs?: number | undefined;
  readonly probeSeconds?: (file: TrimSource) => Promise<number | null>;
};

/** Le navigateur réel : le fichier décodé par Web Audio, jamais au-delà des bornes. */
export async function decodeAudioFile(file: TrimSource, { durationMs, probeSeconds = probeBlobSeconds }: DecodeAudioOptions = {}): Promise<DecodedAudio | null> {
  if (!trimSourceFits(file) || typeof OfflineAudioContext === 'undefined') return null;
  const known = positiveFinite(durationMs) ? durationMs / 1000 : await probeSeconds(file);
  const rate = decodeRateFor(trimSourceSeconds({ size: file.size, seconds: known }));
  if (rate === null) return null;
  try {
    return await new OfflineAudioContext(1, 1, rate).decodeAudioData(await file.arrayBuffer());
  } catch {
    return null;
  }
}
