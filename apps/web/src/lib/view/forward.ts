import type { ShareMessage, ShareMessagePiece } from '@meeshy/shared/utils/share-plan';

import { citesSealed, contentExitOf, mediaLeaves, type ExitForwardRefusal, type ExitMessage } from '@/lib/view/content-exit';
import type { Attachment, Message } from '@/lib/api/types';
import { attachmentSrc } from '@/lib/api/media-url';
import type { ForwardSource } from '@/lib/api/forward';
import type { SendPreview } from '@/lib/send/send-sheet-plan';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';
import { stickerOf } from './message-body';

/**
 * LE TRANSFERT, CÔTÉ CLIENT (#5866, #9573) — la règle que `admitMessageForward`
 * (`services/gateway/src/services/messaging/forwardAdmission.ts`) applique,
 * dite AVANT l'aller-retour : une garde qui ne vit que côté serveur laisse
 * l'utilisateur découvrir l'interdit après avoir armé une sélection et choisi
 * un destinataire.
 *
 * AUCUNE RÈGLE ICI. Le verdict vient de la loi de sortie (`content-exit.ts`,
 * projection de `@meeshy/shared`), et l'écran de partage le relit par
 * `planShare` (`@meeshy/shared/utils/share-plan`) sur la projection que ce
 * module compose (`shareMessageOf`) :
 *  - une VUE UNIQUE et une FLAMME APRÈS LECTURE ne se transfèrent pas — lues
 *    sur le message ET sur chacune de ses pièces ; un éphémère dont la durée
 *    ne se lit pas est jugé « après lecture » ;
 *  - une FLAMME À DURÉE se transfère, et sa copie dure au plus autant
 *    (`maxDurationSeconds`, que la feuille d'envoi propose de réduire) ;
 *  - un FLOU se transfère, la copie le garde ;
 *  - une source SUPPRIMÉE ou ÉCHUE n'a plus rien à copier.
 *
 * Ce fichier ne rend RIEN et n'envoie RIEN : `api/forward.ts` porte le
 * transport, `use-message-menu.ts` compose les deux.
 */

export type ForwardProtection = ExitMessage;

export type ForwardCandidate = ForwardProtection & Pick<Message, 'id'>;

/** Les motifs du serveur (`ForwardRefusal`), dans le vocabulaire de la loi. */
export type ForwardRefusal = ExitForwardRefusal;

export type ForwardAdmission =
  | { readonly admitted: true; readonly ids: readonly string[]; readonly withdrawn: readonly { readonly id: string; readonly reason: ForwardRefusal }[] }
  | { readonly admitted: false; readonly reason: ForwardRefusal };

/** `null` ⇒ rien ne s'oppose au transfert de CE message. */
export function forwardRefusalOf(message: ForwardProtection, now: number): ForwardRefusal | null {
  const { forward } = contentExitOf(message, now);
  return forward.allowed ? null : forward.reason;
}

/**
 * LA SÉLECTION, MOINS CE QUI NE SORT PAS (D6, #10949, porteur 2026-10-18).
 * Le protégé est RETIRÉ avec son motif et le reste part : l'écran de partage
 * dit lequel reste dans la conversation et combien partent. Seule une
 * sélection où RIEN ne sort est refusée — par le premier motif rencontré.
 */
export function admitForward(messages: readonly ForwardCandidate[], now: number): ForwardAdmission {
  const verdicts = messages.map((m) => ({ id: m.id, reason: forwardRefusalOf(m, now) }));
  const ids = verdicts.filter((v) => v.reason === null).map((v) => v.id);
  const withdrawn = verdicts.flatMap((v) => (v.reason === null ? [] : [{ id: v.id, reason: v.reason }]));
  if (ids.length > 0) return { admitted: true, ids, withdrawn };
  return { admitted: false, reason: withdrawn[0]?.reason ?? 'unavailable' };
}

/** Le texte d'un message ne se montre pas hors du fil quand il ne peut pas en sortir, ni quand un bit ou le chiffrement le voile. */
const textLeaves = (message: Message, now: number): boolean => mediaLeaves({ message, piece: {}, now });

const kindOfMime = (mime: string): 'image' | 'video' | 'audio' | 'file' => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return mime.startsWith('audio/') ? 'audio' : 'file';
};

/**
 * CE QUE LA LOI LIT D'UNE PIÈCE — ses colonnes ET son bitfield d'effets, que la
 * passerelle sert sur la pièce sans que le type ne le déclare : lu
 * tolérant, un bit absent ne déclare rien.
 */
export const sharePieceOf = (piece: Attachment): ShareMessagePiece => {
  const bits: unknown = (piece as { readonly effectFlags?: unknown }).effectFlags;
  return {
    id: piece.id,
    mimeType: piece.mimeType,
    bytes: piece.fileSize,
    durationMs: piece.duration ?? null,
    isViewOnce: piece.isViewOnce,
    isBlurred: piece.isBlurred,
    ...(typeof bits === 'number' ? { effectFlags: bits } : {}),
  };
};

/**
 * CE QUE LA LOI DU PARTAGE LIT D'UN MESSAGE — ses drapeaux de protection, ses
 * pièces, s'il vient d'une source chiffrée, s'il cite un contenu protégé.
 */
export function shareMessageOf(message: Message, now: number, sourceEncrypted = false): ShareMessage {
  return {
    id: message.id,
    text: textLeaves(message, now) ? message.content : null,
    isViewOnce: message.isViewOnce,
    isBlurred: message.isBlurred,
    ...(message.effectFlags === undefined ? {} : { effectFlags: message.effectFlags }),
    ...(message.ephemeralDuration === undefined ? {} : { ephemeralDuration: message.ephemeralDuration }),
    ...(message.expiresAt === undefined ? {} : { expiresAt: message.expiresAt }),
    encrypted: sourceEncrypted || message.isEncrypted || message.encryptionMode != null || (message.attachments ?? []).some((piece) => piece.isEncrypted),
    citesProtected: citesSealed(message, now),
    pieces: (message.attachments ?? []).map(sharePieceOf),
  };
}

/**
 * CE QUE LE WEB NE PEUT PAS FAIRE PARTIR (D7) — une source qui n'a plus rien à
 * copier (supprimée, échue), ou une source chiffrée qu'il ne sait pas
 * reconstituer : il ne détient aucune clé, la passerelle n'en recopie rien, et
 * un contenu chiffré ou une pièce ne se renvoient pas depuis le web. Le texte
 * d'une conversation chiffrée que le web lit en clair, lui, part (le client
 * renvoie lui-même le contenu, admis par la passerelle).
 */
const unsendable = (message: Message, exit: ShareMessage, now: number): boolean => {
  if (forwardRefusalOf(message, now) === 'unavailable') return true;
  if (exit.encrypted !== true) return false;
  return message.isEncrypted || (message.attachments ?? []).length > 0 || (exit.text ?? '').trim() === '';
};

/**
 * L'APERÇU — JAMAIS un contenu qui ne sort pas. Un message flouté, chiffré ou
 * qui disparaît n'affiche ni son texte ni sa vignette dans la feuille :
 * l'aperçu se réduit à « 1 message ». Sinon : le texte, à défaut la vignette.
 */
const previewOfMessages = (messages: readonly Message[], now: number): SendPreview => {
  const [only] = messages;
  if (only === undefined || messages.length !== 1 || !textLeaves(only, now)) return { kind: 'messages', count: messages.length };
  if (only.content.trim() !== '') return { kind: 'text', text: only.content };
  const piece = only.attachments?.length === 1 ? only.attachments[0] : undefined;
  if (piece === undefined || !mediaLeaves({ message: only, piece, now })) return { kind: 'messages', count: 1 };
  const kind = stickerOf(only) === null ? kindOfMime(piece.mimeType) : 'sticker';
  const source = piece.thumbnailUrl ?? (kind === 'image' || kind === 'sticker' ? piece.fileUrl : undefined);
  /* La vignette est résolue par la PASSERELLE (`attachmentSrc`), jamais contre l'origine du web (#10747). */
  const thumbUrl = source === undefined || source === '' ? undefined : attachmentSrc(source);
  return { kind, ...(thumbUrl === undefined ? {} : { thumbUrl }) };
};

/** Une flamme à durée voyage avec SA borne : la feuille la propose, le transport ne la dépasse pas. */
const forwardSourceOf = (message: Message, now: number): ForwardSource => {
  const { forward } = contentExitOf(message, now);
  const bound = forward.allowed ? forward.maxDurationSeconds : null;
  const sticker = stickerOf(message);
  return {
    id: message.id,
    content: message.content,
    originalLanguage: message.originalLanguage,
    ...(bound === null ? {} : { maxDurationSeconds: bound }),
    ...(sticker === null ? {} : { sticker }),
  };
};

/**
 * CE QUE LA SÉLECTION REMET À L'ÉCRAN DE PARTAGE (#8884, #10948) — les
 * messages dans l'ordre du fil, ce que la loi en lit (`exit`), ceux que le web
 * ne peut pas faire partir (`unsendable`), et l'aperçu. L'écran retire le
 * protégé (D6) et montre pourquoi. Pur.
 */
export function forwardRequestOf(params: {
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly now: number;
  /** La conversation source est chiffrée de bout en bout (D7). */
  readonly sourceEncrypted?: boolean;
}): SendSheetRequest {
  const { conversationId, messages, now } = params;
  const exit = messages.map((message) => shareMessageOf(message, now, params.sourceEncrypted === true));
  const blocked = messages.filter((message, index) => {
    const projected = exit[index];
    return projected !== undefined && unsendable(message, projected, now);
  });
  const leaving = messages.filter((message) => forwardRefusalOf(message, now) === null && !blocked.includes(message));
  return {
    intent: 'forward',
    payload: {
      kind: 'messages',
      conversationId,
      messages: messages.map((message) => forwardSourceOf(message, now)),
      exit,
      preview: previewOfMessages(leaving.length > 0 ? leaving : messages, now),
      ...(blocked.length === 0 ? {} : { unsendable: blocked.map((message) => message.id) }),
    },
  };
}
