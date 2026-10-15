import { stretched } from './audio-stretch';
import { audioTrimUntouched, MINIMUM_AUDIO_WINDOW, wavOf, windowChannels, type AudioWindow, type DecodedAudio } from './audio-trim';

/**
 * **L'ÉDITEUR AUDIO DU MESSAGE** (miroir de `AudioEditorController` et
 * `AudioEditEngine` iOS) — les réglages se cuisent dans le WAV rendu, et
 * chacun se lit sur les échantillons : la fenêtre gardée (#9136), puis le
 * volume (#9164), les fondus (#9162), la vitesse (#9163), la scission
 * (#9161). L'ordre est celui d'iOS : la fenêtre et la plage retirée, puis la
 * vitesse, puis le volume et ses fondus mesurés sur la durée RENDUE.
 */
export type AudioEdit = {
  readonly window: AudioWindow;
  /** Gain linéaire ; 1 laisse le son tel quel (`AudioEditOperation.gain`). */
  readonly gain: number;
  /** Fondus d'entrée et de sortie (`AudioEditOperation.fade`), au volume réglé. */
  readonly fadeIn: boolean;
  readonly fadeOut: boolean;
  /** Vitesse ; la hauteur de la voix est gardée (`AudioEditOperation.speed`). */
  readonly speed: number;
  /** Plage retirée au milieu, en temps du son d'origine (`AudioEditOperation.removeRange`). */
  readonly cut: AudioWindow | null;
};

/** Le curseur iOS : `Slider(value: $controller.gain, in: 0...2, step: 0.05)`. */
export const AUDIO_GAIN = { min: 0, max: 2, step: 0.05 } as const;

/** La borne du moteur iOS (`renderPlan` : 0…4) — un gain hors borne ne passe pas. */
const GAIN_LIMIT = 4;
const IDENTITY = 0.001;
/** La plage la plus courte qui retire quelque chose (`isSplitMeaningful` iOS : 0,2 s). */
export const MINIMUM_AUDIO_CUT = 0.2;

export function untouchedAudioEdit(duration: number): AudioEdit {
  return { window: { start: 0, end: duration }, gain: 1, fadeIn: false, fadeOut: false, speed: 1, cut: null };
}

/** La plage que pose iOS en ouvrant l'outil (`selectTool(.split)`) : de 40 à 60 % du son. */
export function defaultAudioCut(duration: number): AudioWindow {
  return { start: duration * 0.4, end: duration * 0.6 };
}

/** La plage réellement retirée, bornée à la fenêtre ; `null` si elle ne retire rien ou ne laisserait presque rien. */
export function effectiveAudioCut(window: AudioWindow, cut: AudioWindow | null): AudioWindow | null {
  if (cut === null) return null;
  const start = Math.max(window.start, Math.min(cut.start, cut.end));
  const end = Math.min(window.end, Math.max(cut.start, cut.end));
  if (end - start < MINIMUM_AUDIO_CUT) return null;
  return window.end - window.start - (end - start) < MINIMUM_AUDIO_WINDOW ? null : { start, end };
}

/** La durée du son d'origine qui reste, fenêtre gardée moins la plage retirée. */
export function keptAudioSeconds(edit: AudioEdit): number {
  const cut = effectiveAudioCut(edit.window, edit.cut);
  return edit.window.end - edit.window.start - (cut === null ? 0 : cut.end - cut.start);
}

export function audioEditUntouched(edit: AudioEdit, duration: number): boolean {
  return (
    audioTrimUntouched(edit.window, duration) &&
    effectiveAudioCut(edit.window, edit.cut) === null &&
    Math.abs(edit.gain - 1) < IDENTITY &&
    !edit.fadeIn &&
    !edit.fadeOut &&
    Math.abs(edit.speed - 1) < IDENTITY
  );
}

function keptChannels(audio: DecodedAudio, edit: AudioEdit): Float32Array[] {
  const window = windowChannels(audio, edit.window);
  const cut = effectiveAudioCut(edit.window, edit.cut);
  if (cut === null) return window;
  const first = Math.max(0, Math.floor((cut.start - edit.window.start) * audio.sampleRate));
  const last = Math.ceil((cut.end - edit.window.start) * audio.sampleRate);
  return window.map((samples) => {
    const tail = samples.subarray(Math.min(samples.length, last));
    const joined = new Float32Array(first + tail.length);
    joined.set(samples.subarray(0, first));
    joined.set(tail, first);
    return joined;
  });
}

/** La durée d'un fondu iOS (`AudioEditEngine.render`) : le tiers du son rendu, entre 0,2 et 1,2 s. */
export function fadeSeconds(duration: number): number {
  return Math.min(1.2, Math.max(0.2, duration / 3));
}

/** L'enveloppe d'iOS (`setVolumeRamp`) : linéaire, du silence au volume réglé et retour. */
function envelope(edit: AudioEdit, frames: number, sampleRate: number): (frame: number) => number {
  const duration = frames / sampleRate;
  const fade = fadeSeconds(duration);
  const fadeOut = edit.fadeOut && duration > fade;
  return (frame) => {
    const time = frame / sampleRate;
    const rising = edit.fadeIn && time < fade ? time / fade : 1;
    const falling = fadeOut && time > duration - fade ? (duration - time) / fade : 1;
    return rising * falling;
  };
}

/** `null` ⇒ « Normal » (`audio.editor.volume.normal`), sinon le pourcentage arrondi. */
export function volumePercent(gain: number): number | null {
  return Math.abs(gain - 1) < IDENTITY ? null : Math.round(gain * 100);
}

export function renderedChannels(audio: DecodedAudio, edit: AudioEdit): Float32Array[] {
  const gain = Math.min(GAIN_LIMIT, Math.max(0, edit.gain));
  const kept = stretched(keptChannels(audio, edit), edit.speed, audio.sampleRate);
  const level = envelope(edit, kept[0]?.length ?? 0, audio.sampleRate);
  return kept.map((samples) => samples.map((value, frame) => value * gain * level(frame)));
}

export function editedWav(audio: DecodedAudio, edit: AudioEdit): Blob {
  return wavOf(renderedChannels(audio, edit), audio.sampleRate);
}
