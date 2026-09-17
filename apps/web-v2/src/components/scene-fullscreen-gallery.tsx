import { Suspense, lazy } from 'react';

import type { FeedCardModel } from '@/lib/feed/card-model';
import { boundedSceneIndex, composeSceneGalleryLot } from '@/lib/feed/gallery-lot';
import type { SceneGalleryRequest } from '@/lib/feed/use-scene-gallery';
import type { MediaCarrier } from '@/lib/view/media';

/**
 * `SceneFullscreenGallery` (#6902) — LE PONT ENTRE `useSceneGallery`
 * (l'ÉTAT : quelle scène, de quel post) ET `MediaViewer` (LA VISIONNEUSE,
 * réutilisée — jamais un second plein écran, voir le fait qui gouverne la
 * spécification). Chunk À LA DEMANDE (`lazy`, même motif que
 * `attachment-blocks.tsx`) : monté SEULEMENT quand `request !== null`.
 *
 * `carrier` porte l'auteur et la date DU POST (`FeedCardModel.author.name`,
 * `.createdAt`, #6902 item G) — la MÊME identité pour toutes les pages du lot,
 * la légende PAR PAGE venant de `scenes.get(id).caption` (`CarrierFooter`,
 * `media-viewer.tsx`), jamais de `carrier.caption` ici (`caption: null`).
 */
const MediaViewer = lazy(() => import('./media-viewer'));

export type SceneFullscreenGalleryProps = {
  readonly request: SceneGalleryRequest | null;
  readonly models: readonly FeedCardModel[];
  readonly preferredLanguages: readonly string[];
  readonly onClose: () => void;
};

export function SceneFullscreenGallery({ request, models, preferredLanguages, onClose }: SceneFullscreenGalleryProps) {
  if (request === null) return null;
  const model = models.find((m) => m.id === request.postId);
  const lot = model === undefined ? undefined : composeSceneGalleryLot(model);
  if (model === undefined || lot === undefined || lot.items.length === 0) return null;

  const carrier: MediaCarrier = { sender: { displayName: model.author.name }, sentAt: model.createdAt, caption: null };

  return (
    <Suspense fallback={null}>
      <MediaViewer
        items={lot.items}
        scenes={lot.scenes}
        startIndex={boundedSceneIndex(lot.items.length, request.sceneIndex)}
        onClose={onClose}
        languages={preferredLanguages}
        fallbackLanguage={preferredLanguages[0] ?? 'fr'}
        carrier={carrier}
      />
    </Suspense>
  );
}
