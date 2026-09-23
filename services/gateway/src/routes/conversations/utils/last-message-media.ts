import { maskedAttachment, type AttachmentProtectionFlags } from '@meeshy/shared/utils/attachment-protection';
import type { LastMessageSticker } from '@meeshy/shared/types/conversation-preview';
import { stickerFromMetadata } from '../../../services/stickers/messageSticker';

/**
 * Le sticker et le texte alternatif du dernier message (#7591, #7594), servis
 * À L'IDENTIQUE par `GET /conversations` (`lastMessage.sticker`,
 * `lastMessage.attachments[0].alt`) et par `conversation:updated`
 * (`lastMessageSticker`, `lastMessageAttachments[0].alt`).
 *
 * Les deux sont du CONTENU : l'`alt` d'un sticker de texte est la phrase tapée,
 * et les `slots` d'un gabarit portent ses textes. Ils sont donc retenus sous
 * les DEUX niveaux de protection qui les déclarent — celui du MESSAGE
 * (`isPreviewWithheld`, décidé par l'appelant) et celui de la PIÈCE
 * (`maskedAttachment`, la loi partagée avec les clients). Une garde qui ne lit
 * que le message laissait partir la phrase d'un sticker flouté par sa pièce.
 *
 * Tout ici est pur.
 */

export interface PreviewAltAttachment extends AttachmentProtectionFlags {
  readonly alt?: string | null;
}

/** Le sticker hissé de `metadata.sticker`, ou `null` sans sticker ou sous protection. */
export function previewStickerOf(
  metadata: unknown,
  protection: { readonly messageWithheld: boolean; readonly attachments: readonly AttachmentProtectionFlags[] },
): LastMessageSticker | null {
  if (protection.messageWithheld || protection.attachments.some(maskedAttachment)) return null;
  return stickerFromMetadata(metadata);
}

/** Le texte alternatif d'une pièce, ou `null` s'il est vide ou que le message ou la pièce est protégé. */
export function previewAltOf(attachment: PreviewAltAttachment, messageWithheld: boolean): string | null {
  if (messageWithheld || maskedAttachment(attachment)) return null;
  const alt = attachment.alt?.trim();
  return alt ? alt : null;
}

/** La protection propre d'une pièce — des drapeaux, jamais du contenu : ils partent toujours. */
export function previewAttachmentProtection(attachment: AttachmentProtectionFlags): {
  readonly isViewOnce: boolean;
  readonly isBlurred: boolean;
  readonly effectFlags: number;
} {
  return {
    isViewOnce: attachment.isViewOnce === true,
    isBlurred: attachment.isBlurred === true,
    effectFlags: attachment.effectFlags ?? 0,
  };
}
