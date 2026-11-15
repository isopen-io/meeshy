/**
 * Range les enveloppes libsignal ADMISES d'un message qui vient d'être écrit
 * (#3706). Un message chiffré sans ses enveloppes ne serait lisible par aucun
 * appareil : si elles ne peuvent pas être rangées, le message est DÉFAIT et
 * l'erreur remonte — l'expéditeur voit un échec et renvoie, jamais un message
 * fantôme que personne ne peut ouvrir.
 */
import type { Message, PrismaClient } from '@meeshy/shared/prisma/client';
import { createE2EEEnvelopeRelay, type AdmittedRelay, type EnvelopeDelivery } from '../e2ee/E2EEEnvelopeRelay';
import { deliverEnvelopes } from '../e2ee/envelope-delivery';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'E2EEEnvelopePersistence' });

type PersistencePrisma = Pick<PrismaClient, 'message' | 'e2EEDevice' | 'participant' | 'messageEnvelope'>;

export async function persistAdmittedEnvelopes(
  prisma: PersistencePrisma,
  params: { readonly message: Pick<Message, 'id' | 'conversationId'>; readonly relay: AdmittedRelay },
): Promise<readonly EnvelopeDelivery[]> {
  const relay = createE2EEEnvelopeRelay({ prisma });
  try {
    const deliveries = await relay.persist({ messageId: params.message.id, conversationId: params.message.conversationId, admitted: params.relay });
    deliverEnvelopes(deliveries);
    return deliveries;
  } catch (error) {
    await prisma.message.delete({ where: { id: params.message.id } }).catch((rollbackError: unknown) =>
      logger.error('e2ee: message without envelopes could not be rolled back', { messageId: params.message.id, rollbackError }),
    );
    throw error;
  }
}
