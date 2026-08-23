/**
 * Où atterrit une pièce jointe qu'on republie depuis une conversation.
 *
 * Transférer un média à quelqu'un et le PUBLIER sont deux gestes voisins et un
 * seul point de départ : la feuille de partage. Elle offre donc, à côté des
 * conversations, les trois destinations publiques — et le format n'est pas un
 * choix de plus à faire, il DÉCOULE du média :
 *
 *   - une image devient un POST : elle se regarde, elle se garde ;
 *   - une vidéo ou un son deviennent un REEL — c'est le fil qui sait les jouer,
 *     et un son publié en POST n'aurait aucune surface pour être écouté ;
 *   - une STORY accepte l'un et l'autre, mais jamais par déduction : elle
 *     expire en 24 h, donc elle se DEMANDE, elle ne se devine pas.
 *
 * Les documents, PDF et fichiers de code n'ont aucune destination publique : le
 * fil ne sait pas les rendre. Les proposer produirait un post vide portant une
 * pièce jointe invisible.
 *
 * Règle jumelle à tenir avec `attachment-message-type.ts` : c'est la MÊME
 * question — « de quelle nature est ce fichier ? » — posée pour une autre
 * décision. Les deux lisent le type MIME, jamais l'extension du nom, qu'un
 * client peut écrire à sa guise.
 */
import type { PostType } from '../types/post.js';
import { messageTypeFromMimeTypes } from './attachment-message-type.js';

/** Ce que la feuille de partage peut proposer pour une pièce jointe donnée. */
export type PublicationTarget = 'POST' | 'REEL' | 'STORY';

/**
 * Le format qu'une pièce jointe prend quand on la publie SANS le préciser.
 * `null` quand le média n'a aucune surface publique (document, PDF, code).
 *
 * La STORY n'en sort jamais : son caractère éphémère est un choix, pas une
 * conséquence du type de fichier.
 */
export const defaultPublicationTargetFor = (mimeType: string | null | undefined): PublicationTarget | null => {
  switch (messageTypeFromMimeTypes([mimeType ?? ''])) {
    case 'image':
      return 'POST';
    case 'video':
    case 'audio':
      return 'REEL';
    default:
      return null;
  }
};

/**
 * Les destinations publiques offertes pour une pièce jointe, dans l'ordre où la
 * feuille les présente. Vide quand le média n'en a aucune — l'appelant n'affiche
 * alors pas la section, plutôt que d'afficher une section vide.
 */
export const publicationTargetsFor = (
  mimeType: string | null | undefined,
): readonly PublicationTarget[] => {
  const fallback = defaultPublicationTargetFor(mimeType);
  return fallback ? [fallback, 'STORY'] : [];
};

/**
 * Le `PostType` à créer pour une destination retenue. Une STORY est un post de
 * type STORY — c'est le modèle du dépôt, pas une approximation.
 */
export const postTypeForPublicationTarget = (target: PublicationTarget): PostType => target;

/**
 * Publier un média que l'appareil vient de CAPTURER se confirme.
 *
 * Transférer une photo à un ami et la publier à tout un fil sont deux gestes que
 * la même feuille rend voisins, et la seconde est irréversible du point de vue
 * de qui l'a prise : une photo sortie de la caméra n'a encore été vue par
 * personne. Une image choisie dans la galerie a déjà été gardée, regardée,
 * éventuellement partagée ; une note vocale qu'on vient d'enregistrer, non.
 *
 * La provenance ne peut PAS être décidée par le serveur : rien dans le fichier
 * ne distingue une photo prise à l'instant d'une photo importée. Seul le client
 * qui a ouvert la caméra ou le micro le sait — c'est donc lui qui le déclare, et
 * cette règle vit ici pour que les trois clients posent la même question.
 */
export const publicationNeedsCaptureConfirmation = (input: {
  readonly capturedInApp: boolean;
  readonly target: PublicationTarget;
}): boolean => input.capturedInApp;
