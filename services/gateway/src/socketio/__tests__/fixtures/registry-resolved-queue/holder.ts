// Fixture — la forme JUSTE : la file ne se construit pas, elle se RÉSOUT. Le
// balayage ne doit pas la signaler, sans quoi il mesurerait la popularité d'un
// import au lieu de l'unicité d'instance.
import { getSharedOfflineEnqueuer } from '../../../../services/delivery-queue-registry';

export function mediaDeps() {
  return {
    get deliveryQueue() {
      return getSharedOfflineEnqueuer() ?? null;
    },
  };
}
