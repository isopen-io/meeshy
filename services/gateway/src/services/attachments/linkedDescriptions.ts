/**
 * Ce que devient la description d'une pièce quand elle REJOINT son message
 * (#12333, audit A3) — le seul instant où sa protection et le chiffrement de
 * sa conversation sont connus.
 *
 * - Conversation chiffrée (E2EE ou chiffrement serveur) : la description en
 *   clair est EFFACÉE (fail-closed, #9224 — le serveur ne garde pas le clair de
 *   ce que la conversation chiffre), et rien ne part au traducteur.
 * - Sinon, la traduction est déclenchée ; sa garde relit la protection en base
 *   et ne traduit pas une pièce protégée.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { triggerMessageAttachmentAltTranslation } from './MessageAttachmentAltTranslationService';

const logger = enhancedLogger.child({ module: 'linkedDescriptions' });

type Ports = Pick<PrismaClient, 'message' | 'messageAttachment'>;

export async function settleLinkedDescriptions(
  prisma: Ports,
  attachmentIds: readonly string[],
  messageId: string,
  trigger: (attachmentId: string) => void = triggerMessageAttachmentAltTranslation,
): Promise<void> {
  try {
    const described = await prisma.messageAttachment.findMany({
      where: { id: { in: [...attachmentIds] }, messageId, alt: { not: null } },
      select: { id: true },
    });
    if (described.length === 0) return;
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { isEncrypted: true, encryptionMode: true, conversation: { select: { encryptionMode: true } } },
    });
    const encrypted = !message || message.isEncrypted === true || Boolean(message.encryptionMode) || Boolean(message.conversation?.encryptionMode);
    if (encrypted) {
      await prisma.messageAttachment.updateMany({
        where: { id: { in: described.map((row) => row.id) } },
        data: { alt: null, altLanguage: null, altTranslations: null },
      });
      return;
    }
    described.forEach((row) => trigger(row.id));
  } catch (error) {
    logger.error('Description des pièces rattachées non réglée', { messageId, error });
  }
}
