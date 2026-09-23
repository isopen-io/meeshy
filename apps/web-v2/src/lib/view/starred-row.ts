import type { StarredMessageItem } from '@meeshy/shared/types/message-star';
import { conversationAccentPalette } from '@meeshy/shared/utils/conversation-colors';

import { served } from '@/lib/api/prism';

import { kindOf } from './message';

/**
 * **UNE LIGNE DE L'ÉCRAN DES MESSAGES FAVORIS** (#7286) — miroir de `StarredRow`
 * (`apps/ios/Meeshy/Features/Main/Views/StarredMessagesView.swift`) : l'auteur,
 * la date du MESSAGE (`sentAt`, `.dateTime.day().month(.abbreviated).hour()
 * .minute()`), l'extrait (quatre lignes au plus — `lineLimit(4)`, posé par
 * l'écran), le nom de la conversation et la barre à son ACCENT.
 *
 * **LE PRISME SE RÉSOUT À LA LECTURE** : le serveur sert le message VIVANT, et
 * `served()` descend le prisme du lecteur (`resolvePrismTranslation`, règle 3 :
 * la langue d'origine concourt à son rang). iOS figeait l'aperçu dans la
 * langue du moment de l'étoile ; le contrat de #7377 l'a justement retiré.
 *
 * **UN PLACEHOLDER N'INVENTE RIEN** : `isProtected` rend `protected`, sans lire
 * `content` — même si une charge fautive en portait un.
 *
 * **L'ACCENT** vient de la loi partagée (`conversationAccentPalette`, miroir de
 * `DynamicColorGenerator`), où le TYPE entre et le nom n'entre pas — jamais une
 * couleur écrite ici.
 */
export type StarredExcerpt =
  | { readonly kind: 'text'; readonly text: string; readonly language: string }
  | { readonly kind: 'protected' }
  | { readonly kind: 'media'; readonly media: 'image' | 'video' | 'audio' | 'file'; readonly extra: number }
  | { readonly kind: 'empty' };

export type StarredRowModel = {
  readonly messageId: string;
  readonly conversationId: string;
  /** `null` ⇒ l'écran dit « Utilisateur » (`common.unknown_user`, la clé d'iOS). */
  readonly author: string | null;
  readonly sentAt: string;
  readonly dateLabel: string;
  readonly excerpt: StarredExcerpt;
  readonly conversationName: string;
  readonly accent: string;
};

function excerptOf(message: StarredMessageItem['message'], preferredLanguages: readonly string[]): StarredExcerpt {
  if (message.isProtected) return { kind: 'protected' };
  const resolved = served({
    preferredLanguages,
    originalLanguage: message.originalLanguage,
    translations: message.translations,
    original: message.content ?? '',
  });
  if (resolved.text.trim() !== '') return { kind: 'text', text: resolved.text, language: resolved.language };
  const [first, ...rest] = message.attachments;
  if (first === undefined) return { kind: 'empty' };
  return { kind: 'media', media: kindOf(first), extra: rest.length };
}

export function starredRowModel(
  item: StarredMessageItem,
  context: { readonly preferredLanguages: readonly string[]; readonly locale: string },
): StarredRowModel {
  const { message, sender, conversation } = item;
  const conversationName = conversation.name ?? conversation.identifier;
  return {
    messageId: message.id,
    conversationId: message.conversationId,
    author: sender?.displayName ?? sender?.username ?? null,
    sentAt: message.createdAt,
    dateLabel: new Intl.DateTimeFormat(context.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
      new Date(message.createdAt),
    ),
    excerpt: excerptOf(message, context.preferredLanguages),
    conversationName,
    accent: conversationAccentPalette({ name: conversationName, type: conversation.type }).primary,
  };
}
