import type { FeedCardModel } from '@/lib/feed/card-model';
import { openPublicationImage, type PublicationImageRequest } from '@/lib/export/publication-image-store';

/**
 * « IMAGER » UN RÉEL (#16333, #16393) — la baguette du rail ouvre l'ATELIER DE
 * CARTE, le même que l'entrée « Imager » du menu « … » : un réel simple y
 * arrive avec sa vidéo et son texte servi, un réel composé avec sa scène à
 * rendre en média. La demande se compose au geste ; la loi (`postImagingOf`)
 * ne se charge qu'alors.
 */
export type ReelImageOpener = (request: PublicationImageRequest) => void;

export function reelImager(open: ReelImageOpener = openPublicationImage): (model: FeedCardModel) => Promise<void> {
  return (model) =>
    import('@/lib/export/publication-image').then(({ postImageRequestOf }) => {
      const request = postImageRequestOf(model);
      if (request !== null) open(request);
    });
}

/** Le départ du navigateur — une référence STABLE, que la page mémoïsée du réel reçoit. */
export const imagerReel = reelImager();
