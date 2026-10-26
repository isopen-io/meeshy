/**
 * LE RELAIS DES SIGNAUX CHIFFRÉS D'UNE CONVERSATION E2EE (#13142, #13060).
 *
 * Une réaction, la frappe, un accusé, la progression de lecture d'un média, une
 * modification, une suppression pour tous, une vue unique consommée, un
 * épinglage : dans une conversation `e2ee`, chacun est un message de contrôle
 * libsignal que l'appareil émetteur chiffre pour chaque appareil destinataire,
 * les siens compris (Sesame, rév. 2, § 3). La passerelle n'en lit rien : elle
 * vérifie le régime, le membre et l'appareil, range une enveloppe par appareil
 * sous un identifiant de SIGNAL neuf — celui d'aucun message —, la remet en
 * temps réel par `e2ee:envelope`, et ne réveille les destinataires que si
 * l'expéditeur l'a demandé, par un push dont le type ne dit jamais le signal.
 *
 * Modèle de menace : serveur compromis. Il voit qui écrit à qui, quand, combien
 * d'enveloppes et leur taille (remplie par paliers côté client) ; il peut
 * retarder, rejouer ou retenir une enveloppe, jamais en forger une que
 * libsignal authentifierait, ni en lire le contenu.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { E2EE_ERROR_CODES, LIBSIGNAL_PROTOCOL } from '@meeshy/shared/types/e2ee-directory';
import type { E2EESignalRelayRequest, E2EESignalRelayResponse } from '@meeshy/shared/types/e2ee-signals';
import { ObjectId } from 'mongodb';
import { createE2EEEnvelopeRelay, type EnvelopeDelivery, type RelayPrisma } from './E2EEEnvelopeRelay';
import { E2eeRelayRefusedError } from './e2ee-relay-errors';
import { deliverEnvelopes } from './envelope-delivery';
import { isEndToEndMode } from '../messaging/e2eePlaintextAdmission';
import { isConversationClosed } from '../messaging/conversationWriteAdmission';
import { isBlockedBetween } from '../../utils/blocking';

/** Le type du push de réveil : le même pour tout signal, il ne nomme ni le signal ni la conversation. */
export const E2EE_WAKE_PUSH_TYPE = 'e2ee_wake' as const;

export type SignalRelayPrisma = RelayPrisma & Pick<PrismaClient, 'conversation' | 'user'>;

export type E2EESignalRelayDeps = {
  readonly prisma: SignalRelayPrisma;
  readonly deliver?: (deliveries: readonly EnvelopeDelivery[]) => void;
  /** Réveille les appareils de ces comptes (push silencieux). Ne lève pas : un réveil perdu ne perd rien. */
  readonly wake?: (userIds: readonly string[]) => Promise<void>;
  readonly newSignalId?: () => string;
  /** L'un des deux comptes a-t-il bloqué l'autre ? (`isBlockedBetween` en production.) */
  readonly blockedBetween?: (userIdA: string, userIdB: string) => Promise<boolean>;
};

export type SignalRelayInput = {
  readonly conversationId: string;
  readonly senderUserId: string;
  readonly sessionId: string | null;
  readonly request: E2EESignalRelayRequest;
};

/** Un ObjectId neuf : croissant comme ceux des messages, il ne désigne aucune ligne `Message`. */
const objectIdHex = (): string => new ObjectId().toHexString();

const regimeChanged = () =>
  new E2eeRelayRefusedError(E2EE_ERROR_CODES.REGIME_CHANGED, 409, 'Cette conversation n’est pas chiffrée de bout en bout');

const notAMember = () =>
  new E2eeRelayRefusedError(E2EE_ERROR_CODES.SIGNAL_FORBIDDEN, 403, 'Seul un membre de la conversation y envoie un signal chiffré');

const closedConversation = () =>
  new E2eeRelayRefusedError(E2EE_ERROR_CODES.SIGNAL_FORBIDDEN, 403, 'Cette conversation est fermée : plus personne n’y écrit');

const blockedPeer = () =>
  new E2eeRelayRefusedError(E2EE_ERROR_CODES.SIGNAL_FORBIDDEN, 403, 'Ce tête-à-tête est bloqué : aucun signal n’y passe');

const DIRECT_TYPES: ReadonlySet<string> = new Set(['direct', 'dm']);

type SignalConversation = {
  readonly encryptionMode: string | null;
  readonly type: string | null;
  readonly isActive: boolean | null;
  readonly closedAt: Date | null;
};

export class E2EESignalRelay {
  private readonly prisma: SignalRelayPrisma;
  private readonly deliver: (deliveries: readonly EnvelopeDelivery[]) => void;
  private readonly wake: (userIds: readonly string[]) => Promise<void>;
  private readonly newSignalId: () => string;
  private readonly blockedBetween: (userIdA: string, userIdB: string) => Promise<boolean>;

  constructor(deps: E2EESignalRelayDeps) {
    this.prisma = deps.prisma;
    this.deliver = deps.deliver ?? deliverEnvelopes;
    this.wake = deps.wake ?? (async () => undefined);
    this.newSignalId = deps.newSignalId ?? objectIdHex;
    this.blockedBetween = deps.blockedBetween ?? ((a, b) => isBlockedBetween(deps.prisma as PrismaClient, a, b));
  }

  /**
   * Un signal est une ÉCRITURE comme un message : il ne passe ni dans une
   * conversation fermée, ni dans un tête-à-tête bloqué (`messages-send.ts`
   * pose les mêmes refus à l'envoi). Sans eux, un correspondant bloqué
   * inonderait d'enveloppes et de réveils celui qui l'a bloqué. Le membre se
   * contrôle AVANT le régime : un étranger n'apprend pas si la conversation est chiffrée.
   */
  async relay(input: SignalRelayInput): Promise<E2EESignalRelayResponse> {
    const { conversationId, senderUserId, request } = input;
    await this.assertMember(conversationId, senderUserId);
    const conversation = await this.assertEndToEnd(conversationId);
    if (isConversationClosed(conversation)) throw closedConversation();
    await this.assertNotBlocked(conversationId, senderUserId, conversation);
    const envelopes = createE2EEEnvelopeRelay({ prisma: this.prisma });
    const admitted = await envelopes.admit({
      conversationId,
      senderUserId,
      relay: {
        protocol: LIBSIGNAL_PROTOCOL,
        senderDeviceId: request.senderDeviceId,
        envelopes: request.envelopes,
        unapprovedOwnDevices: request.unapprovedOwnDevices,
        sessionId: input.sessionId,
      },
    });
    const signalId = this.newSignalId();
    const deliveries = await envelopes.persist({ messageId: signalId, conversationId, admitted });
    this.deliver(deliveries);
    if (request.wake) await this.wakeRecipients(deliveries);
    return { signalId, envelopes: deliveries.length };
  }

  private async assertEndToEnd(conversationId: string): Promise<SignalConversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { encryptionMode: true, type: true, isActive: true, closedAt: true },
    });
    if (!conversation || !isEndToEndMode(conversation.encryptionMode)) throw regimeChanged();
    return conversation;
  }

  private async assertNotBlocked(conversationId: string, senderUserId: string, conversation: SignalConversation): Promise<void> {
    if (!DIRECT_TYPES.has(conversation.type ?? '')) return;
    const members = await this.prisma.participant.findMany({
      where: { conversationId, isActive: true },
      select: { userId: true },
    });
    const peers = members.map((member) => member.userId).filter((userId): userId is string => !!userId && userId !== senderUserId);
    const verdicts = await Promise.all(peers.map((peer) => this.blockedBetween(senderUserId, peer)));
    if (verdicts.some(Boolean)) throw blockedPeer();
  }

  private async assertMember(conversationId: string, userId: string): Promise<void> {
    const member = await this.prisma.participant.findFirst({
      where: { conversationId, userId, isActive: true },
      select: { id: true },
    });
    if (!member) throw notAMember();
  }

  private async wakeRecipients(deliveries: readonly EnvelopeDelivery[]): Promise<void> {
    const userIds = [...new Set(deliveries.map((delivery) => delivery.recipient.userId))];
    await this.wake(userIds).catch(() => undefined);
  }
}

export const createE2EESignalRelay = (deps: E2EESignalRelayDeps): E2EESignalRelay => new E2EESignalRelay(deps);
