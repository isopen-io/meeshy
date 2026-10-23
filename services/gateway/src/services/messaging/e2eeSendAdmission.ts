/**
 * L'admission d'un ENVOI au régime de sa conversation (#11216, #12518), lue
 * AVANT tout le reste de `MessageProcessor.saveMessage` : un envoi refusé ne
 * laisse rien derrière lui — ni `TrackingLink` minté sur son URL, ni lecture de
 * la source qu'il voulait recopier.
 *
 * Le régime est lu MÊME quand l'envoi porte un chiffré : c'est la conversation
 * qui dit si le serveur a le droit de lire, jamais l'envoi. En `e2ee`, un clair
 * glissé à côté du chiffré et toute pièce que le serveur aurait reçue en clair
 * sont refusés (`e2eePlaintextAdmission.ts`) ; `endToEnd` dit ensuite à
 * l'appelant de ne faire tourner aucun pipeline serveur.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  assertNoPlaintextPieces,
  assertPlaintextAdmitted,
  isEndToEndMode,
  plaintextBesideCiphertext,
  type EncryptionRegime,
} from './e2eePlaintextAdmission';

export type SendUnderRegime = {
  readonly conversationId: string;
  readonly content: string;
  readonly encryptedContent?: string;
  readonly encryptionMetadata?: unknown;
  readonly attachmentIds?: readonly string[];
  readonly copyAttachmentsFromMessageId?: string;
  readonly forwardedFromId?: string;
  readonly forwardCopySelection?: readonly string[];
};

export type SendAdmission = {
  readonly regime: EncryptionRegime | null;
  readonly carriesCiphertext: boolean;
  readonly endToEnd: boolean;
};

type AdmissionPrisma = Pick<PrismaClient, 'conversation' | 'messageAttachment'>;

export async function admitSendUnderRegime(prisma: AdmissionPrisma, request: SendUnderRegime): Promise<SendAdmission> {
  const carriesCiphertext = Boolean(request.encryptedContent && request.encryptionMetadata);
  const regime = await prisma.conversation.findUnique({
    where: { id: request.conversationId },
    select: { encryptionMode: true, encryptionEnabledAt: true, serverEncryptionKeyId: true },
  });
  const endToEnd = isEndToEndMode(regime?.encryptionMode);
  assertPlaintextAdmitted({
    encryptionMode: regime?.encryptionMode,
    plaintext: carriesCiphertext ? plaintextBesideCiphertext(request.content) : request.content,
  });
  if (endToEnd) {
    assertNoPlaintextPieces({ encryptionMode: regime?.encryptionMode, carriedPieceCount: await countCarriedPieces(prisma, request) });
  }
  return { regime, carriesCiphertext, endToEnd };
}

/**
 * Les pièces que cet envoi ferait porter à son message, quel que soit le
 * chemin que `handleAttachments` prendra : rattachées, recopiées par une
 * diffusion, ou recopiées d'une source transférée (sauf verdict vide).
 */
async function countCarriedPieces(prisma: AdmissionPrisma, request: SendUnderRegime): Promise<number> {
  if (request.attachmentIds?.length) return request.attachmentIds.length;
  if (request.copyAttachmentsFromMessageId) return 1;
  if (!request.forwardedFromId || request.forwardCopySelection?.length === 0) return 0;
  const copied = await prisma.messageAttachment.findMany({
    where: {
      messageId: request.forwardedFromId,
      ...(request.forwardCopySelection ? { id: { in: [...request.forwardCopySelection] } } : {}),
    },
    select: { id: true },
  });
  return copied.length;
}
