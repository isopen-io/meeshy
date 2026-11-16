// Fixture — la LIAISON LOCALE, et les parenthèses autour du constructeur.
import { RedisDeliveryQueue } from '../../../../services/RedisDeliveryQueue';

const Ctor = RedisDeliveryQueue;

export const rebound = (store: unknown) => new Ctor(store as never);
export const parenthesized = (store: unknown) => new (RedisDeliveryQueue)(store as never);
