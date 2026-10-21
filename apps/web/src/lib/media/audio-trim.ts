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

/** Les échantillons de la seule fenêtre gardée, canal par canal. */
export function windowChannels(audio: DecodedAudio, window: AudioWindow): Float32Array[] {
  const first = Math.max(0, Math.floor(window.start * audio.sampleRate));
  const last = Math.min(audio.length, Math.ceil(window.end * audio.sampleRate));
  const frames = Math.max(0, last - first);
  return Array.from({ length: audio.numberOfChannels }, (_, channel) => audio.getChannelData(channel).slice(first, first + frames));
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
 * La taille maximale de la source compressée qu'on décode pour couper : le PCM
 * décodé pèse 4 o par échantillon et par canal, donc on borne l'entrée avant
 * tout décodage (#11312).
 */
export const MAXIMUM_TRIM_SOURCE_BYTES = 24 * 1024 * 1024;

export type TrimSource = Pick<Blob, 'size' | 'arrayBuffer'>;

export function trimSourceFits(source: Pick<TrimSource, 'size'>): boolean {
  return source.size <= MAXIMUM_TRIM_SOURCE_BYTES;
}

/** Le navigateur réel : le fichier décodé par Web Audio, jamais au-delà de la borne. */
export async function decodeAudioFile(file: TrimSource): Promise<DecodedAudio | null> {
  if (!trimSourceFits(file) || typeof AudioContext === 'undefined') return null;
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    return null;
  } finally {
    void context.close();
  }
}
