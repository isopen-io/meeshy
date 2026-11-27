import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { enhancedLogger } from '../utils/logger-enhanced';
import type { UnsealedRetentionBudget } from './deliveryQueueUnsealedBudget';
import type { SoleInstanceWitness } from './gatewayInstanceCensus';
import type { DeliveryQueueSealMetrics } from './metrics/deliveryQueueSealMetrics';

const logger = enhancedLogger.child({ module: 'RedisDeliveryQueue' });

export type HeapAdmission = {
  readonly soleInstance: SoleInstanceWitness;
  readonly budget: UnsealedRetentionBudget;
  readonly metrics: Pick<DeliveryQueueSealMetrics, 'unsealed'>;
};

/**
 * L'ENTRÉE D'UN CLAIR DANS LE TAS (#19827), et les deux conditions qui la bornent.
 *
 * #19947 — garder n'achète une livraison que si la reconnexion du destinataire
 * tombe sur CE processus. Sans instance unique ATTESTÉE (`gatewayInstanceCensus.ts`),
 * l'entrée est détruite : on ne retient pas 48 h un clair qu'une autre
 * réplique ne remettra jamais. Ce qui est perdu est le REJEU, pas le message,
 * que `saveMessage` a écrit avant tout éventail.
 *
 * #19945 — puis le budget du clair gardé, en entrées et en octets.
 *
 * Synchrone de bout en bout : appelée sans `await` entre l'admission et
 * l'écriture dans la tranche mémoire, deux enfilages concurrents ne se
 * rapprochent pas du tas l'un au milieu de l'autre.
 */
export function admittedToHeap(
  admission: HeapAdmission,
  scope: { readonly userId: string; readonly entry: QueuedMessagePayload; readonly sealReason: string; readonly bytes: number },
): boolean {
  const { entry } = scope;
  const context = {
    userId: scope.userId, conversationId: entry.conversationId, messageId: entry.messageId, eventType: entry.eventType ?? 'new',
  };
  if (!admission.soleInstance.isSoleInstance()) {
    logger.error('Offline entry of an at-rest conversation DROPPED: keeping it in memory needs a single attested gateway process', {
      ...context, reason: 'not-sole-instance', sealReason: scope.sealReason, disposition: 'dropped',
    });
    admission.metrics.unsealed('dropped_multi_instance');
    return false;
  }
  if (!admission.budget.admit(entry, scope.bytes)) {
    logger.error('Offline entry of an at-rest conversation DROPPED: the unsealed retention budget is full', {
      ...context, reason: 'volume-cap', sealReason: scope.sealReason, disposition: 'dropped',
    });
    admission.metrics.unsealed('dropped_volume_cap');
    return false;
  }
  logger.error('Offline entry of an at-rest conversation kept unsealed in memory: it cannot be sealed right now', {
    ...context, reason: scope.sealReason, disposition: 'kept-in-memory',
  });
  admission.metrics.unsealed('kept_in_memory');
  return true;
}
