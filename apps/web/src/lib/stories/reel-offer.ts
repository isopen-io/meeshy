import { offersReelForPost } from '@meeshy/shared/utils/reel-composition';

import { studioReelMedia, type PublicationKind } from './publication-kind';
import type { StudioDraft } from './studio';

/**
 * **UN POST À UNE SEULE VIDÉO PROPOSE LE RÉEL** (#8603, demande porteur
 * 2026-09-28) — à l'appui sur Publier, un POST dont le seul média est UNE
 * vidéo ouvre le modal « C'est un Réel / C'est un Post ». La règle est celle
 * de `@meeshy/shared` (`offersReelForPost`, miroir iOS
 * `ReelComposition.offersReelForPost`) ; le studio ne fait que lui remettre
 * ses médias, toutes pages aplaties (`studioReelMedia`).
 *
 * Le studio ne compose ni repost ni édition : ces deux portes vivent ailleurs
 * (`publication-edit-sheet`, `post-repost-confirm`).
 */
export function studioOffersReel(params: {
  readonly draft: StudioDraft;
  readonly kind: PublicationKind;
  readonly formatChosenByAuthor: boolean;
}): boolean {
  return offersReelForPost({
    type: params.kind,
    media: studioReelMedia(params.draft),
    isRepost: false,
    isEdit: false,
    formatChosenByAuthor: params.formatChosenByAuthor,
  });
}
