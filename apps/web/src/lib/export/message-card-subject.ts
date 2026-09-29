import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { buildTranslationRecord } from '@meeshy/shared/utils/conversation-helpers';

import { served } from '@/lib/api/prism';
import type { Attachment, Message } from '@/lib/api/types';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { protectionOf } from '@/lib/reading-mode/protection';
import { kindOf, waveformOf } from '@/lib/view/message';
import { quotedPreviewOf } from '@/lib/view/quoted-preview';

import type { MessageCardPart } from './message-card-layout';
import type { CardMedia } from './message-card-media';

/**
 * **CE QU'UNE CARTE D'EXPORT A LE DROIT DE MONTRER** — la loi qui décide si
 * un message s'image, et avec quels mots et quels médias.
 *
 * GARDE : un message protégé (flouté, à vue unique, éphémère échu, supprimé)
 * ne s'image pas — c'est `protectionOf`, la loi qui retire déjà « Copier ».
 * Une image est une copie qu'on partage : ce qui ne se copie pas ne se peint
 * pas. La protection se lit aussi au niveau de la PIÈCE (leçon 275) : une
 * photo à vue unique ou floutée d'un message ordinaire n'est jamais peinte. La
 * CITATION suit `quotedPreviewOf`, le site unique des citations : une citation
 * protégée montre son placeholder, jamais son contenu.
 *
 * LES MOTS SONT CEUX QUE LE LECTEUR VOIT : le texte SERVI (le Prisme, avec la
 * langue que le lecteur a peut-être imposée par « Traduire »), jamais
 * l'original en douce — sauf quand l'exportateur CHOISIT une langue d'export
 * (`language`) : la réponse part alors dans cette langue, et la citation la
 * suit si elle l'a, sinon elle garde le prisme du lecteur.
 *
 * LES MÉDIAS (#8693) : les images, les vidéos (leur première image) et les
 * audios (leur représentation) ; un document n'a rien à montrer sur une carte.
 * Un message fait d'un seul média s'image, même sans texte.
 */

type AuthorFields = Pick<Message, 'senderId'> & {
  readonly sender?: { readonly displayName?: string | null; readonly username?: string | null } | null;
};

type Viewer = { readonly id: string; readonly displayName: string; readonly handle?: string | null };

const nonBlank = (value: string | null | undefined): string | null => (value !== undefined && value !== null && value.trim() !== '' ? value.trim() : null);

const isViewer = (message: AuthorFields, viewer: Viewer): boolean => message.senderId !== undefined && message.senderId !== null && message.senderId === viewer.id;

export function cardAuthorOf(message: AuthorFields, viewer: Viewer): string {
  if (isViewer(message, viewer)) {
    return nonBlank(viewer.displayName) ?? nonBlank(message.sender?.displayName) ?? nonBlank(message.sender?.username) ?? 'Meeshy';
  }
  return nonBlank(message.sender?.displayName) ?? nonBlank(message.sender?.username) ?? 'Meeshy';
}

/** Le pseudo public d'un auteur, sans « @ » — `null` quand on ne le connaît pas. */
export function cardHandleOf(message: AuthorFields, viewer: Viewer): string | null {
  const handle = isViewer(message, viewer) ? (nonBlank(viewer.handle) ?? nonBlank(message.sender?.username)) : nonBlank(message.sender?.username);
  return handle === null ? null : handle.replace(/^@+/, '');
}

export type MessageCardSubjectPart = MessageCardPart & { readonly handle: string | null };

/** Un média de la carte : sa forme pour la mise en page, et de quoi aller chercher ses pixels. */
export type MessageCardMediaItem = {
  readonly id: string;
  readonly card: CardMedia;
  readonly url: string;
  readonly mimeType: string;
  /** L'image d'attente d'une vidéo, servie par la passerelle — la première image quand elle existe. */
  readonly posterUrl: string | null;
};

export type MessageCardSubject = {
  readonly quoted: MessageCardSubjectPart | null;
  readonly reply: MessageCardSubjectPart;
  /** L'heure d'envoi de la réponse — la date qu'une carte peut afficher. */
  readonly sentAt: Date;
  /** L'heure du message cité, quand on la connaît. */
  readonly quotedAt: Date | null;
  readonly media: readonly MessageCardMediaItem[];
  /** Ce qui suit la réponse sur la carte — les réponses d'un commentaire (#8734). */
  readonly followUps?: readonly MessageCardSubjectPart[];
};

/** Ce qu'il faut d'une pièce — celle d'un message (`Attachment`) comme celle d'un commentaire (`FeedMedia`). */
export type CardMediaFields = Pick<Attachment, 'id' | 'fileUrl'> & {
  readonly mimeType?: string | null;
  readonly thumbnailUrl?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly duration?: number | null;
  readonly originalName?: string | null;
  readonly isViewOnce?: boolean;
  readonly isBlurred?: boolean;
  readonly effectFlags?: number | null;
};

/** Des effets qui MASQUENT un contenu — vue unique, flou. */
export const maskedByEffects = (effectFlags: number | null | undefined): boolean =>
  ((effectFlags ?? 0) & (MESSAGE_EFFECT_FLAGS.VIEW_ONCE | MESSAGE_EFFECT_FLAGS.BLURRED)) !== 0;

/** Une pièce MASQUÉE à son propre niveau — vue unique, floutée, ou marquée par ses effets. */
const maskedPiece = (piece: CardMediaFields): boolean => piece.isViewOnce === true || piece.isBlurred === true || maskedByEffects(piece.effectFlags);

/** Les médias peignables d'un message, dans leur ordre. */
export function cardMediaOf(attachments: readonly CardMediaFields[] | null | undefined): readonly MessageCardMediaItem[] {
  return (attachments ?? []).flatMap((piece): MessageCardMediaItem[] => {
    if (maskedPiece(piece)) return [];
    const mimeType = piece.mimeType ?? '';
    const kind = kindOf({ mimeType });
    const base = { id: piece.id, url: piece.fileUrl, mimeType, posterUrl: nonBlank(piece.thumbnailUrl) };
    if (kind === 'image' || kind === 'video') return [{ ...base, card: { kind, width: piece.width ?? 0, height: piece.height ?? 0 } }];
    if (kind === 'audio') {
      const peaks = waveformOf(piece, 40);
      return [{ ...base, card: { kind: 'audio', durationMs: piece.duration ?? 0, name: nonBlank(piece.originalName) ?? 'audio', peaks } }];
    }
    return [];
  });
}

export function messageCardSubjectOf(params: {
  readonly message: Message;
  /** Le texte SERVI du message (`servedOf` du menu). */
  readonly servedText: string | undefined;
  readonly viewer: Viewer;
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
  const media = cardMediaOf(message.attachments);
  if (text === '' && media.length === 0) return null;

  const replyTo = message.replyTo;
  let quoted: MessageCardSubjectPart | null = null;
  let quotedAt: Date | null = null;
  if (replyTo !== undefined && replyTo !== null) {
    const preview = quotedPreviewOf({ quoted: replyTo, readerLanguages, interfaceLanguage: params.interfaceLanguage });
    if (preview.text.trim() !== '') {
      quoted = { author: cardAuthorOf(replyTo, viewer), text: preview.text, handle: cardHandleOf(replyTo, viewer) };
      quotedAt = replyTo.createdAt === undefined ? null : new Date(replyTo.createdAt);
    }
  }
  return {
    quoted,
    reply: { author: cardAuthorOf(message, viewer), text, handle: cardHandleOf(message, viewer) },
    sentAt: new Date(message.createdAt),
    quotedAt,
    media,
  };
}

/** Les langues dans lesquelles la réponse EXISTE : son original d'abord, puis chaque traduction servie. */
export function messageCardLanguagesOf(message: Pick<Message, 'originalLanguage' | 'translations'>): readonly string[] {
  const original = nonBlank(message.originalLanguage);
  if (original === null) return [];
  return [...new Set([original, ...Object.keys(buildTranslationRecord(message.translations))])];
}

/** Le nom du fichier : lisible dans une galerie, sans rien du contenu — son extension dit sa nature. */
export function messageCardFileName(now: Date, extension: 'png' | 'gif' | 'mp4' | 'webm' = 'png'): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `meeshy-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.${extension}`;
}
