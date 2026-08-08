/**
 * La seule méthode de `TrackingLinkService` que l'édition appelle, en
 * structural pour la même raison que `MentionResolver` : le double de test
 * reste trivial et l'unité n'importe pas la classe entière.
 *
 * Le retour est volontairement rétréci à `processedContent` — l'édition ne
 * consomme pas la liste des liens créés, et ce qu'un contrat ne promet pas ne
 * peut pas se retrouver oublié à moitié.
 */
export interface ExplicitLinkProcessor {
  processExplicitLinksInContent(params: {
    content: string;
    conversationId: string;
    messageId?: string;
    createdBy?: string;
  }): Promise<{ processedContent: string }>;
}

export interface EditedLinkParams {
  trackingLinkService: ExplicitLinkProcessor | null | undefined;
  content: string;
  conversationId: string;
  messageId: string;
  /** L'AUTEUR de l'édition, en `User.id` — c'est lui qui crée le TrackingLink. */
  editorUserId: string;
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
 * Ce qu'une édition doit aux liens qu'elle contient : `[[url]]` et `<url>`
 * deviennent des `m+<token>` traçables, exactement comme à l'envoi.
 *
 * Cette unité existe parce que l'obligation vivait DÉPLIÉE dans la route REST
 * d'édition, et nulle part ailleurs. `message:edit` — le transport d'édition
 * PRIMAIRE, celui qu'emploie le web (`CLIENT_EVENTS.MESSAGE_EDIT`) — écrivait
 * le texte brut : coller `[[https://example.com]]` dans une édition laissait
 * les crochets en dur dans le message, pour toujours, alors que le même texte
 * à l'envoi produisait un lien traçable. Sixième asymétrie du même handler, et
 * la seule qui portait sur le CONTENU lui-même.
 *
 * Le court-circuit vit ICI, pas chez l'appelant : un texte sans syntaxe
 * traçable ne doit coûter aucune requête, et c'est une garde qu'un nouvel
 * écrivain oublierait.
 *
 * Best-effort de bout en bout — ne lève jamais. Un lien perdu ne doit pas
 * transformer une édition réussie en 500 : le contenu ORIGINAL est alors
 * rendu, l'édition aboutit, et `onError` laisse l'appelant journaliser dans le
 * contexte de sa requête.
 */
export async function processEditedContentLinks(params: EditedLinkParams): Promise<string> {
  const { trackingLinkService, content, conversationId, messageId, editorUserId, onError } = params;

  if (!trackingLinkService) return content;
  if (!TRACKABLE_SYNTAX.test(content)) return content;

  try {
    const { processedContent } = await trackingLinkService.processExplicitLinksInContent({
      content,
      conversationId,
      messageId,
      createdBy: editorUserId,
    });
    return processedContent;
  } catch (error) {
    onError?.(error);
    return content;
  }
}
