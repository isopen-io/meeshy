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

/** Le type du push de réveil : le même pour tout signal, il ne nomme ni le signal ni la conversation. */
export const E2EE_WAKE_PUSH_TYPE = 'e2ee_wake' as const;

export type SignalRelayPrisma = RelayPrisma & Pick<PrismaClient, 'conversation'>;

export type E2EESignalRelayDeps = {
  readonly prisma: SignalRelayPrisma;
  readonly deliver?: (deliveries: readonly EnvelopeDelivery[]) => void;
  /** Réveille les appareils de ces comptes (push silencieux). Ne lève pas : un réveil perdu ne perd rien. */
  readonly wake?: (userIds: readonly string[]) => Promise<void>;
  readonly newSignalId?: () => string;
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

export class E2EESignalRelay {
  private readonly prisma: SignalRelayPrisma;
  private readonly deliver: (deliveries: readonly EnvelopeDelivery[]) => void;
  private readonly wake: (userIds: readonly string[]) => Promise<void>;
  private readonly newSignalId: () => string;

  constructor(deps: E2EESignalRelayDeps) {
    this.prisma = deps.prisma;
    this.deliver = deps.deliver ?? deliverEnvelopes;
    this.wake = deps.wake ?? (async () => undefined);
    this.newSignalId = deps.newSignalId ?? objectIdHex;
  }

  async relay(input: SignalRelayInput): Promise<E2EESignalRelayResponse> {
    const { conversationId, senderUserId, request } = input;
    await this.assertEndToEnd(conversationId);
    await this.assertMember(conversationId, senderUserId);
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

  private async assertEndToEnd(conversationId: string): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId }, select: { encryptionMode: true } });
    if (!isEndToEndMode(conversation?.encryptionMode)) throw regimeChanged();
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
