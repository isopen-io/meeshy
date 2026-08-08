import type { Prisma } from '@meeshy/shared/prisma/client';
import type { ContentTrackingLink } from '../TrackingLinkService';

/**
 * Le message tel que la réconciliation de liens le lit. Structural et minimal,
 * même raison que `MentionTargetMessage` : les deux appelants d'édition ne
 * tiennent pas le même objet Prisma, et rien ici n'a besoin de plus.
 */
export interface LinkTargetMessage {
  readonly id: string;
  readonly conversationId: string;
}

/**
 * Les deux méthodes de `TrackingLinkService` que la réconciliation appelle, en
 * structural pour que le double de test reste trivial et pour qu'un handler
 * socket n'ait pas à instancier la classe entière.
 *
 * Elles répondent à deux questions DIFFÉRENTES sur le même texte, et c'est
 * pourquoi il en faut deux :
 *
 *  - `processExplicitLinksInContent` RÉÉCRIT le contenu : `[[url]]` et `<url>`
 *    deviennent `m+<token>`. L'utilisateur a demandé le tracking par sa syntaxe,
 *    le lien lisible est remplacé.
 *  - `collectContentTrackingLinks` LAISSE le contenu intact et rend le mapping
 *    `url → token` des URLs BRUTES, rangé dans `metadata.trackingLinks`. Le
 *    client pointe le lien vers `/l/<token>` tout en gardant l'URL affichable et
 *    son aperçu vidéo.
 */
export interface LinkReconciler {
  processExplicitLinksInContent(params: {
    content: string;
    conversationId: string;
    messageId?: string;
    createdBy?: string;
  }): Promise<{ processedContent: string }>;
  collectContentTrackingLinks(params: {
    content: string;
    conversationId?: string;
    createdBy?: string;
    messageId?: string;
  }): Promise<ContentTrackingLink[]>;
}

export interface ReconciledLinks {
  /**
   * Le contenu À PERSISTER. Toujours défini, y compris quand la réconciliation
   * échoue : le texte que l'utilisateur vient d'écrire n'est pas optionnel, et
   * une panne de tracking ne doit pas annuler son édition. En échec, c'est le
   * contenu d'entrée, non réécrit.
   */
  readonly processedContent: string;
  /** Le mapping `url → token` des URLs brutes du contenu RÉÉCRIT. */
  readonly trackingLinks: readonly ContentTrackingLink[];
  /**
   * `true` quand `trackingLinks` DÉCRIT le message — y compris vide, parce que
   * le texte édité ne porte plus aucune URL brute.
   *
   * `false` quand rien n'a pu être établi : service absent, traitement en
   * échec. Même distinction que `ResolvedMentions.reconciled`, et pour la même
   * raison : sans elle, un appelant recopie `[]` dans `metadata` et efface un
   * mapping vivant sur une panne transitoire. Un lien de tracking effacé ne
   * revient jamais — personne ne relit le texte après coup — et le clic part
   * alors vers l'URL d'origine sans jamais être compté.
   */
  readonly reconciled: boolean;
}

export interface EditedLinkParams {
  linkService: LinkReconciler | null | undefined;
  message: LinkTargetMessage;
  /** Le contenu édité, déjà `trim()`. */
  content: string;
  /** L'AUTEUR de l'édition, en `User.id` — c'est lui qui crédite le lien créé. */
  editorUserId: string;
  onError?: (error: unknown) => void;
}

/**
 * Ce que TOUT message porteur d'une URL doit à ses liens, après édition.
 *
 * Cette unité existe parce que l'obligation était éclatée en deux moitiés dont
 * aucun écrivain ne tenait les deux :
 *
 *  - `MessageHandler.handleMessageEdit` (transport d'édition PRIMAIRE) n'en
 *    tenait AUCUNE : éditer un message pour y coller `[[https://…]]` persistait
 *    les crochets en toutes lettres, définitivement. Le même geste par REST
 *    créait le lien. Sixième asymétrie du même handler.
 *  - NI REST NI socket ne recomposait `metadata.trackingLinks`. Ce mapping n'est
 *    écrit qu'à la CRÉATION (`MessageProcessor.saveMessage`) : ajouter une URL
 *    brute par édition la laissait intraçable pour toujours, et la remplacer
 *    laissait en base le token d'une URL que le texte ne contient plus. Un
 *    message qui, envoyé tel quel, aurait été tracé ne l'était pas s'il avait
 *    été obtenu par édition.
 *
 * Les deux moitiés portent sur le MÊME texte et dans cet ordre obligé — le
 * mapping des URLs brutes se calcule sur le contenu DÉJÀ réécrit, sinon une URL
 * qui vient de devenir `m+<token>` serait recollectée comme si elle était encore
 * brute et recevrait un second token. Les souder en un point d'appel public est
 * ce qui empêche un septième écrivain d'en oublier une.
 *
 * Best-effort de bout en bout — ne lève jamais. Un lien perdu ne doit pas
 * transformer une édition réussie en 500.
 */
export async function reconcileEditedLinks(params: EditedLinkParams): Promise<ReconciledLinks> {
  const { linkService, message, content, editorUserId, onError } = params;

  // Sans service, rien n'est traçable — donc rien n'est réconciliable. En
  // conclure que le message ne porte plus de lien effacerait le mapping d'un
  // texte qui le porte toujours.
  if (!linkService) return { processedContent: content, trackingLinks: [], reconciled: false };

  try {
    const { processedContent } = await linkService.processExplicitLinksInContent({
      content,
      conversationId: message.conversationId,
      messageId: message.id,
      createdBy: editorUserId,
    });

    const trackingLinks = await linkService.collectContentTrackingLinks({
      content: processedContent,
      conversationId: message.conversationId,
      messageId: message.id,
      createdBy: editorUserId,
    });

    return { processedContent, trackingLinks, reconciled: true };
  } catch (error) {
    onError?.(error);
    return { processedContent: content, trackingLinks: [], reconciled: false };
  }
}

/**
 * `metadata` recomposé avec le mapping de liens qu'on vient d'établir.
 *
 * `Message.metadata` est un `Json?` PARTAGÉ : il porte aussi `postReplyTo` (le
 * snapshot gelé du post cité, irrécupérable après expiration de la story) et
 * `location` (le lieu partagé). Écrire `{ trackingLinks }` par-dessus détruirait
 * les deux — d'où la lecture-modification-écriture plutôt qu'une affectation.
 *
 * `null` quand il ne reste plus rien à ranger : un message dont on vient de
 * retirer la dernière URL, et qui ne portait que ce mapping, n'a plus de
 * métadonnée du tout. Rendre `{}` laisserait en base un objet vide qui ment sur
 * la présence de métadonnées.
 */
export function mergeTrackingLinksIntoMetadata(
  existingMetadata: unknown,
  trackingLinks: readonly ContentTrackingLink[]
): Prisma.InputJsonValue | null {
  const base =
    existingMetadata !== null && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata)
      ? { ...(existingMetadata as Record<string, unknown>) }
      : {};

  delete base.trackingLinks;
  if (trackingLinks.length > 0) base.trackingLinks = trackingLinks.map((link) => ({ ...link }));

  return Object.keys(base).length > 0 ? (base as Prisma.InputJsonValue) : null;
}
