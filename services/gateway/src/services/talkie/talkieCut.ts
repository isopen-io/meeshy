/**
 * LA COUPURE du talkie (#13935) — un blocage (de l'utilisateur, ou de la
 * réception directe de son talkie) coupe la voix IMMÉDIATEMENT, sockets en vol
 * compris.
 *
 * Une prise de parole vit sur l'instance qui porte la socket de son émetteur ; le
 * blocage peut arriver sur n'importe quelle autre. La coupure s'écrit donc dans
 * le cache partagé (`talkie:cut:<de>:<vers>` = l'instant de la coupure, durée de
 * vie = une prise de parole et sa marge), que chaque fragment relit avant de
 * repartir ; l'instance qui reçoit le blocage coupe aussi, tout de suite, ce
 * qu'elle porte elle-même. Une prise de parole ouverte APRÈS la coupure (un
 * déblocage, puis une nouvelle voix) n'est pas visée : seul l'instant compte.
 */
import { TALKIE_JOIN_WINDOW_MS, TALKIE_MAX_DURATION_MS } from '@meeshy/shared/types/talkie';
import { getCacheStore, type CacheStore } from '../CacheStore';
import type { TalkieRelay } from './talkieRelay';

/** Une voix réveillée reste rejoignable la fenêtre de rattrapage après sa fin (#17142) : la coupure vit aussi longtemps. */
const CUT_TTL_SECONDS = Math.ceil((TALKIE_MAX_DURATION_MS + TALKIE_JOIN_WINDOW_MS) / 1000) + 5;
/** Casse libre d'un ObjectId : la clé est toujours en minuscules, qui qu'ait écrit l'identifiant. */
const cutKey = (fromUserId: string, toUserId: string) => `talkie:cut:${fromUserId.toLowerCase()}:${toUserId.toLowerCase()}`;

export type TalkieCutDeps = {
  readonly cache: Pick<CacheStore, 'get' | 'set'>;
  readonly relay: TalkieRelay | null;
  readonly now: () => number;
};

let processRelay: TalkieRelay | null = null;

/** Le relais de CE processus, posé par le gestionnaire de sockets (`TalkieHandler.ts`). */
export const registerProcessTalkieRelay = (relay: TalkieRelay | null): void => {
  processRelay = relay;
};

/** Le relais de ce processus, ou `null` tant que les sockets ne sont pas montées (la lecture de la voix gardée, #17142). */
export const processTalkieRelay = (): TalkieRelay | null => processRelay;

export const talkieCutDepsOf = (): TalkieCutDeps => ({
  cache: getCacheStore(),
  relay: processRelay,
  now: () => Date.now(),
});

/**
 * L'instant de la dernière coupure de la paire, ou `null`. Quand un cache PARTAGÉ est
 * attendu (`requireShared` : Redis configuré) mais injoignable, la lecture LÈVE — le
 * repli mémoire d'une instance ne voit pas la coupure posée par une autre, et la voix
 * d'une personne bloquée ne repart pas sur ce doute.
 */
export async function readTalkieCut(
  cache: Pick<CacheStore, 'get' | 'isAvailable'>,
  fromUserId: string,
  toUserId: string,
  options: { readonly requireShared: boolean } = { requireShared: false },
): Promise<number | null> {
  if (options.requireShared && !cache.isAvailable()) throw new Error('talkie cut store unavailable');
  const raw = await cache.get(cutKey(fromUserId, toUserId));
  const at = raw === null ? NaN : Number(raw);
  return Number.isFinite(at) ? at : null;
}

export async function cutTalkiesOnBlock(
  deps: TalkieCutDeps,
  params: { readonly blockerId: string; readonly blockedId: string; readonly scope: 'user' | 'talkie' },
): Promise<void> {
  const { blockerId, blockedId, scope } = params;
  const directions: ReadonlyArray<readonly [string, string]> = scope === 'talkie'
    ? [[blockedId, blockerId]]
    : [[blockedId, blockerId], [blockerId, blockedId]];
  const at = String(deps.now());
  for (const [fromUserId, toUserId] of directions) {
    deps.relay?.cutPair(fromUserId, toUserId);
    await deps.cache.set(cutKey(fromUserId, toUserId), at, CUT_TTL_SECONDS);
  }
}
