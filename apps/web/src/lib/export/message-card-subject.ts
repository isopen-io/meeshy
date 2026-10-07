import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { buildTranslationRecord } from '@meeshy/shared/utils/conversation-helpers';

import { served } from '@/lib/api/prism';
import type { Attachment, Message } from '@/lib/api/types';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { contentExitOf, exitOffers, pieceIsOpen, quotedExitOf } from '@/lib/view/content-exit';
import { kindOf, waveformOf } from '@/lib/view/message';
import { quotedPreviewOf } from '@/lib/view/quoted-preview';

import type { MessageCardPart } from './message-card-layout';
import type { CardMedia } from './message-card-media';

/**
 * **CE QU'UNE CARTE D'EXPORT A LE DROIT DE MONTRER** — la loi qui décide si
 * un message s'image, et avec quels mots et quels médias.
 *
 * GARDE : la loi de sortie (`lib/view/content-exit.ts`, #9573). Une image est
 * une copie qu'on partage : un message flouté, à vue unique, supprimé, échu,
 * ou QUI DISPARAÎT (flamme à durée ou après lecture) ne s'image pas — jugé
 * sur le message ENTIER, la pièce à vue unique d'un message ordinaire ferme
 * la carte. Une pièce floutée ou chiffrée n'est jamais peinte.
 *
 * LA CITATION EST JUGÉE POUR ELLE-MÊME (`quotedExitOf`) : un message
 * ordinaire qui cite une flamme s'image SANS elle — ni son texte, ni son
 * média. Une citation dont la nature n'est pas déclarée dans la charge reçue
 * est fermée, et une citation voilée (vue unique, flou) ne se peint pas non
 * plus : la carte ne fait confiance à aucun texte servi pour un contenu qui
 * n'a pas le droit de sortir.
 *
 * LES MOTS SONT CEUX QUE LE LECTEUR VOIT : le texte SERVI (le Prisme, avec la
 * langue que le lecteur a peut-être imposée par « Traduire »), jamais
 * l'original en douce — sauf quand l'exportateur CHOISIT une langue d'export
 * (`language`) : la réponse part alors dans cette langue, et la citation la
 * suit si elle l'a, sinon elle garde le prisme du lecteur.
 *
 * LES MÉDIAS (#8693) : les images, les vidéos (leur première image) et les
 * audios (leur représentation) ; un document n'a rien à montrer sur une carte.
 * Un message fait d'un seul média s'image, même sans texte. Une pièce CHIFFRÉE
 * ne se peint pas : son fichier n'est pas lisible hors de la bulle. Le message
 * CITÉ apporte aussi ses médias, après ceux de la réponse (#8901) — quand la
 * citation a le droit de sortir. Chaque
 * média porte son AUTEUR (#9236) — le message d'où il vient — pour que la
 * carte puisse signer les visuels comme elle signe les messages.
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

/**
 * L'AUTEUR D'UN MÉDIA (#9236) — son nom, son pseudo, et le bloc d'où vient la
 * pièce : un média `quoted` suit l'anonymat de la citation (et des suites, les
 * « autres »), les autres celui de la réponse. Il se peint comme les autres noms.
 */
export type CardMediaAuthor = { readonly name: string; readonly handle: string | null; readonly quoted: boolean };

/** Un média de la carte : sa forme pour la mise en page, de quoi aller chercher ses pixels, et qui l'a posté. */
export type MessageCardMediaItem = {
  readonly id: string;
  readonly card: CardMedia;
  readonly url: string;
  readonly mimeType: string;
  /** L'image d'attente d'une vidéo, servie par la passerelle — la première image quand elle existe. */
  readonly posterUrl: string | null;
  /** Qui l'a posté — absent : inconnu, la carte ne le signe pas. */
  readonly author?: CardMediaAuthor | null;
};

/** Les mêmes médias, attribués à `author`. */
export const authoredBy = (items: readonly MessageCardMediaItem[], author: CardMediaAuthor): readonly MessageCardMediaItem[] => items.map((item) => ({ ...item, author }));

/** L'auteur des médias d'un bloc de la carte — son nom et son pseudo tels que la carte les connaît. */
export const mediaAuthorOf = (part: MessageCardSubjectPart, quoted: boolean): CardMediaAuthor => ({ name: part.author, handle: part.handle, quoted });

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
  readonly isEncrypted?: boolean;
  readonly effectFlags?: number | null;
};

/** Des effets qui MASQUENT un contenu — vue unique, flou. Lu par les cartes de commentaire, qui n'ont pas de nature de disparition. */
export const maskedByEffects = (effectFlags: number | null | undefined): boolean =>
  ((effectFlags ?? 0) & (MESSAGE_EFFECT_FLAGS.VIEW_ONCE | MESSAGE_EFFECT_FLAGS.BLURRED)) !== 0;

/** Les médias peignables d'un message, dans leur ordre. */
export function cardMediaOf(attachments: readonly CardMediaFields[] | null | undefined): readonly MessageCardMediaItem[] {
  return (attachments ?? []).flatMap((piece): MessageCardMediaItem[] => {
    if (!pieceIsOpen(piece)) return [];
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
  if (!exitOffers(contentExitOf(message, params.now), 'image')) return null;
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
  const replyPart: MessageCardSubjectPart = { author: cardAuthorOf(message, viewer), text, handle: cardHandleOf(message, viewer) };
  let quoted: MessageCardSubjectPart | null = null;
  let quotedAt: Date | null = null;
  let quotedMedia: readonly MessageCardMediaItem[] = [];
  if (replyTo !== undefined && replyTo !== null) {
    const preview = quotedPreviewOf({ quoted: replyTo, readerLanguages, interfaceLanguage: params.interfaceLanguage });
    const quotedLeaves = exitOffers(quotedExitOf(replyTo, params.now), 'image') && !preview.isProtected;
    if (quotedLeaves && preview.text.trim() !== '') {
      quoted = { author: cardAuthorOf(replyTo, viewer), text: preview.text, handle: cardHandleOf(replyTo, viewer) };
      quotedAt = replyTo.createdAt === undefined ? null : new Date(replyTo.createdAt);
    }
    const quotedAuthor: CardMediaAuthor = { name: cardAuthorOf(replyTo, viewer), handle: cardHandleOf(replyTo, viewer), quoted: true };
    quotedMedia = quotedLeaves ? authoredBy(cardMediaOf(replyTo.attachments), quotedAuthor) : [];
  }
  const ownIds = new Set(media.map((item) => item.id));
  return {
    quoted,
    reply: replyPart,
    sentAt: new Date(message.createdAt),
    quotedAt,
    media: [...authoredBy(media, mediaAuthorOf(replyPart, false)), ...quotedMedia.filter((item) => !ownIds.has(item.id))],
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
