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
 *
 * Depuis #3706, le SEUL chiffré admis en `e2ee` est un envoi libsignal par
 * appareil (`relay`) : ses enveloppes doivent couvrir exactement l'annuaire
 * (Sesame), sinon 409. Un chiffré à l'ancienne — que plus aucun appareil ne
 * sait lire — est refusé `E2EE_CLIENT_OUTDATED`, phrase lisible comprise ; des
 * enveloppes vers une conversation qui n'est plus chiffrée, `E2EE_REGIME_CHANGED`.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { E2EE_ERROR_CODES, type E2EERelayRequest } from '@meeshy/shared/types/e2ee-directory';
import { createE2EEEnvelopeRelay, type AdmittedRelay } from '../e2ee/E2EEEnvelopeRelay';
import { clientOutdated, E2eeRelayRefusedError } from '../e2ee/e2ee-relay-errors';
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
  /** La ligne `Participant` de l'expéditeur (`Message.senderId`). */
  readonly senderId?: string;
  /** L'envoi libsignal par appareil (#3706), absent de tout autre envoi. */
  readonly e2eeRelay?: E2EERelayRequest;
};

export type SendAdmission = {
  readonly regime: EncryptionRegime | null;
  readonly carriesCiphertext: boolean;
  readonly endToEnd: boolean;
  /** Les enveloppes admises, à ranger une fois le message persisté. */
  readonly relay: AdmittedRelay | null;
};

type AdmissionPrisma = Pick<PrismaClient, 'conversation' | 'messageAttachment' | 'participant' | 'e2EEDevice' | 'messageEnvelope'>;

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
  if (!endToEnd) {
    if (request.e2eeRelay) {
      throw new E2eeRelayRefusedError(E2EE_ERROR_CODES.REGIME_CHANGED, 409, 'Cette conversation n’est plus chiffrée de bout en bout');
    }
    return { regime, carriesCiphertext, endToEnd, relay: null };
  }
  assertNoPlaintextPieces({ encryptionMode: regime?.encryptionMode, carriedPieceCount: await countCarriedPieces(prisma, request) });
  if (!carriesCiphertext) return { regime, carriesCiphertext, endToEnd, relay: null };
  if (!request.e2eeRelay) throw clientOutdated();
  const relay = await createE2EEEnvelopeRelay({ prisma }).admit({
    conversationId: request.conversationId,
    senderUserId: await senderUserIdOf(prisma, request.senderId),
    relay: request.e2eeRelay,
  });
  return { regime, carriesCiphertext, endToEnd, relay };
}

async function senderUserIdOf(prisma: AdmissionPrisma, participantId: string | undefined): Promise<string> {
  const participant = participantId
    ? await prisma.participant.findUnique({ where: { id: participantId }, select: { userId: true } })
    : null;
  if (!participant?.userId) {
    throw new E2eeRelayRefusedError(E2EE_ERROR_CODES.DEVICE_NOT_BOUND, 403, 'Seul un compte inscrit envoie un message chiffré de bout en bout');
  }
  return participant.userId;
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
