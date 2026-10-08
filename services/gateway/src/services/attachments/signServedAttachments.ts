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
