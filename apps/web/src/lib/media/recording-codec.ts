/**
 * LA LOI DE CODECS DES ENREGISTREMENTS DU NAVIGATEUR (#11309) — une seule table
 * pour le vocal, la vidéo de la caméra, le clip d'appel et l'export. Les
 * conteneurs sont ceux que la passerelle accepte (`ACCEPTED_MIME_TYPES`).
 */

export type RecordingKind = 'audio' | 'video';

export type IsTypeSupported = (mimeType: string) => boolean;

export const RECORDING_MIME_CANDIDATES: Readonly<Record<RecordingKind, readonly string[]>> = {
  audio: ['audio/webm;codecs=opus', 'audio/mp4'],
  video: ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
};

/** Débit de la parole (Opus, `QualityThresholds.swift`) : vocaux et enregistrements d'appel. */
export const SPEECH_AUDIO_BITS_PER_SECOND = 32_000;

export function recordingMimeOf(kind: RecordingKind, isTypeSupported: IsTypeSupported): string | undefined {
  return RECORDING_MIME_CANDIDATES[kind].find((candidate) => isTypeSupported(candidate));
}

export function speechRecorderOptionsOf(kind: RecordingKind, isTypeSupported: IsTypeSupported): MediaRecorderOptions {
  const mimeType = recordingMimeOf(kind, isTypeSupported);
  return { audioBitsPerSecond: SPEECH_AUDIO_BITS_PER_SECOND, ...(mimeType === undefined ? {} : { mimeType }) };
}
