import type { PrismaClient } from '@meeshy/shared/prisma/client';

import type { MediaReadyListenerDeps } from '../services/attachments/media-processing/ready-listener';
import { getCacheStore } from '../services/CacheStore';
import { getSharedQueueEnqueuer } from '../services/delivery-queue-registry';

/**
 * Les dépendances des trois chemins qui republient une pièce rendue ou traduite
 * — extraites de `MeeshySocketIOHandler` pour qu'elles soient OBSERVABLES par un
 * témoin (#18616).
 *
 * C'est le patron de `database-bootstrap.ts`, et pour la raison qu'il écrit :
 * tant que la composition vivait en ligne dans une méthode privée, le seul
 * témoin possible de sa forme était un `grep` — une lecture de TEXTE, qui reste
 * verte quand le comportement disparaît.
 *
 * ─── Ce que la FILE a de particulier ici ─────────────────────────────────────
 *
 * Ce site construisait sa PROPRE `RedisDeliveryQueue`. La tranche Redis est
 * partagée, donc rien n'y cassait ; la tranche MÉMOIRE est par instance, et sur
 * celle-là `drain()`, `purgeMessage()` et `cleanup()` n'étaient JAMAIS appelées.
 * Une entrée `'attachment-updated'` tombée en mémoire pendant un hoquet Redis
 * n'était jamais livrée, et la transcription d'un message détruit y survivait —
 * `'attachment-updated'` étant porteur de TEXTE.
 *
 * Deux doc-comments affirmaient pourtant l'unicité de l'instance, à l'endroit
 * exact où l'on irait vérifier.
 *
 * **Le moment de la résolution est ce qui rend le registre juste ici** :
 * `server.ts` enregistre la file (`setSharedDeliveryQueue`) bien avant
 * `setupSocketIO()`, donc avant que le pipeline média ne démarre. Résoudre à la
 * CONSTRUCTION du handler serait arrivé trop tôt — et c'est très probablement
 * cette contrainte d'ordre qui a fait naître la seconde instance.
 *
 * `null` quand aucune file n'est enregistrée : `enqueueForOfflineParticipants`
 * le lit comme « pas de rejeu hors ligne dans ce processus » et sort, ce qui est
 * le cas d'un test, d'un script ou d'un outil.
 */
/**
 * Ce que la composition demande au manager — énoncé par les TYPES que les trois
 * chemins attendent, jamais en `unknown` : un double qui rendrait n'importe
 * quoi compilerait, et la composition cesserait d'être gardée par le
 * compilateur, qui est ici la moitié de la preuve.
 */
export type MediaPipelineManager = {
  getIO(): MediaReadyListenerDeps['io'];
  getReachability(): ReturnType<MediaReadyListenerDeps['connectedUsers']>;
  getSocialEventsHandler(): ReturnType<MediaReadyListenerDeps['socialEvents']>;
};

export function mediaPipelineDeps(
  prisma: PrismaClient,
  manager: MediaPipelineManager,
): MediaReadyListenerDeps {
  return {
    prisma,
    io: manager.getIO(),
    deliveryQueue: getSharedQueueEnqueuer() ?? null,
    connectedUsers: () => manager.getReachability(),
    socialEvents: () => manager.getSocialEventsHandler(),
    leaseStore: getCacheStore(),
  };
}
