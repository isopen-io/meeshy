import { conversationAccentPalette } from '@meeshy/shared/utils/conversation-colors';

import type { MessageSearchMediaKind } from '@meeshy/shared/types/global-search';

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
 * **LE VOILE** (#16957) : un résultat flouté ne porte AUCUN caractère de son
 * texte — `excerpt` vide, `veilLength` pour dessiner le substitut
 * (`surrogateOf`), comme la bulle voilée du fil. Un `filter: blur()` sur le
 * vrai texte serait la protection annoncée et non appliquée.
 *
 * **LA TRANSCRIPTION** (#16958) se peint avec l'icône de son média, sans
 * geste propre : la ligne n'ouvre que la conversation.
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
  readonly veiled: boolean;
  readonly veilLength: number;
  readonly mediaGlyph: MessageSearchMediaGlyph | null;
  readonly conversationName: string;
  readonly accent: string;
};

export type MessageSearchMediaGlyph = 'microphone' | 'videoCamera' | 'image' | 'file';

const MEDIA_GLYPH: Readonly<Record<MessageSearchMediaKind, MessageSearchMediaGlyph>> = {
  audio: 'microphone',
  video: 'videoCamera',
  image: 'image',
  document: 'file',
};

export function messageSearchRowModel(hit: MessageSearchHit, context: { readonly locale: string }): MessageSearchRowModel {
  const conversationName = hit.conversation.title.trim() || hit.conversation.identifier || hit.conversation.id;
  const transcript = hit.match === 'transcript' ? hit.transcript : null;
  const text = transcript?.text ?? hit.content;
  const servedLanguage = transcript ? transcript.servedLanguage : hit.servedLanguage;
  const veiled = hit.isBlurred;
  return {
    messageId: hit.id,
    conversationId: hit.conversationId,
    author: hit.sender?.displayName || hit.sender?.username || null,
    sentAt: hit.createdAt,
    dateLabel: new Intl.DateTimeFormat(context.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(hit.createdAt)),
    excerpt: veiled ? '' : text,
    translated: !veiled && servedLanguage !== null,
    veiled,
    veilLength: veiled ? text.length : 0,
    mediaGlyph: transcript ? MEDIA_GLYPH[transcript.mediaKind] : null,
    conversationName,
    accent: conversationAccentPalette({ name: conversationName, type: hit.conversation.type }).primary,
  };
}
