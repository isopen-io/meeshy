/**
 * Le magasin STRICT du partage de position (#14109, #16980), résolu à l'usage : brancher une
 * socket n'ouvre aucune connexion. Sans client Redis, chaque opération échoue — jamais de repli
 * mémoire, qui dirait « arrêté » à un seul processus pendant qu'un autre continue de diffuser.
 *
 * À part de `sharedLocationDeps.ts` pour que la batterie (#19204) lise l'accord d'un partage sans
 * importer le câblage du partage, qui importe le sien.
 */
import { getCacheStore } from '../CacheStore';
import { redisSharedLocationKv, UNAVAILABLE_SHARED_LOCATION_KV, type SharedLocationKv } from './sharedLocationKv';
import type { SharedLocationCache } from './sharedLocationStore';

const kv = (): SharedLocationKv => {
  const client = getCacheStore().getNativeClient();
  return client ? redisSharedLocationKv(client) : UNAVAILABLE_SHARED_LOCATION_KV;
};

export const lazySharedLocationCache: SharedLocationCache = {
  get: (key) => kv().get(key),
  mget: (keys) => kv().mget(keys),
  set: (key, value, ttlSeconds) => kv().set(key, value, ttlSeconds),
  del: (key) => kv().del(key),
  expire: (key, ttlSeconds) => kv().expire(key, ttlSeconds),
  claim: (keys, args) => kv().claim(keys, args),
  setIfCurrent: (keys, args) => kv().setIfCurrent(keys, args),
  advance: (keys) => kv().advance(keys),
  retiring: (key) => kv().retiring(key),
  retired: (key, session) => kv().retired(key, session),
  markSeen: (key, members, ttlSeconds) => kv().markSeen(key, members, ttlSeconds),
  seenAmong: (key, members) => kv().seenAmong(key, members),
  unmarkSeen: (key, members) => kv().unmarkSeen(key, members),
};
