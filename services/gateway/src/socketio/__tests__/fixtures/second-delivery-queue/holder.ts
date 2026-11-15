// Fixture — la forme que `sweepDeliveryQueueConstructions` doit VOIR : une
// unité qui se CONSTRUIT sa propre file au lieu de résoudre celle du processus.
// C'est ce que `MeeshySocketIOHandler.startMediaPipelines` a porté jusqu'à
// #18616, pour les quatre déclencheurs de `message:attachment-updated`.
import { RedisDeliveryQueue } from '../../../services/RedisDeliveryQueue';

export function mediaDeps(cacheStore: unknown, sealer: unknown) {
  return { deliveryQueue: new RedisDeliveryQueue(cacheStore as never, sealer as never) };
}
