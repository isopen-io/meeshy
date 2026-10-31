import { storyDownloadableMedia } from '@/lib/api/story-export';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasDocument } from '@/lib/canvas/document';
import type { FeedCardModel } from '@/lib/feed/card-model';
import { storyCarrier } from '@/lib/stories/carrier';
import { playedStoryScene, type StoryPlaybackStory } from '@/lib/stories/playback';

/**
 * **CE QU'UN EXPORT REND** (#13873) — la scène que le lecteur JOUE (loi 6) :
 * celle d'une story (la sienne, ou celle de sa source pour un repartage,
 * `playedStoryScene`), celle d'un post à scène ou d'un réel (`model.scene`).
 * Le filigrane nomme l'AUTEUR (`MeeshyExportWatermark` iOS : « meeshy
 * @pseudo »). Module LÉGER, chargé avec le menu : le moteur de rendu, lui,
 * ne se charge qu'au geste.
 */

export type SceneExportSubject = {
  /** La clé du job d'export — `story:<id>` ou `post:<id>`. */
  readonly key: string;
  readonly fileStem: string;
  readonly document: CanvasDocument;
  readonly carrier: SceneCarrier;
  readonly watermark: string | null;
};

/** Le filigrane d'un export : le @ de l'auteur, ou rien. */
export const watermarkHandle = (username: string | null | undefined): string | null =>
  typeof username === 'string' && username.trim() !== '' ? `@${username.trim()}` : null;

export function storyExportSubject(story: StoryPlaybackStory | undefined): SceneExportSubject | null {
  if (story === undefined) return null;
  const played = playedStoryScene(story);
  if (played === null) return null;
  return {
    key: `story:${story.id}`,
    fileStem: `story-${story.id}`,
    document: played.document,
    carrier: storyCarrier(played.carrierStory),
    watermark: watermarkHandle(story.author?.username),
  };
}

export function postExportSubject(model: Pick<FeedCardModel, 'id' | 'isReel' | 'scene' | 'author'>): SceneExportSubject | null {
  if (model.scene === undefined) return null;
  return {
    key: `post:${model.id}`,
    fileStem: `${model.isReel ? 'reel' : 'post'}-${model.id}`,
    document: model.scene.document,
    carrier: model.scene.carrier,
    watermark: watermarkHandle(model.author.username),
  };
}

/** Un média nu (pièce d'un commentaire, média d'une story v1) que l'export sait composer. */
export type ExportableMedia = {
  readonly id: string;
  /** L'adresse RÉSOLUE du fichier. */
  readonly src: string;
  readonly mimeType: string;
  readonly width?: number | null;
  readonly height?: number | null;
  /** Connue ⇒ la scène dure exactement le média ; absente ⇒ la loi de durée du lecteur. */
  readonly durationMs?: number | null;
};

const positive = (value: number | null | undefined): number | undefined => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined);

/**
 * **UN MÉDIA SEUL, COMPOSÉ COMME UNE SCÈNE** (#13881) — « Imager » d'un média
 * ouvert depuis un commentaire, « Partager » d'une story v1 : le fichier en
 * FOND AJUSTÉ (`videoFitMode: 'fit'`, bandes floues comme le lecteur), le son
 * d'une vidéo dans la piste, le filigrane de l'auteur. Le même moteur rend
 * ce document que celui d'une story : une image sort en image fixe, une
 * vidéo à sa durée — au-delà d'une minute, « Imager » propose ses parts.
 * `null` : ni image ni vidéo, ou aucune adresse.
 */
export function mediaExportSubject(params: {
  readonly key: string;
  readonly fileStem: string;
  readonly media: ExportableMedia;
  readonly watermark: string | null;
}): SceneExportSubject | null {
  const { media } = params;
  const video = media.mimeType.startsWith('video/');
  if ((!video && !media.mimeType.startsWith('image/')) || media.src === '') return null;
  const width = positive(media.width);
  const height = positive(media.height);
  const durationMs = video ? positive(media.durationMs) : undefined;
  return {
    key: params.key,
    fileStem: params.fileStem,
    document: {
      v: 3,
      scenes: [
        {
          id: `media-${media.id}`,
          ...(durationMs !== undefined ? { timelineDuration: durationMs / 1000 } : {}),
          objects: [
            {
              id: media.id,
              kind: 'media',
              anchor: { t: 'free', x: 0.5, y: 0.5 },
              plane: 'bg',
              z: 0,
              transform: { scale: 1, rotation: 0, opacity: 1 },
              payload: {
                postMediaId: media.id,
                mediaType: media.mimeType,
                isBackground: true,
                transform: { videoFitMode: 'fit' },
                ...(width !== undefined && height !== undefined ? { aspectRatio: width / height } : {}),
              },
            },
          ],
        },
      ],
    },
    carrier: {
      postId: params.key,
      media: [{ id: media.id, src: media.src, mimeType: media.mimeType, ...(width !== undefined ? { width } : {}), ...(height !== undefined ? { height } : {}) }],
    },
    watermark: params.watermark,
  };
}

/** Une story v1 (sans document) — son média exportable, composé seul. */
export function storyMediaExportSubject(story: StoryPlaybackStory | undefined): SceneExportSubject | null {
  if (story === undefined) return null;
  const media = storyDownloadableMedia(story);
  if (media === null || typeof media.mimeType !== 'string') return null;
  const [carried] = storyCarrier({ id: story.id, media: [media] }).media;
  if (carried === undefined) return null;
  return mediaExportSubject({
    key: `story:${story.id}`,
    fileStem: `story-${story.id}`,
    media: { id: media.id, src: carried.src, mimeType: media.mimeType, width: media.width ?? null, height: media.height ?? null },
    watermark: watermarkHandle(story.author?.username),
  });
}

type AudioContextConstructor = new () => AudioContext;

/**
 * Le contexte audio de l'export, créé DANS le geste : hors d'une activation,
 * Safari le laisse suspendu et la vidéo sortirait muette. `null` sans Web Audio.
 */
export function gestureAudioContext(scope: { readonly AudioContext?: unknown; readonly webkitAudioContext?: unknown } = globalThis): AudioContext | null {
  const Constructor = (scope.AudioContext ?? scope.webkitAudioContext) as AudioContextConstructor | undefined;
  if (typeof Constructor !== 'function') return null;
  try {
    const context = new Constructor();
    void context.resume().catch(() => undefined);
    return context;
  } catch {
    return null;
  }
}
