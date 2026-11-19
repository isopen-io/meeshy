/**
 * L'admission d'un ENVOI au régime de sa conversation (#11216, #12518, #13113), lue
 * AVANT tout le reste de `MessageProcessor.saveMessage` : un envoi refusé ne
 * laisse rien derrière lui — ni `TrackingLink` minté sur son URL, ni lecture de
 * la source qu'il voulait recopier.
 *
 * Le régime est lu MÊME quand l'envoi porte un chiffré : c'est la conversation
 * qui dit si le serveur a le droit de lire, jamais l'envoi. En `e2ee`, un clair
 * glissé à côté du chiffré, toute pièce que le serveur aurait reçue en clair et
 * tout voisin déclaré en clair — sticker, pièce citée, transfert serveur
 * (#13113) — sont refusés (`e2eePlaintextAdmission.ts`) ; `endToEnd` dit ensuite
 * à l'appelant de ne faire tourner aucun pipeline serveur.
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
 * Depuis #14369, le mode `hybrid` chiffre réellement deux fois : un envoi y
 * porte le clair (couche SERVEUR, scellée au repos par `MessageProcessor`) et,
 * s'il vient d'un appareil libsignal, une couche APPAREIL (`deviceLayerRelay`)
 * admise par Sesame exactement comme un envoi `e2ee`. Sans couche appareil
 * (Android, web, ancien iOS), l'envoi hybride reste admis, couche serveur
 * seule. Une couche appareil vers tout autre régime est refusée
 * `E2EE_REGIME_CHANGED` : en `server` ou sans chiffrement, aucun appareil n'en
 * attend ; en `e2ee`, le clair qu'elle accompagne est refusé avant elle, et
 * sans clair ni chiffré elle n'est rien qu'un appareil sache ranger.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { E2EE_ERROR_CODES, type E2EEDeviceLayerRequest, type E2EERelayRequest } from '@meeshy/shared/types/e2ee-directory';
import { createE2EEEnvelopeRelay, type AdmittedRelay } from '../e2ee/E2EEEnvelopeRelay';
import { regimeEpochOf } from '../conversations/encryptionRegime';
import { clientOutdated, E2eeRelayRefusedError } from '../e2ee/e2ee-relay-errors';
import { isServerAtRestMode, ServerAtRestCiphertextRefusedError } from './serverAtRest';
import { parseSharedPlace } from '../location/sharedPlace';
import {
  assertNoPlaintextNeighbors,
  assertNoPlaintextPieces,
  assertPlaintextAdmitted,
  E2EE_PLAINTEXT_LOCATION_REFUSAL_MESSAGE,
  E2eePlaintextRefusedError,
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
  readonly forwardedFromConversationId?: string;
  /** Les textes d'un sticker (#4823) et la pièce citée (#6164) : en `e2ee`, des voisins en clair (#13113). */
  readonly sticker?: unknown;
  readonly attachmentReplyTo?: unknown;
  /** La ligne `Participant` de l'expéditeur (`Message.senderId`). */
  readonly senderId?: string;
  /** L'envoi libsignal par appareil (#3706), absent de tout autre envoi. */
  readonly e2eeRelay?: E2EERelayRequest;
  /** La couche appareil d'un envoi hybride (#14369), à côté du clair. */
  readonly deviceLayerRelay?: E2EEDeviceLayerRequest;
  /** Le lieu déclaré à côté (#12526) : seul, sans chiffré, c'est un message en clair. */
  readonly location?: unknown;
};

export type SendAdmission = {
  readonly regime: EncryptionRegime | null;
  readonly carriesCiphertext: boolean;
  readonly endToEnd: boolean;
  /** Les enveloppes admises, à ranger une fois le message persisté. */
  readonly relay: AdmittedRelay | null;
  /** Les enveloppes admises sont la couche appareil d'un message hybride (#14369). */
  readonly deviceLayer: boolean;
};

type AdmissionPrisma = Pick<PrismaClient, 'conversation' | 'participant' | 'e2EEDevice' | 'messageEnvelope'>;

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
  if (request.deviceLayerRelay && !isHybridMode(regime?.encryptionMode)) throw notHybrid();
  if (!endToEnd) {
    if (request.e2eeRelay) {
      throw new E2eeRelayRefusedError(E2EE_ERROR_CODES.REGIME_CHANGED, 409, 'Cette conversation n’est plus chiffrée de bout en bout');
    }
    // #11381 — là où la passerelle chiffre elle-même (`server`/`hybrid`), un chiffré
    // client est refusé avec sa phrase (« envoyez en clair ») ; ailleurs, #12562.
    if (carriesCiphertext && isServerAtRestMode(regime?.encryptionMode)) throw new ServerAtRestCiphertextRefusedError();
    if (carriesCiphertext) throw regimeChanged();
    if (!request.deviceLayerRelay) return { regime, carriesCiphertext, endToEnd, relay: null, deviceLayer: false };
    return { regime, carriesCiphertext, endToEnd, relay: await admitDeviceLayer(prisma, request, request.deviceLayerRelay, regime), deviceLayer: true };
  }
  // #13113 — un voisin en clair (sticker, pièce citée, transfert) est refusé
  // AVANT les pièces : un transfert ne relit même pas sa source.
  assertNoPlaintextNeighbors({ encryptionMode: regime?.encryptionMode, neighbors: request });
  assertNoPlaintextPieces({ encryptionMode: regime?.encryptionMode, carriedPieceCount: countCarriedPieces(request) });
  // #12526 — à côté d'un chiffré, un lieu en clair est RETENU (`admitSharedPlace`) ;
  // sans chiffré, le lieu EST le message : un clair, refusé comme tel.
  if (!carriesCiphertext && parseSharedPlace(request.location)) throw new E2eePlaintextRefusedError(E2EE_PLAINTEXT_LOCATION_REFUSAL_MESSAGE);
  if (!carriesCiphertext) return { regime, carriesCiphertext, endToEnd, relay: null, deviceLayer: false };
  if (sealedUnderStaleEpoch(request.encryptionMetadata, regimeEpochOf(regime))) throw regimeChanged();
  if (!request.e2eeRelay) throw clientOutdated();
  const relay = await createE2EEEnvelopeRelay({ prisma }).admit({
    conversationId: request.conversationId,
    senderUserId: await senderUserIdOf(prisma, request.senderId),
    relay: request.e2eeRelay,
  });
  return { regime, carriesCiphertext, endToEnd, relay, deviceLayer: false };
}

const isHybridMode = (mode: string | null | undefined): boolean =>
  typeof mode === 'string' && mode.trim().toLowerCase() === 'hybrid';

const notHybrid = (): E2eeRelayRefusedError =>
  new E2eeRelayRefusedError(
    E2EE_ERROR_CODES.REGIME_CHANGED,
    409,
    'Cette conversation n’est pas en mode hybride : son chiffrement a changé depuis la rédaction de ce message',
  );

/**
 * La couche appareil d'un hybride (#14369) passe la MÊME admission qu'un envoi
 * `e2ee` : époque déclarée, appareil émetteur lié à la session, et Sesame
 * contre l'annuaire de TOUS les membres (un groupe reçoit une enveloppe par
 * appareil de chaque membre, fan-out par paire).
 */
async function admitDeviceLayer(
  prisma: AdmissionPrisma,
  request: SendUnderRegime,
  layer: E2EEDeviceLayerRequest,
  regime: { readonly encryptionEpoch?: number | null } | null,
): Promise<AdmittedRelay> {
  if (layer.regimeEpoch !== undefined && layer.regimeEpoch !== regimeEpochOf(regime)) throw regimeChanged();
  return createE2EEEnvelopeRelay({ prisma }).admit({
    conversationId: request.conversationId,
    senderUserId: await senderUserIdOf(prisma, request.senderId),
    relay: layer.relay,
  });
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

/**
 * Les pièces que cet envoi ferait porter à son message : rattachées, ou
 * recopiées par une diffusion. Celles d'une source transférée n'ont plus à se
 * compter : en `e2ee`, le transfert lui-même est refusé avant (#13113).
 */
function countCarriedPieces(request: SendUnderRegime): number {
  if (request.attachmentIds?.length) return request.attachmentIds.length;
  return request.copyAttachmentsFromMessageId ? 1 : 0;
}
