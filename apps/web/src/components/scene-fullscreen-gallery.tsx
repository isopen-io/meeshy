import { Suspense, useMemo } from 'react';

import type { FeedCardModel } from '@/lib/feed/card-model';
import { publicationShareUrl } from '@/lib/feed/share-url';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';
import { sharePage } from '@/lib/view/viewer-page-offers';
import { preloadable } from '@/lib/view/preloadable';

import type { MediaViewerProps } from './media-viewer';
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
const sceneViewer = preloadable<MediaViewerProps>(() => import('./media-viewer'));
const MediaViewer = sceneViewer.Component;

/** Le doigt posé sur une scène du fil précharge la visionneuse (#8598) : au
 * relâcher, elle s'ouvre au premier rendu, jamais après un `Suspense` vide. */
export const preloadSceneViewer = sceneViewer.preload;

/**
 * « PARTAGER » D'UNE SCÈNE (#8884) — c'est la PUBLICATION qui part : une page
 * de scène n'est pas un fichier (`SCENE_MIME`, aucun octet à envoyer), et
 * l'hôte connaît le post. Un réel reste un réel (`isReel`), tout autre post un
 * POST. L'adresse canonique accompagne la demande pour « Plus d'options… ».
 */
function publicationRequest(model: Pick<FeedCardModel, 'id' | 'isReel' | 'text'>, thumbUrl: string | undefined): SendSheetRequest {
  const url = publicationShareUrl(model.id);
  const text = model.text?.full.trim() ?? '';
  return {
    intent: 'share',
    payload: {
      kind: 'publication',
      postId: model.id,
      postType: model.isReel ? 'REEL' : 'POST',
      url,
      preview: { kind: 'publication', ...(text === '' ? {} : { text }), ...(thumbUrl === undefined ? {} : { thumbUrl }) },
    },
    moreOptions: { url },
  };
}

export type SceneFullscreenGalleryProps = {
  readonly request: SceneGalleryRequest | null;
  readonly models: readonly FeedCardModel[];
  readonly preferredLanguages: readonly string[];
  readonly onClose: () => void;
};

export function SceneFullscreenGallery({ request, models, preferredLanguages, onClose }: SceneFullscreenGalleryProps) {
  /**
   * LE LOT SE COMPOSE UNE FOIS PAR PUBLICATION, PAS À CHAQUE RENDU DE L'HÔTE
   * (revue-correction #6902, Zero Unnecessary Re-render) — `composeSceneGallery
   * Lot` alloue un tableau, une carte et UNE PIÈCE PAR SCÈNE : sans ce mémo,
   * chaque rendu du fil (défilement, tirage, élection d'autoplay, et la
   * réévaluation à la MINUTE de `models`) rendait une nouvelle identité
   * d'`items`, de `scenes` et d'`entry` — donc un re-rendu des TROIS
   * `ScenePlayer` vivants de la fenêtre, pour un contenu identique. `models`
   * est la seule dépendance qui peut changer le lot ; `sceneIndex` n'entre
   * pas (la page courante est un état de la visionneuse, semé à l'entrée).
   */
  const postId = request?.postId;
  const composed = useMemo(() => {
    if (postId === undefined) return undefined;
    const found = models.find((m) => m.id === postId);
    if (found === undefined) return undefined;
    const lot = composeSceneGalleryLot(found);
    if (lot === undefined || lot.items.length === 0) return undefined;
    // #6985 — l'avatar était DÉJÀ résolu sur `FeedCardAuthor.avatarSrc` ; seul
    // le type du carrier le jetait. La scène plein écran d'un post montre donc
    // le même visage que sa carte dans le fil.
    const carrier: MediaCarrier = {
      sender: { displayName: found.author.name, avatarUrl: found.author.avatarSrc ?? null },
      sentAt: found.createdAt,
      caption: null,
      ...(found.trackingLinks === undefined ? {} : { trackingLinks: found.trackingLinks }),
    };
    return { lot, carrier, found };
  }, [models, postId]);

  if (request === null || composed === undefined) return null;
  const { lot, carrier, found } = composed;

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
        actionsAt={(index) => {
          const page = lot.items[index];
          return page === undefined ? null : sharePage(page, publicationRequest(found, page.thumbnailUrl));
        }}
      />
    </Suspense>
  );
}
