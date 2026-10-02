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

export function trimmedWav(audio: DecodedAudio, window: AudioWindow): Blob {
  const first = Math.max(0, Math.floor(window.start * audio.sampleRate));
  const last = Math.min(audio.length, Math.ceil(window.end * audio.sampleRate));
  const frames = Math.max(0, last - first);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, channel) => audio.getChannelData(channel));
  const blockAlign = audio.numberOfChannels * 2;
  const dataBytes = frames * blockAlign;
  const view = new DataView(new ArrayBuffer(44 + dataBytes));
  const ascii = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, audio.numberOfChannels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let frame = 0; frame < frames; frame += 1) {
    channels.forEach((samples, channel) => {
      const value = Math.max(-1, Math.min(1, samples[first + frame] ?? 0));
      view.setInt16(44 + frame * blockAlign + channel * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    });
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}

export function trimmedAudioFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}-coupe.wav`;
}

/** Le navigateur réel : le fichier décodé par Web Audio. */
export async function decodeAudioFile(file: Blob): Promise<DecodedAudio | null> {
  if (typeof AudioContext === 'undefined') return null;
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    return null;
  } finally {
    void context.close();
  }
}
