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

const handleOf = (username: string | undefined): string | null =>
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
    watermark: handleOf(story.author?.username),
  };
}

export function postExportSubject(model: Pick<FeedCardModel, 'id' | 'isReel' | 'scene' | 'author'>): SceneExportSubject | null {
  if (model.scene === undefined) return null;
  return {
    key: `post:${model.id}`,
    fileStem: `${model.isReel ? 'reel' : 'post'}-${model.id}`,
    document: model.scene.document,
    carrier: model.scene.carrier,
    watermark: handleOf(model.author.username),
  };
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
