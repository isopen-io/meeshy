import type { Prisma } from '@meeshy/shared/prisma/client';
import type { ContentTrackingLink } from '../TrackingLinkService';

/**
 * La seule méthode de `TrackingLinkService` que cette unité appelle, en
 * structural pour la même raison que `MentionResolver` : le double de test
 * reste trivial et l'unité n'importe pas la classe entière.
 *
 * Le retour est volontairement rétréci à `processedContent` — aucun des trois
 * appelants ne consomme la liste des liens créés, et ce qu'un contrat ne promet
 * pas ne peut pas se retrouver oublié à moitié.
 */
export interface ExplicitLinkProcessor {
  processExplicitLinksInContent(params: {
    content: string;
    conversationId: string;
    messageId?: string;
    createdBy?: string;
  }): Promise<{ processedContent: string }>;
}

export interface ExplicitLinkParams {
  trackingLinkService: ExplicitLinkProcessor | null | undefined;
  content: string;
  conversationId: string;
  /** Absent à l'ENVOI : le message n'existe pas encore quand ses liens sont mintés. */
  messageId?: string;
  /**
   * L'auteur du lien, en **`User.id`** — c'est ce que `TrackingLink.createdBy`
   * signifie, et c'est contre lui que la route `/tracking-links` filtre « mes
   * liens » et vérifie la propriété. `undefined` pour un auteur anonyme, ce que
   * le schéma prévoit (« null si anonyme »).
   */
  createdBy?: string;
  onError?: (error: unknown) => void;
}

/**
 * Les deux seules syntaxes qui FORCENT le tracking (`[[url]]`, `<url>`). Une
 * URL brute n'est jamais réécrite, et un lien markdown `[texte](url)` est
 * protégé puis restauré — donc un contenu qui n'en porte aucune ressort
 * identique à lui-même, au prix d'un aller-retour de protection markdown dont
 * il n'a aucun besoin.
 */
const TRACKABLE_SYNTAX = /\[\[|</;

/**
 * Un contenu porte-t-il de quoi produire un lien traçable ?
 *
 * Exporté pour que l'appelant puisse éviter ce qu'il ne peut pas savoir
 * inutile autrement — la résolution de l'auteur en `User.id`, qui coûte une
 * requête et ne sert à RIEN sur un texte sans lien. La définition reste ici,
 * une seule fois : deux réponses divergentes à « ce texte est-il traçable ? »
 * feraient payer la requête à des messages qui n'en produisent aucun, ou
 * l'économiseraient à des messages qui en produisent.
 */
export function hasTrackableLinkSyntax(content: string): boolean {
  return TRACKABLE_SYNTAX.test(content);
}

/**
 * Ce qu'un message doit aux liens qu'il contient : `[[url]]` et `<url>`
 * deviennent des `m+<token>` traçables — à l'envoi comme à l'édition, par
 * n'importe quel transport.
 *
 * Cette unité existe parce que l'obligation vivait en DEUX exemplaires
 * complets : `TrackingLinkService.processExplicitLinksInContent` (appelé par
 * l'édition REST) et `MessageProcessor.processLinksInContent` (appelé par
 * l'envoi) — mêmes quatre étapes, mêmes expressions régulières, même
 * réutilisation de token, ~90 lignes chacun. Deux copies d'un algorithme ne
 * restent pas d'accord : le correctif des séquences `$` (replacer fonction) a
 * dû être appliqué aux deux, séparément. Et c'est en les réunissant qu'on voit
 * qu'elles ne remplissaient même pas `createdBy` depuis le même espace d'ids.
 *
 * Le court-circuit vit ICI, pas chez l'appelant : un texte sans syntaxe
 * traçable ne doit coûter aucune requête, et c'est une garde qu'un nouvel
 * écrivain oublierait.
 *
 * Best-effort de bout en bout — ne lève jamais. Un lien perdu ne doit pas
 * transformer un envoi ou une édition réussis en 500 : le contenu ORIGINAL est
 * alors rendu, l'écriture aboutit, et `onError` laisse l'appelant journaliser
 * dans le contexte de sa requête.
 */
export async function processExplicitLinks(params: ExplicitLinkParams): Promise<string> {
  const { trackingLinkService, content, conversationId, messageId, createdBy, onError } = params;

  if (!trackingLinkService) return content;
  if (!hasTrackableLinkSyntax(content)) return content;

  try {
    const { processedContent } = await trackingLinkService.processExplicitLinksInContent({
      content,
      conversationId,
      messageId,
      createdBy,
    });
    return processedContent;
  } catch (error) {
    onError?.(error);
    return content;
  }
}

/**
 * Le message tel que la réconciliation de liens le lit. Structural et minimal,
 * même raison que `MentionTargetMessage` : les transports d'édition ne tiennent
 * pas le même objet Prisma, et rien ici n'a besoin de plus.
 */
export interface LinkTargetMessage {
  readonly id: string;
  readonly conversationId: string;
}

/**
 * La seconde question posée au même texte, et c'est pourquoi il en faut deux :
 * `processExplicitLinksInContent` RÉÉCRIT le contenu (`[[url]]`, `<url>` →
 * `m+<token>`), tandis que `collectContentTrackingLinks` le laisse INTACT et
 * rend le mapping `url → token` des URLs BRUTES, rangé dans
 * `metadata.trackingLinks`. Le client pointe alors le lien vers `/l/<token>`
 * tout en gardant l'URL affichable et son aperçu.
 */
export interface TrackingLinkCollector {
  collectContentTrackingLinks(params: {
    content: string;
    conversationId?: string;
    createdBy?: string;
    messageId?: string;
  }): Promise<ContentTrackingLink[]>;
}

export type LinkReconciler = ExplicitLinkProcessor & TrackingLinkCollector;

export interface ReconciledLinks {
  /**
   * Le contenu À PERSISTER. Toujours défini, y compris quand la réconciliation
   * échoue : le texte que l'utilisateur vient d'écrire n'est pas optionnel, et
   * une panne de tracking ne doit pas annuler son édition.
   */
  readonly processedContent: string;
  /** Le mapping `url → token` des URLs brutes du contenu RÉÉCRIT. */
  readonly trackingLinks: readonly ContentTrackingLink[];
  /**
   * Le mapping est-il ÉTABLI ? Distingue le vide « ce texte ne porte plus
   * d'URL » du vide « rien n'a pu être établi », et c'est toute la différence :
   * sans elle, un appelant recopie `[]` dans `metadata` et efface un mapping
   * vivant sur une panne transitoire. Un lien de tracking effacé ne revient
   * jamais — personne ne relit le texte après coup — et le clic part alors vers
   * l'URL d'origine sans jamais être compté.
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
 * L'obligation était éclatée en deux moitiés dont aucun écrivain ne tenait les
 * deux : la réécriture des syntaxes explicites vit désormais dans
 * `processExplicitLinks` pour les quatre transports, mais le mapping des URLs
 * BRUTES n'était recomposé par AUCUN d'eux — il n'est écrit qu'à la CRÉATION
 * (`MessageProcessor.saveMessage`). Ajouter une URL brute par édition la
 * laissait donc intraçable pour toujours, et la remplacer laissait en base le
 * token d'une URL que le texte ne contient plus. Un message qui, envoyé tel
 * quel, aurait été tracé ne l'était pas s'il avait été obtenu par édition.
 *
 * L'ordre est obligé : le mapping des URLs brutes se calcule sur le contenu
 * DÉJÀ réécrit, sinon une URL qui vient de devenir `m+<token>` serait
 * recollectée comme si elle était encore brute et recevrait un second token.
 * La collecte, elle, n'est PAS court-circuitée par `hasTrackableLinkSyntax` :
 * une URL brute n'a justement aucune syntaxe explicite, et c'est précisément
 * elle qu'on vient chercher.
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

  let rewriteFailed = false;
  const processedContent = await processExplicitLinks({
    trackingLinkService: linkService,
    content,
    conversationId: message.conversationId,
    messageId: message.id,
    createdBy: editorUserId,
    onError: (error) => {
      rewriteFailed = true;
      onError?.(error);
    },
  });

  // La réécriture a échoué : le texte part en base tel que l'utilisateur l'a
  // écrit, mais on ne sait plus ce que ses liens valent — donc on ne touche pas
  // au mapping stocké.
  if (rewriteFailed) return { processedContent, trackingLinks: [], reconciled: false };

  try {
    const trackingLinks = await linkService.collectContentTrackingLinks({
      content: processedContent,
      conversationId: message.conversationId,
      messageId: message.id,
      createdBy: editorUserId,
    });
    return { processedContent, trackingLinks, reconciled: true };
  } catch (error) {
    // Le contenu RÉÉCRIT est conservé — ses tokens ont été mintés, les jeter
    // laisserait en base un texte qui référence des liens qu'il ne porte plus.
    // Seul le mapping reste inchangé : on ne sait plus ce qu'il devrait valoir.
    onError?.(error);
    return { processedContent, trackingLinks: [], reconciled: false };
  }
}

/**
 * `metadata` recomposé avec le mapping de liens qu'on vient d'établir.
 *
 * `Message.metadata` est un `Json?` PARTAGÉ : il porte aussi `postReplyTo` (le
 * snapshot gelé du post cité, irrécupérable après expiration de la story) et
 * `location` (le lieu partagé). Écrire `{ trackingLinks }` par-dessus
 * détruirait les deux — d'où la lecture-modification-écriture plutôt qu'une
 * affectation.
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
