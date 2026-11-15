import { contentExitLawOfSource, type ContentExitProjection } from '@meeshy/shared/utils/content-exit-law';

/**
 * #10429 — UN MESSAGE QUI DISPARAÎT NE SORT PAS PAR LA RECHERCHE.
 *
 * La recherche rend un message par son CONTENU : une vue unique ou une flamme
 * (à durée, après lecture, ou déclarée par sa seule échéance) y voyagerait en
 * clair jusqu'à l'appareil, et le seul fait qu'elle RÉPONDE à la requête dirait
 * un mot de son texte. La loi de sortie en décide, sur le message ET ses pièces
 * jointes, fermée sur toute colonne non lue : seul un contenu ordinaire paraît.
 * Le flou n'est pas une disparition.
 *
 * Miroir serveur de `GlobalSearchViewModel.appearsInSearch` (iOS, #9619). Les
 * deux portes de recherche de la passerelle l'appliquent :
 * `GET …/messages/search` et `GET …/messages?view=search`.
 */
export const SEARCH_EXIT_LAW_SELECT = {
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
  ephemeralDuration: true,
  expiresAt: true,
  attachments: { select: { isViewOnce: true, isBlurred: true, effectFlags: true } },
} as const;

export const appearsInSearch = (message: ContentExitProjection): boolean =>
  contentExitLawOfSource(message).nature === 'ordinary';
