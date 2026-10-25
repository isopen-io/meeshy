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
 *
 * Depuis #12522 et #12562, le régime est COMMUTABLE : TOUT chiffré vers une
 * conversation qui n'est pas `e2ee` est refusé `E2EE_REGIME_CHANGED` (aucun
 * appareil n'y a de quoi le lire : il était rangé en bulle vide), et un
 * chiffré qui déclare l'époque sous laquelle il a été scellé
 * (`encryptionMetadata.regimeEpoch`) est refusé de même quand l'époque a
 * changé depuis. Un envoi sans époque déclarée (client antérieur) n'est pas
 * jugé sur elle.
 *
 * Depuis #10789, la SEULE pièce admise en `e2ee` est un blob chiffré sur
 * l'appareil (`encryptionMode: 'e2ee'`, rangé opaque par la porte TUS) :
 * déposé par l'expéditeur, pas encore rattaché, et porté par un envoi
 * libsignal — le pointeur qui l'ouvre voyage dans les enveloppes. Une pièce en
 * clair, une copie ou un transfert de pièces gardent le refus de #12518. Hors
 * `e2ee`, un blob est refusé `E2EE_REGIME_CHANGED`.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { E2EE_ERROR_CODES, type E2EERelayRequest } from '@meeshy/shared/types/e2ee-directory';
import { createE2EEEnvelopeRelay, type AdmittedRelay } from '../e2ee/E2EEEnvelopeRelay';
import { regimeEpochOf } from '../conversations/encryptionRegime';
import { MESSAGE_ATTACHMENT_ORDER } from '../attachments/attachmentIncludes';
import { clientOutdated, E2eeRelayRefusedError } from '../e2ee/e2ee-relay-errors';
import { E2EE_ATTACHMENT_ERROR_CODES, isEndToEndAttachment } from '@meeshy/shared/types/e2ee-attachment';
import { isServerAtRestMode, ServerAtRestCiphertextRefusedError } from './serverAtRest';
import {
  E2EE_PLAINTEXT_ATTACHMENT_REFUSAL_MESSAGE,
  E2eePlaintextRefusedError,
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
    select: { encryptionMode: true, encryptionEnabledAt: true, serverEncryptionKeyId: true, encryptionEpoch: true },
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
    // #11381 — là où la passerelle chiffre elle-même (`server`/`hybrid`), un chiffré
    // client est refusé avec sa phrase (« envoyez en clair ») ; ailleurs, #12562.
    if (carriesCiphertext && isServerAtRestMode(regime?.encryptionMode)) throw new ServerAtRestCiphertextRefusedError();
    if (carriesCiphertext) throw regimeChanged();
    // #10789 — un blob chiffré sur l'appareil n'entre que dans une conversation
    // e2ee. Un transfert d'une source chiffrée ne recopie rien (`forwardAdmission`) :
    // seules les pièces RATTACHÉES se relisent ici, sans requête de plus pour les autres envois.
    if ((await attachedPieces(prisma, request)).some(isEndToEndAttachment)) throw regimeChanged();
    return { regime, carriesCiphertext, endToEnd, relay: null };
  }
  const pieces = await carriedPieces(prisma, request);
  assertOnlyDeviceSealedPieces(pieces, request.attachmentIds ?? []);
  const sealedPieces = pieces.attached.length > 0;
  if (sealedPieces && !(carriesCiphertext && request.e2eeRelay)) throw invalidPiece('une pièce chiffrée part avec ses enveloppes');
  if (!carriesCiphertext) return { regime, carriesCiphertext, endToEnd, relay: null };
  if (sealedUnderStaleEpoch(request.encryptionMetadata, regimeEpochOf(regime))) throw regimeChanged();
  if (!request.e2eeRelay) throw clientOutdated();
  const senderUserId = await senderUserIdOf(prisma, request.senderId);
  if (pieces.attached.some((piece) => piece.uploadedBy !== senderUserId || piece.messageId)) {
    throw invalidPiece('une pièce chiffrée n’entre que dans l’envoi de celui qui l’a déposée');
  }
  const relay = await createE2EEEnvelopeRelay({ prisma }).admit({
    conversationId: request.conversationId,
    senderUserId,
    relay: request.e2eeRelay,
  });
  return { regime, carriesCiphertext, endToEnd, relay };
}

const invalidPiece = (reason: string): E2eeRelayRefusedError =>
  new E2eeRelayRefusedError(E2EE_ATTACHMENT_ERROR_CODES.INVALID, 400, `Pièce jointe chiffrée refusée : ${reason}`);

/**
 * En `e2ee`, toute pièce rattachée est un blob chiffré sur l'appareil ; une
 * pièce inconnue, en clair, copiée ou transférée est refusée sous le code que
 * les anciens clients savent dire (#12518, #9223).
 */
function assertOnlyDeviceSealedPieces(pieces: CarriedPieces, attachmentIds: readonly string[]): void {
  const allSealed = pieces.attached.length === new Set(attachmentIds).size && pieces.attached.every(isEndToEndAttachment);
  if (pieces.copied.length > 0 || pieces.copiesFromBroadcast || !allSealed) {
    throw new E2eePlaintextRefusedError(E2EE_PLAINTEXT_ATTACHMENT_REFUSAL_MESSAGE);
  }
}

const regimeChanged = (): E2eeRelayRefusedError =>
  new E2eeRelayRefusedError(
    E2EE_ERROR_CODES.REGIME_CHANGED,
    409,
    'Le chiffrement de cette conversation a changé depuis la rédaction de ce message : renvoyez-le',
  );

/** L'époque déclarée par l'envoi, quand il en déclare une, n'est plus la courante. */
function sealedUnderStaleEpoch(metadata: unknown, currentEpoch: number): boolean {
  if (typeof metadata !== 'object' || metadata === null) return false;
  const declared = (metadata as Record<string, unknown>).regimeEpoch;
  return typeof declared === 'number' && declared !== currentEpoch;
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

type CarriedPiece = {
  readonly id: string;
  readonly encryptionMode: string | null;
  readonly uploadedBy: string;
  readonly messageId: string | null;
};

type CarriedPieces = {
  /** Les pièces pré-téléversées que l'envoi rattache (`attachmentIds`). */
  readonly attached: readonly CarriedPiece[];
  /** Les pièces qu'une diffusion ou un transfert recopieraient. */
  readonly copied: readonly CarriedPiece[];
  /** Une diffusion recopie toujours au moins une pièce, même si sa source n'en montre aucune ici. */
  readonly copiesFromBroadcast: boolean;
};

const PIECE_SELECT = { id: true, encryptionMode: true, uploadedBy: true, messageId: true } as const;

/**
 * Les pièces que cet envoi ferait porter à son message, quel que soit le
 * chemin que `handleAttachments` prendra : rattachées, recopiées par une
 * diffusion, ou recopiées d'une source transférée (sauf verdict vide).
 */
async function attachedPieces(prisma: AdmissionPrisma, request: SendUnderRegime): Promise<readonly CarriedPiece[]> {
  if (!request.attachmentIds?.length) return [];
  return prisma.messageAttachment.findMany({
    where: { id: { in: [...new Set(request.attachmentIds)] } },
    select: PIECE_SELECT,
  });
}

async function carriedPieces(prisma: AdmissionPrisma, request: SendUnderRegime): Promise<CarriedPieces> {
  // L'UNION de ce que l'envoi ferait porter : `handleAttachments` traite la
  // diffusion AVANT les pièces rattachées, si bien qu'un blob scellé ne doit
  // jamais masquer une recopie en clair (audit du 2026-10-25).
  const attached = await attachedPieces(prisma, request);
  const broadcast = request.copyAttachmentsFromMessageId
    ? await prisma.messageAttachment.findMany({
        where: { messageId: request.copyAttachmentsFromMessageId },
        orderBy: MESSAGE_ATTACHMENT_ORDER,
        select: PIECE_SELECT,
      })
    : [];
  const forwarded = !request.forwardedFromId || request.forwardCopySelection?.length === 0
    ? []
    : await prisma.messageAttachment.findMany({
        where: {
          messageId: request.forwardedFromId,
          ...(request.forwardCopySelection ? { id: { in: [...request.forwardCopySelection] } } : {}),
        },
        orderBy: MESSAGE_ATTACHMENT_ORDER,
        select: PIECE_SELECT,
      });
  return { attached, copied: [...broadcast, ...forwarded], copiesFromBroadcast: Boolean(request.copyAttachmentsFromMessageId) };
}
