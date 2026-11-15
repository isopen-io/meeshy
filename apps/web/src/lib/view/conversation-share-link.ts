import type { LinksDeps } from '@/lib/api/links';
import { partagerInvitation, type PortailPartage } from '@/lib/view/invitation';

/**
 * **PARTAGER UNE CONVERSATION EN UN GESTE** (#7829) — miroir de l'action
 * « Partager » de `ConversationInfoSheet.swift` : un lien se CRÉE (politique
 * par défaut, messages anonymes permis — `defaultShareLinkDraft`), puis part
 * par la feuille de partage du système, ou, à défaut, dans le presse-papier.
 *
 * Même chaîne que la feuille « Créer un lien de partage » de la liste
 * (`share-link-sheet.tsx`) : `createShareLink` → `shareLinkUrl` →
 * `partagerInvitation`. Seule l'ISSUE est rendue, jamais un texte : c'est à
 * l'écran de la dire dans la langue du lecteur.
 */
export type ConversationShareOutcome =
  | { readonly kind: 'shared' }
  | { readonly kind: 'copied' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'unavailable'; readonly url: string };

export async function shareConversationLink(params: {
  readonly deps: LinksDeps;
  readonly conversationId: string;
  readonly origin: string;
  readonly portail?: PortailPartage;
}): Promise<ConversationShareOutcome> {
  const { createShareLink, shareLinkUrl } = await import('@/lib/api/links');
  const created = await createShareLink(params.deps, params.conversationId);
  if (!created.ok) return { kind: 'failed' };
  const url = shareLinkUrl(params.origin, created.data.linkId);
  const issue = await partagerInvitation(url, params.portail);
  switch (issue) {
    case 'partage':
      return { kind: 'shared' };
    case 'copie':
      return { kind: 'copied' };
    case 'annule':
      return { kind: 'cancelled' };
    case 'indisponible':
      return { kind: 'unavailable', url };
  }
}
