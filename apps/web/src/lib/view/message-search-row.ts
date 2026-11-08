import { conversationAccentPalette } from '@meeshy/shared/utils/conversation-colors';

import type { MessageSearchHit } from '@/lib/api/global-search';

/**
 * **UNE LIGNE DE LA RECHERCHE DE MESSAGES** (#14619) — même anatomie que la
 * ligne des messages favoris (`starred-row.ts`) : l'auteur, la date du
 * message, l'extrait, le nom de la conversation et la barre à son ACCENT.
 *
 * **LE PRISME EST DÉJÀ DESCENDU PAR LA PASSERELLE** : `content` est le texte
 * servi au lecteur (`resolvePrismTranslation`), `servedLanguage` sa langue,
 * `null` ⇒ l'original. Ce modèle ne refait pas la descente — il n'a pas les
 * traductions, et deux descentes pourraient diverger.
 *
 * **L'ACCENT** vient de la loi partagée (`conversationAccentPalette`), jamais
 * d'une couleur écrite ici.
 */
export type MessageSearchRowModel = {
  readonly messageId: string;
  readonly conversationId: string;
  readonly author: string | null;
  readonly sentAt: string;
  readonly dateLabel: string;
  readonly excerpt: string;
  readonly translated: boolean;
  readonly conversationName: string;
  readonly accent: string;
};

export function messageSearchRowModel(hit: MessageSearchHit, context: { readonly locale: string }): MessageSearchRowModel {
  const conversationName = hit.conversation.title.trim() || hit.conversation.identifier || hit.conversation.id;
  return {
    messageId: hit.id,
    conversationId: hit.conversationId,
    author: hit.sender?.displayName || hit.sender?.username || null,
    sentAt: hit.createdAt,
    dateLabel: new Intl.DateTimeFormat(context.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(hit.createdAt)),
    excerpt: hit.content,
    translated: hit.servedLanguage !== null,
    conversationName,
    accent: conversationAccentPalette({ name: conversationName, type: hit.conversation.type }).primary,
  };
}
