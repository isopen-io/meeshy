// Fixture — la SOUS-CLASSE, dans un module `.mts`. L'audit la nomme la forme
// la plus réaliste des six : une file consciente du scellement, ou instrumentée
// pour les métriques, est un refactor ordinaire — et elle porte sa PROPRE
// tranche mémoire, donc c'est bien une seconde instance.
import { RedisDeliveryQueue } from '../../../../services/RedisDeliveryQueue';

export class MediaQueue extends RedisDeliveryQueue {}

export const reflected = (store: unknown) => Reflect.construct(RedisDeliveryQueue, [store]);
