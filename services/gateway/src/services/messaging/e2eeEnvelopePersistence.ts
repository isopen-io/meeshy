/**
 * Écrit un message chiffré ET ses enveloppes libsignal ADMISES (#3706) dans
 * UNE transaction du jeu de réplicas. Un message chiffré sans ses enveloppes
 * ne serait lisible par aucun appareil : les deux s'écrivent ensemble ou pas du
 * tout, et la distribution `e2ee:envelope` n'a lieu qu'APRÈS la validation.
 *
 * Constat GW-05 de la revue E2EE du 2026-11-17 (#18906) : l'écriture se
 * faisait en deux temps, défaite par une suppression de RATTRAPAGE. Que cette
 * suppression échoue (élection du jeu de réplicas, arrêt du processus entre
 * les deux écritures) et la ligne restait sans enveloppe ; le renvoi au même
 * `clientMessageId` tombait alors sur la déduplication, qui répondait succès
 * avec zéro enveloppe rangée et zéro émission — un message perdu en silence.
 * La transaction rend cet état impossible : la déduplication ne voit jamais
 * qu'un message validé AVEC ses enveloppes.
 */
import type { Message, Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { createE2EEEnvelopeRelay, type AdmittedRelay } from '../e2ee/E2EEEnvelopeRelay';
import { deliverEnvelopes } from '../e2ee/envelope-delivery';

export async function createMessageWithEnvelopes<M extends Pick<Message, 'id' | 'conversationId'>>(
  prisma: Pick<PrismaClient, '$transaction'>,
  params: {
    /** L'écriture de la ligne `Message`, faite par la transaction. */
    readonly writeMessage: (tx: Prisma.TransactionClient) => Promise<M>;
    readonly relay: AdmittedRelay;
  },
): Promise<M> {
  const { message, deliveries } = await prisma.$transaction(async (tx) => {
    const written = await params.writeMessage(tx);
    const persisted = await createE2EEEnvelopeRelay({ prisma: tx }).persist({
      messageId: written.id,
      conversationId: written.conversationId,
      admitted: params.relay,
    });
    return { message: written, deliveries: persisted };
  });
  deliverEnvelopes(deliveries);
  return message;
}
