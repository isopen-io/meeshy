import { buildTranslationRecord } from '@meeshy/shared/utils/conversation-helpers';

import { served } from '@/lib/api/prism';
import type { Message } from '@/lib/api/types';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { protectionOf } from '@/lib/reading-mode/protection';
import { quotedPreviewOf } from '@/lib/view/quoted-preview';

import type { MessageCardPart } from './message-card-layout';

/**
 * **CE QU'UNE CARTE D'EXPORT A LE DROIT DE MONTRER** — la loi qui décide si
 * un message s'exporte, et avec quels mots.
 *
 * GARDE : un message protégé (flouté, à vue unique, éphémère échu, supprimé)
 * ne s'exporte pas — c'est `protectionOf`, la loi qui retire déjà « Copier ».
 * Une image est une copie qu'on partage : ce qui ne se copie pas ne se peint
 * pas. La CITATION suit `quotedPreviewOf`, le site unique des citations : une
 * citation protégée montre son placeholder, jamais son contenu.
 *
 * LES MOTS SONT CEUX QUE LE LECTEUR VOIT : le texte SERVI (le Prisme, avec la
 * langue que le lecteur a peut-être imposée par « Traduire »), jamais
 * l'original en douce — sauf quand l'exportateur CHOISIT une langue d'export
 * (`language`) : la réponse part alors dans cette langue, et la citation la
 * suit si elle l'a, sinon elle garde le prisme du lecteur.
 */

type AuthorFields = Pick<Message, 'senderId'> & {
  readonly sender?: { readonly displayName?: string | null; readonly username?: string | null } | null;
};

const nonBlank = (value: string | null | undefined): string | null => (value !== undefined && value !== null && value.trim() !== '' ? value.trim() : null);

export function cardAuthorOf(message: AuthorFields, viewer: { readonly id: string; readonly displayName: string }): string {
  if (message.senderId !== undefined && message.senderId !== null && message.senderId === viewer.id) {
    return nonBlank(viewer.displayName) ?? nonBlank(message.sender?.displayName) ?? nonBlank(message.sender?.username) ?? 'Meeshy';
  }
  return nonBlank(message.sender?.displayName) ?? nonBlank(message.sender?.username) ?? 'Meeshy';
}

export type MessageCardSubject = {
  readonly quoted: MessageCardPart | null;
  readonly reply: MessageCardPart;
  /** L'heure d'envoi de la réponse — la date qu'une carte peut afficher. */
  readonly sentAt: Date;
};

export function messageCardSubjectOf(params: {
  readonly message: Message;
  /** Le texte SERVI du message (`servedOf` du menu). */
  readonly servedText: string | undefined;
  readonly viewer: { readonly id: string; readonly displayName: string };
  readonly readerLanguages: readonly string[];
  readonly interfaceLanguage: InterfaceLanguage;
  readonly now: number;
  /** La langue d'export choisie — absente : la carte montre ce que le lecteur lit. */
  readonly language?: string | null;
}): MessageCardSubject | null {
  const { message, servedText, viewer } = params;
  if (protectionOf(message, params.now) !== 'standard') return null;
  const language = params.language ?? null;
  const chosen =
    language === null
      ? (servedText ?? message.content)
      : served({ preferredLanguages: [language], originalLanguage: message.originalLanguage, translations: message.translations, original: message.content }).text;
  const text = chosen.trim();
  const readerLanguages = language === null ? params.readerLanguages : [language, ...params.readerLanguages];
  if (text === '') return null;

  const replyTo = message.replyTo;
  let quoted: MessageCardPart | null = null;
  if (replyTo !== undefined && replyTo !== null) {
    const preview = quotedPreviewOf({ quoted: replyTo, readerLanguages, interfaceLanguage: params.interfaceLanguage });
    if (preview.text.trim() !== '') quoted = { author: cardAuthorOf(replyTo, viewer), text: preview.text };
  }
  return { quoted, reply: { author: cardAuthorOf(message, viewer), text }, sentAt: new Date(message.createdAt) };
}

/** Les langues dans lesquelles la réponse EXISTE : son original d'abord, puis chaque traduction servie. */
export function messageCardLanguagesOf(message: Pick<Message, 'originalLanguage' | 'translations'>): readonly string[] {
  const original = nonBlank(message.originalLanguage);
  if (original === null) return [];
  return [...new Set([original, ...Object.keys(buildTranslationRecord(message.translations))])];
}

/** Le nom du fichier : lisible dans une galerie, sans rien du contenu. */
export function messageCardFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `meeshy-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;
}
