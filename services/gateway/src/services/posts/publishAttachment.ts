/**
 * Publier une pièce jointe reçue en conversation, sans la retélécharger.
 *
 * La feuille de partage offre les conversations ET les trois destinations
 * publiques. Quand une destination publique est retenue, le fichier existe déjà
 * sur le stockage : le faire redescendre chez le client pour le remonter serait
 * payer deux fois la bande passante d'un octet qui n'a pas bougé.
 *
 * ─── Pourquoi on DUPLIQUE le fichier plutôt que de partager son chemin ────
 *
 * Un `PostMedia` qui pointerait sur le fichier d'un `MessageAttachment` serait
 * une bombe : `reclaimMediaRowBytes` (services/posts) efface les octets d'un
 * média de post en ne consultant qu'une seule table de références — `Sound`. Les
 * pièces jointes de messages n'y figurent pas. Supprimer le post effacerait donc
 * le fichier SOUS la conversation, et la photo disparaîtrait d'un fil où
 * personne n'a rien supprimé. C'est le motif exact qui a déjà détruit des
 * avatars dans ce dépôt.
 *
 * On réutilise donc `MediaStorage.planDuplicate`, l'outil que le snapshot de
 * repost emploie pour la même raison : deux vies distinctes pour un même
 * contenu, chacune maîtresse de la sienne.
 *
 * ─── L'accès se VÉRIFIE, il ne se déduit pas d'un identifiant ──────────────
 *
 * Un identifiant de pièce jointe est un ObjectId : devinable en le lisant dans
 * une réponse, transmissible. Sans contrôle, publier « depuis un attachement »
 * deviendrait une porte pour exfiltrer le média d'une conversation dont on n'est
 * pas membre — vers un post PUBLIC, qui plus est. L'appelant doit donc être
 * membre de la conversation qui porte le message.
 */
import type { PostType, PostVisibility } from '@meeshy/shared/types/post';
import {
  defaultPublicationTargetFor,
  postTypeForPublicationTarget,
  type PublicationTarget,
} from '@meeshy/shared/utils/forward-to-publication';

/** La pièce jointe telle que cette décision a besoin de la lire. */
export type PublishableAttachment = {
  readonly id: string;
  readonly messageId: string | null;
  readonly mimeType: string;
  readonly fileUrl: string;
  readonly thumbnailUrl: string | null;
  readonly originalName: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly duration: number | null;
  readonly codec: string | null;
  readonly thumbHash: string | null;
};

export type PublishRefusal =
  | 'attachment-not-found'
  | 'attachment-not-in-a-message'
  | 'forbidden'
  | 'protected-media'
  | 'unpublishable-media';

export type PublishPlan = {
  readonly postType: PostType;
  readonly attachment: PublishableAttachment;
};

/**
 * Décide si une pièce jointe peut devenir la publication demandée, et sous quel
 * type. Fonction PURE : l'accès est déjà tranché par l'appelant, qui seul sait
 * interroger la base.
 *
 * `target` absent laisse la règle choisir (image → POST, vidéo/son → REEL). Une
 * STORY n'est jamais choisie par défaut : elle expire, donc elle se demande.
 */
export const planAttachmentPublication = (input: {
  readonly attachment: PublishableAttachment | null;
  readonly callerIsMemberOfConversation: boolean;
  /**
   * Verdict de protection, calculé par l'APPELANT — seul à interroger la base.
   *
   * La protection d'un média se lit à DEUX niveaux qui ne se suivent pas : le
   * MESSAGE parent (une vraie vue unique / flou / éphémère / chiffré y est
   * rangée par `MessageProcessor.saveMessage`) ET la PIÈCE JOINTE (ses propres
   * `isViewOnce` / `isBlurred` / `effectFlags`). Le plan reçoit donc le VERDICT,
   * pas les colonnes : les prédicats partagés `protectedPreview` +
   * `maskedAttachment` (NotificationService) le composent, et ne peuvent pas
   * diverger de la bannière de notification qui les emploie déjà.
   */
  readonly mediaIsProtected: boolean;
  readonly target?: PublicationTarget;
}): { readonly ok: true; readonly plan: PublishPlan } | { readonly ok: false; readonly reason: PublishRefusal } => {
  const { attachment, callerIsMemberOfConversation, mediaIsProtected, target } = input;

  if (!attachment) return { ok: false, reason: 'attachment-not-found' };

  // Une pièce jointe orpheline (`messageId` nul) n'a pas de conversation, donc
  // pas de membres, donc aucune appartenance à vérifier — refuser plutôt que de
  // laisser passer un média dont personne ne garde la porte.
  if (!attachment.messageId) return { ok: false, reason: 'attachment-not-in-a-message' };

  // L'appartenance se vérifie AVANT le type : répondre « ce média n'est pas
  // publiable » à un tiers lui confirmerait déjà l'existence de la pièce jointe
  // et sa nature.
  if (!callerIsMemberOfConversation) return { ok: false, reason: 'forbidden' };

  // Un média PROTÉGÉ ne se publie jamais — vue unique, flou, éphémère et
  // chiffrement disent tous « ce contenu ne sort pas de cette conversation ».
  // Le refus vit APRÈS l'appartenance (un non-membre reçoit toujours `forbidden`
  // d'abord, pour ne rien divulguer) et AVANT la déduction de format (inutile
  // de raisonner sur un type qu'on ne publiera pas).
  if (mediaIsProtected) return { ok: false, reason: 'protected-media' };

  const fallback = defaultPublicationTargetFor(attachment.mimeType);
  if (!fallback) return { ok: false, reason: 'unpublishable-media' };

  return {
    ok: true,
    plan: {
      postType: postTypeForPublicationTarget(target ?? fallback),
      attachment,
    },
  };
};

/**
 * Les champs d'un `PostMedia` construits depuis la pièce jointe et le fichier
 * fraîchement dupliqué. La métadonnée VISUELLE suit la copie — dimensions,
 * durée, codec, empreinte de vignette — parce qu'elle décrit le contenu, pas son
 * emplacement ; l'URL et le chemin viennent de la copie, jamais de la source.
 */
export const postMediaFieldsFromAttachment = (input: {
  readonly attachment: PublishableAttachment;
  readonly duplicated: { readonly fileUrl: string; readonly filePath: string; readonly fileName: string; readonly fileSize: number; readonly mimeType: string };
  readonly duplicatedThumbnailUrl?: string | null;
  readonly uploaderId: string;
}) => {
  const { attachment, duplicated, duplicatedThumbnailUrl, uploaderId } = input;
  return {
    postId: null,
    uploaderId,
    fileName: duplicated.fileName,
    originalName: attachment.originalName,
    mimeType: duplicated.mimeType,
    fileSize: duplicated.fileSize,
    filePath: duplicated.filePath,
    fileUrl: duplicated.fileUrl,
    thumbnailUrl: duplicatedThumbnailUrl ?? null,
    thumbHash: attachment.thumbHash,
    width: attachment.width,
    height: attachment.height,
    duration: attachment.duration,
    codec: attachment.codec,
  };
};

/** Visibilité par défaut d'une publication née d'un partage. */
export const DEFAULT_PUBLICATION_VISIBILITY: PostVisibility = 'PUBLIC';

/**
 * Visibilité par défaut d'une publication née d'un partage, SELON son type.
 *
 * Une STORY expire en 24 h et s'adresse d'abord au cercle proche : la publier
 * PUBLIQUE par défaut la sortirait de ce cercle sans que l'auteur l'ait
 * demandé. Elle tombe donc sur FRIENDS, exactement comme `POST /posts`. Tout
 * autre type reste PUBLIC. `DEFAULT_PUBLICATION_VISIBILITY` demeure pour les
 * appelants qui veulent la constante nue.
 */
export const defaultVisibilityForPostType = (postType: PostType): PostVisibility =>
  postType === 'STORY' ? 'FRIENDS' : 'PUBLIC';
