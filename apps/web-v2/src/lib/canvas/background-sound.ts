import { attachmentSrc } from '@/lib/api/media-url';
import { objectMediaIdentity, type SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasDocument } from '@/lib/canvas/document';
import { backgroundMedia } from '@/lib/feed/scene-framing';
import { isVideoObject } from '@/lib/feed/scene-motion';

/**
 * `electBackgroundTrack` (T7, #6899) — LE SON DE FOND D'UNE SCÈNE, miroir de
 * `ReaderAudioMixer+Background.swift` (§ 1.6 de la spécification
 * `stories-lecteur`) : « une piste de fond, alignée sur l'horloge de la
 * diapositive, `volume`, boucle, muet viewer ». Deux sources, dans l'ordre
 * où le lecteur les essaie :
 *
 * 1. un objet `audio` de la scène, `payload.isBackground: true` — le cas
 *    d'AUTEUR (une piste posée dans le composeur), résolu par
 *    `postMediaId`/`mediaId` (`objectMediaIdentity`, `lib/canvas/carrier.ts`)
 *    contre le porteur, ou par `mediaURL` (miroir `StoryAudioSourceResolver`,
 *    la voie d'un son EMPRUNTÉ à une bibliothèque, sans identité de post) ;
 * 2. `CanvasV3.sound` (`canvas-v3.ts:BackgroundSoundSchema`), au niveau du
 *    DOCUMENT — `source.t === 'original'` élit le premier média AUDIO du
 *    porteur ; `'library'` reste HORS PÉRIMÈTRE (question 9.2 de la
 *    spécification : la bibliothèque de sons n'est pas encore branchée à ce
 *    lecteur) et rend `null`, jamais une piste inventée.
 *
 * `null` sur toute scène sans son de fond — jamais une source devinée.
 */

export type BackgroundTrackBounds = { readonly startMs: number; readonly endMs: number };

export type BackgroundTrack = {
  readonly src: string;
  /** [0, 1], défaut 1 (`BackgroundSoundSchema.volume`, `canvas-v3.ts:124`). */
  readonly volume: number;
  readonly startOffsetMs: number;
  readonly loop: boolean;
  /** Recopié ssi `end >= start` — même garantie que `TimingSchema`/
   * `BackgroundSoundSchema.bounds` (`canvas-v3.ts`). */
  readonly bounds?: BackgroundTrackBounds;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const finiteNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const clampVolume = (value: number | undefined): number => (value === undefined ? 1 : Math.min(1, Math.max(0, value)));

function boundsOf(start: unknown, end: unknown): BackgroundTrackBounds | undefined {
  const s = finiteNumber(start);
  const e = finiteNumber(end);
  if (s === undefined || e === undefined || e < s) return undefined;
  return { startMs: s * 1000, endMs: e * 1000 };
}

export function electBackgroundTrack(params: {
  readonly document: CanvasDocument;
  readonly sceneIndex: number;
  readonly carrier: SceneCarrier;
}): BackgroundTrack | null {
  const { document, sceneIndex, carrier } = params;
  const scene = document.scenes[sceneIndex];
  const backgroundAudio = scene?.objects.find((o) => o.kind === 'audio' && o.payload.isBackground === true);

  if (backgroundAudio !== undefined) {
    const identity = objectMediaIdentity(backgroundAudio);
    const carried = identity === null ? undefined : carrier.media.find((m) => m.id === identity)?.src;
    const fromCarrier = carried === '' ? undefined : carried;
    const mediaURL = backgroundAudio.payload.mediaURL;
    const src = fromCarrier ?? (typeof mediaURL === 'string' && mediaURL !== '' ? attachmentSrc(mediaURL) : undefined);
    if (src === undefined) return null;
    const bounds = boundsOf(backgroundAudio.payload.sourceStart, backgroundAudio.payload.sourceEnd);
    return {
      src,
      volume: clampVolume(finiteNumber(backgroundAudio.payload.volume)),
      startOffsetMs: (finiteNumber(backgroundAudio.payload.startTime) ?? 0) * 1000,
      loop: backgroundAudio.payload.loop === true,
      ...(bounds !== undefined ? { bounds } : {}),
    };
  }

  const sound = document.sound;
  if (!isRecord(sound) || !isRecord(sound.source) || sound.source.t !== 'original') return null;
  const audioMedia = carrier.media.find((m) => m.mimeType?.startsWith('audio/') === true && m.src !== '');
  if (audioMedia === undefined) return null;
  const bounds = isRecord(sound.bounds) ? boundsOf(sound.bounds.start, sound.bounds.end) : undefined;
  return {
    src: audioMedia.src,
    volume: clampVolume(finiteNumber(sound.volume)),
    startOffsetMs: 0,
    loop: false,
    ...(bounds !== undefined ? { bounds } : {}),
  };
}

/**
 * `sceneHasControllableSound` (#6899) — le lecteur a-t-il un son à COUPER ?
 * Une piste de fond ÉLUE, ou un fond VIDÉO non déclaré muet (le seul média
 * que le moteur joue avec le muet de l'hôte, `scene-player.tsx`). Jamais
 * `isDocumentAudible` (`scene-motion.ts`), qui dit si le document SONNE —
 * question voisine, dont la réponse montrait un bouton sans effet sur un son
 * de bibliothèque non servi ou une vidéo de premier plan toujours muette.
 */
export function sceneHasControllableSound(params: {
  readonly document: CanvasDocument;
  readonly sceneIndex: number;
  readonly carrier: SceneCarrier;
}): boolean {
  if (electBackgroundTrack(params) !== null) return true;
  const scene = params.document.scenes[params.sceneIndex];
  const fond = scene === undefined ? undefined : backgroundMedia(scene);
  return fond !== undefined && isVideoObject(fond) && fond.payload.muted !== true;
}
