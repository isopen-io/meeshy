import { audioTrimUntouched, wavOf, windowChannels, type AudioWindow, type DecodedAudio } from './audio-trim';

/**
 * **L'ÉDITEUR AUDIO DU MESSAGE** (miroir de `AudioEditorController` et
 * `AudioEditEngine` iOS) — les réglages se cuisent dans le WAV rendu, et
 * chacun se lit sur les échantillons : la fenêtre gardée (#9136), puis le
 * volume (#9164).
 */
export type AudioEdit = {
  readonly window: AudioWindow;
  /** Gain linéaire ; 1 laisse le son tel quel (`AudioEditOperation.gain`). */
  readonly gain: number;
};

/** Le curseur iOS : `Slider(value: $controller.gain, in: 0...2, step: 0.05)`. */
export const AUDIO_GAIN = { min: 0, max: 2, step: 0.05 } as const;

/** La borne du moteur iOS (`renderPlan` : 0…4) — un gain hors borne ne passe pas. */
const GAIN_LIMIT = 4;
const IDENTITY = 0.001;

export function untouchedAudioEdit(duration: number): AudioEdit {
  return { window: { start: 0, end: duration }, gain: 1 };
}

export function audioEditUntouched(edit: AudioEdit, duration: number): boolean {
  return audioTrimUntouched(edit.window, duration) && Math.abs(edit.gain - 1) < IDENTITY;
}

/** `null` ⇒ « Normal » (`audio.editor.volume.normal`), sinon le pourcentage arrondi. */
export function volumePercent(gain: number): number | null {
  return Math.abs(gain - 1) < IDENTITY ? null : Math.round(gain * 100);
}

export function renderedChannels(audio: DecodedAudio, edit: AudioEdit): Float32Array[] {
  const gain = Math.min(GAIN_LIMIT, Math.max(0, edit.gain));
  return windowChannels(audio, edit.window).map((samples) => samples.map((value) => value * gain));
}

export function editedWav(audio: DecodedAudio, edit: AudioEdit): Blob {
  return wavOf(renderedChannels(audio, edit), audio.sampleRate);
}
