/**
 * Le serveur lit-il le message qui porte cette pièce jointe ? (#10726)
 *
 * La transcription et la traduction à la demande d'un vocal ne se lancent que
 * sur un contenu que la passerelle LIT : un vocal d'une conversation chiffrée
 * de bout en bout se transcrit sur l'appareil, jamais par Whisper sur son
 * chiffré. Même règle que la traduction partagée
 * (`sharedTranslationServerReadsMessage`, mode de la conversation ET du
 * message), donc une seule loi pour « le serveur lit ce message ».
 *
 * Fail-closed : un porteur introuvable ou une lecture qui lève répondent
 * « non ». Une pièce pas encore rattachée (envoi en cours) n'a pas de porteur
 * à consulter : seul son déposant y accède (`resolveAttachmentReadVerdict`),
 * et elle reste traitée comme avant.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { sharedTranslationServerReadsMessage } from '@meeshy/shared/utils/shared-translation-eligibility';

const CARRIER_READABILITY_SELECT = {
  isEncrypted: true,
  encryptionMode: true,
  conversation: { select: { encryptionMode: true } },
} as const;

export async function serverReadsAttachmentCarrier(
  prisma: Pick<PrismaClient, 'message'>,
  messageId: string | null | undefined
): Promise<boolean> {
  if (!messageId) return true;
  try {
    const carrier = await prisma.message.findUnique({ where: { id: messageId }, select: CARRIER_READABILITY_SELECT });
    if (!carrier) return false;
    return sharedTranslationServerReadsMessage({
      conversationEncryptionMode: carrier.conversation?.encryptionMode,
      messageIsEncrypted: carrier.isEncrypted,
      messageEncryptionMode: carrier.encryptionMode,
    });
  } catch {
    return false;
  }
}
