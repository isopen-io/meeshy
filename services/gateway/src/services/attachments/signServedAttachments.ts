/**
 * Signer, pour UN lecteur, des pièces servies hors d'une page de messages —
 * la galerie d'une conversation, le détail d'une pièce (#9646).
 *
 * Ces routes chargent la pièce par leurs propres `select`, qui ne portent ni
 * le message ni toujours la protection PROPRE de la pièce : les deux sont
 * relues ici — cinq colonnes du porteur, trois de la pièce —, en UNE lecture
 * chacune pour toute la page, et seulement s'il y a une clé et un lecteur. Une
 * ligne introuvable ne prouve pas l'ordinaire : la loi ferme, la pièce est
 * signée (`attachmentIsReaderBound`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import type { ReaderFileUrlSigner } from './readerFileSignature';
import { signReaderAttachmentUrls, type SignableAttachment } from './signedAttachmentUrls';

const CARRIER_PROTECTION_SELECT = {
  id: true,
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
  ephemeralDuration: true,
  expiresAt: true,
} as const;

const PIECE_PROTECTION_SELECT = { id: true, isViewOnce: true, isBlurred: true, effectFlags: true } as const;

export async function signAttachmentsForReader<T extends SignableAttachment & { readonly messageId?: string | null }>(
  prisma: Pick<PrismaClient, 'message' | 'messageAttachment'>,
  input: {
    readonly attachments: readonly T[];
    readonly readerParticipantId: string | null | undefined;
    readonly signer: ReaderFileUrlSigner | null;
  }
): Promise<readonly T[]> {
  const { attachments, readerParticipantId, signer } = input;
  if (!signer || !readerParticipantId || attachments.length === 0) return attachments;
  const messageIds = [...new Set(attachments.flatMap((a) => (typeof a.messageId === 'string' ? [a.messageId] : [])))];
  const carriers = messageIds.length === 0
    ? []
    : await prisma.message.findMany({ where: { id: { in: messageIds } }, select: CARRIER_PROTECTION_SELECT });
  const pieceIds = attachments.flatMap((a) => (typeof a.id === 'string' ? [a.id] : []));
  const pieces = pieceIds.length === 0
    ? []
    : await prisma.messageAttachment.findMany({ where: { id: { in: pieceIds } }, select: PIECE_PROTECTION_SELECT });
  const carrierById = new Map(carriers.map((carrier) => [carrier.id, carrier]));
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  return attachments.map((attachment) => {
    const piece = typeof attachment.id === 'string' ? pieceById.get(attachment.id) : undefined;
    // La protection de la pièce est celle de la BASE, jamais celle du `select`
    // de l'appelant ; une ligne introuvable laisse les colonnes absentes : la
    // loi ferme.
    const relued = { ...attachment, isViewOnce: piece?.isViewOnce, isBlurred: piece?.isBlurred, effectFlags: piece?.effectFlags };
    const signed = signReaderAttachmentUrls(relued, {
      message: (typeof attachment.messageId === 'string' ? carrierById.get(attachment.messageId) : undefined) ?? {},
      readerParticipantId,
      signer,
    });
    return signed === relued ? attachment : { ...attachment, fileUrl: signed.fileUrl, thumbnailUrl: signed.thumbnailUrl, imageVariants: signed.imageVariants, translations: signed.translations };
  });
}

type AttachmentRecord = SignableAttachment & { readonly id?: unknown };

/**
 * La même signature sur les pièces d'une page de MESSAGES servis hors de la
 * liste (fil de discussion, messages épinglés) : une lecture de protection
 * pour toute la page, puis chaque message rendu avec ses pièces signées. La
 * forme de chaque pièce ne change pas — seules ses adresses.
 */
export async function signMessagesAttachmentsForReader<M extends { readonly id: string; readonly attachments?: unknown }>(
  prisma: Pick<PrismaClient, 'message' | 'messageAttachment'>,
  input: { readonly messages: readonly M[]; readonly readerParticipantId: string | null | undefined; readonly signer: ReaderFileUrlSigner | null }
): Promise<readonly M[]> {
  const { messages, readerParticipantId, signer } = input;
  if (!signer || !readerParticipantId) return messages;
  const piecesOf = (message: M): readonly AttachmentRecord[] =>
    Array.isArray(message.attachments)
      ? message.attachments.filter((entry): entry is AttachmentRecord => typeof entry === 'object' && entry !== null)
      : [];
  const flat = messages.flatMap((message) => piecesOf(message).map((piece) => ({ ...piece, messageId: message.id })));
  if (flat.length === 0) return messages;
  const signed = await signAttachmentsForReader(prisma, { attachments: flat, readerParticipantId, signer });
  const urlsByPiece = new Map(
    signed.flatMap((piece, index) => (piece === flat[index] || typeof piece.id !== 'string' ? [] : [[piece.id, piece] as const]))
  );
  if (urlsByPiece.size === 0) return messages;
  const signedId = (entry: unknown): string | undefined => {
    const id = typeof entry === 'object' && entry !== null ? (entry as AttachmentRecord).id : undefined;
    return typeof id === 'string' && urlsByPiece.has(id) ? id : undefined;
  };
  return messages.map((message) => {
    if (!Array.isArray(message.attachments) || !message.attachments.some((entry: unknown) => signedId(entry))) return message;
    return {
      ...message,
      attachments: message.attachments.map((entry: unknown) => {
        const id = typeof entry === 'object' && entry !== null ? (entry as AttachmentRecord).id : undefined;
        const urls = typeof id === 'string' ? urlsByPiece.get(id) : undefined;
        return urls
          ? { ...(entry as object), fileUrl: urls.fileUrl, thumbnailUrl: urls.thumbnailUrl, imageVariants: urls.imageVariants, translations: urls.translations }
          : entry;
      }),
    };
  });
}
