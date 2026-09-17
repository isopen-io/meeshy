import { attachmentSrc } from '@/lib/api/media-url';
import { objectMediaIdentity, type SceneCarrier, type SceneCarrierMedia } from '@/lib/canvas/carrier';
import type { CanvasScene } from '@/lib/canvas/document';
import { backgroundMedia } from '@/lib/feed/scene-framing';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';

import { storyMediaUrl, type StoryPlaybackStory } from './playback';

/**
 * LE PORTEUR D'UNE STORY DE SCÈNE (#6899) — les médias RÉELS de la story,
 * que le moteur relie aux objets du document par `postMediaId ?? mediaId`
 * (`objectMediaIdentity`, `lib/canvas/carrier.ts`).
 *
 * Deux règles, chacune payée sur les données de `gate.staging.meeshy.me`
 * (relevé du 2026-09-17, sept stories v3 sur huit) :
 *
 * - l'adresse se lit par {@link storyMediaUrl} (`fileUrl`, la clé servie) —
 *   la première forme lisait `url`, que la passerelle ne sert pas : chaque
 *   entrée du porteur valait `''` ;
 * - une entrée SANS adresse n'entre pas dans le porteur. Le moteur préfère le
 *   porteur au `mediaURL` de l'objet (`scene-player.tsx#mediaSrcOf`) : une
 *   entrée vide y MASQUAIT l'adresse que l'objet portait lui-même, et le fond
 *   devenait un `<img src="">`.
 */
export function storyCarrier(story: Pick<StoryPlaybackStory, 'id' | 'media'>): SceneCarrier {
  const media = (story.media ?? []).flatMap((m): readonly SceneCarrierMedia[] => {
    const url = storyMediaUrl(m);
    if (url === '') return [];
    const poster =
      typeof m.thumbnailUrl === 'string' && m.thumbnailUrl !== ''
        ? attachmentSrc(m.thumbnailUrl)
        : thumbHashPlaceholder(typeof m.thumbHash === 'string' ? m.thumbHash : undefined);
    return [
      {
        id: m.id,
        src: attachmentSrc(url),
        ...(typeof m.mimeType === 'string' && m.mimeType !== '' ? { mimeType: m.mimeType } : {}),
        ...(typeof m.width === 'number' && m.width > 0 ? { width: m.width } : {}),
        ...(typeof m.height === 'number' && m.height > 0 ? { height: m.height } : {}),
        ...(poster !== undefined ? { poster } : {}),
      },
    ];
  });
  return { postId: story.id, media };
}

/**
 * L'EMPREINTE DU FOND PLEIN ÉCRAN DU LECTEUR — `resolvedBackdropImage(for:)`
 * (`StoryViewerView+Canvas.swift:2108-2134`), dans SON ordre : le ThumbHash
 * de la SLIDE (le composite), puis celui du MÉDIA DE FOND — porté par l'objet
 * (`payload.thumbHash`, report de la conversion v1→v3) ou par la pièce du
 * post qu'il désigne. `undefined` ⇒ aucun fond flou (`Color.clear` côté iOS),
 * le noir du lecteur se voit.
 *
 * L'ordre est l'INVERSE de `letterboxHashes` (`letterbox.ts`), et ce n'est pas
 * une divergence : le fond du lecteur habille l'écran AUTOUR de la scène, la
 * bande habille la scène AUTOUR du média (`StoryLetterboxFill.swift:153-156`).
 */
export function readerBackdropHash(scene: CanvasScene, story: Pick<StoryPlaybackStory, 'media'>): string | undefined {
  if (scene.thumbHash !== undefined) return scene.thumbHash;
  const fond = backgroundMedia(scene);
  if (fond === undefined) return undefined;
  if (typeof fond.payload.thumbHash === 'string' && fond.payload.thumbHash !== '') return fond.payload.thumbHash;
  const identity = objectMediaIdentity(fond);
  const served = identity === null ? undefined : story.media?.find((m) => m.id === identity)?.thumbHash;
  return typeof served === 'string' && served !== '' ? served : undefined;
}
