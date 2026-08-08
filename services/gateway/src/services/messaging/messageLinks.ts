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
