/**
 * Le câblage du relais de la séance « ensemble » (#17012) : le cache partagé du processus,
 * l'horloge, la porte d'émission. Les routes qui changent un lien ou un blocage rejugent la
 * séance de la paire par {@link rejudgeTogetherAfter} : un échec n'arrête jamais le geste,
 * il est seulement journalisé (sans charge).
 *
 * Les sites UNIQUES qui ferment une porte sans tenir de quoi émettre — la fin d'une
 * appartenance, le retrait d'un message, la désactivation d'un compte (#17022) — passent par
 * {@link cutTogetherWhere}, qui lit le relais du processus : la porte socket le partage dès
 * qu'elle sert (`shareTogetherCuts`), comme le registre de la file de rejeu.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getCacheStore } from '../CacheStore';
import type { Redis } from 'ioredis';
import { claimPairThroughCache, extendPairThroughCache, releasePairThroughCache, type PairClaim, type PairExtend, type PairRelease } from './togetherStore';
import { rejudgeTogetherWhere, type TogetherCutScope, type TogetherIo, type TogetherRelayDeps } from './togetherRelay';
import { enhancedLogger } from '../../utils/logger-enhanced';

/** Le cache du processus, résolu à l'usage : brancher une socket n'ouvre aucune connexion. */
const lazyCache: TogetherRelayDeps['cache'] = {
  get: (key) => getCacheStore().get(key),
  set: (key, value, ttlSeconds) => getCacheStore().set(key, value, ttlSeconds),
  del: (key) => getCacheStore().del(key),
};

/** Le client Redis natif PRÊT ; `null` sans Redis configuré ; LÈVE quand Redis est configuré mais mort. */
const readyClient = (): Redis | null => {
  const client = getCacheStore().getNativeClient();
  if (client) {
    if (client.status !== 'ready') throw new Error('together: Redis non prêt');
    return client;
  }
  if (process.env.REDIS_URL) throw new Error('together: Redis attendu pour l\'index de paire');
  return null;
};

/**
 * La prise de l'index de paire : `SET … EX … GET` du client Redis natif — atomique, et rend la
 * valeur remplacée. `CacheStore` bascule en mémoire locale quand Redis échoue (et garde un
 * client mort après abandon), ce qui ne vaut rien entre instances : ici l'écriture ÉCHOUE
 * (l'invitation rend « indisponible »). Sans Redis configuré (développement, test), un seul
 * processus : la prise passe par le cache.
 */
const claimPair: PairClaim = async (pairKey, sessionId, ttlSeconds) => {
  const client = readyClient();
  return client ? client.set(pairKey, sessionId, 'EX', ttlSeconds, 'GET') : claimPairThroughCache(lazyCache)(pairKey, sessionId, ttlSeconds);
};

const EXTEND_OR_RECREATE = `local held = redis.call('get', KEYS[1])
if held == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) end
if not held then return redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2], 'NX') and 1 or 0 end
return 0`;
const DELETE_IF_MINE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0`;

/** Prolonge l'index de paire s'il désigne encore la séance, le recrée s'il a expiré : un script Lua, donc atomique. */
const extendPair: PairExtend = async (pairKey, sessionId, ttlSeconds) => {
  const client = readyClient();
  if (!client) return extendPairThroughCache(lazyCache)(pairKey, sessionId, ttlSeconds);
  await client.eval(EXTEND_OR_RECREATE, 1, pairKey, sessionId, String(ttlSeconds));
};

/** Libère l'index de paire seulement s'il désigne encore la séance : un DEL gardé, atomique. */
const releasePair: PairRelease = async (pairKey, sessionId) => {
  const client = readyClient();
  if (!client) return releasePairThroughCache(lazyCache)(pairKey, sessionId);
  await client.eval(DELETE_IF_MINE, 1, pairKey, sessionId);
};

export function togetherRelayDepsOf(params: { readonly prisma: PrismaClient; readonly io: TogetherIo | undefined }): TogetherRelayDeps {
  return { prisma: params.prisma, cache: lazyCache, io: params.io, now: () => Date.now(), claimPair, extendPair, releasePair };
}

export async function rejudgeTogetherAfter(
  params: { readonly prisma: PrismaClient; readonly io: TogetherIo | undefined; readonly report: (error: unknown) => void },
  scope: TogetherCutScope,
): Promise<void> {
  try {
    await rejudgeTogetherWhere(togetherRelayDepsOf(params), scope);
  } catch (error) {
    params.report(error);
  }
}

type SharedTogether = { readonly prisma: PrismaClient; readonly io: TogetherIo };

let sharedTogether: SharedTogether | undefined;

/** Le relais du processus, posé par la porte socket ; `undefined` le retire (témoins). */
export function shareTogetherCuts(shared: SharedTogether | undefined): void {
  sharedTogether = shared;
}

/**
 * Rejuge les séances que ce geste vient de fermer, et les coupe chez les deux. NE REJETTE
 * JAMAIS : l'écriture de l'appelant est déjà commise. Sans relais dans ce processus, ne fait
 * rien — la synchronisation suivante rejuge la séance de toute façon.
 */
export async function cutTogetherWhere(scope: TogetherCutScope): Promise<void> {
  const shared = sharedTogether;
  if (!shared) return;
  const report = (error: unknown): void => {
    try {
      enhancedLogger.warn('[TogetherCuts] séance « ensemble » non rejugée', { error });
    } catch {
      /* le journal ne fait jamais échouer le geste de l'appelant */
    }
  };
  await rejudgeTogetherAfter({ ...shared, report }, scope);
}
