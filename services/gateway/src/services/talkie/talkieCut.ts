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

/**
 * Tous les sens d'abord coupés SUR CETTE INSTANCE, puis chaque coupure partagée écrite :
 * une écriture qui échoue n'empêche ni la coupure locale ni l'écriture d'un autre sens,
 * et l'échec remonte à l'appelant une fois tout tenté (#14490).
 */
async function cutDirections(deps: TalkieCutDeps, directions: ReadonlyArray<readonly [string, string]>): Promise<void> {
  const at = String(deps.now());
  directions.forEach(([fromUserId, toUserId]) => deps.relay?.cutPair(fromUserId, toUserId));
  const writes = await Promise.allSettled(directions.map(([fromUserId, toUserId]) => deps.cache.set(cutKey(fromUserId, toUserId), at, CUT_TTL_SECONDS)));
  const failed = writes.find((write): write is PromiseRejectedResult => write.status === 'rejected');
  if (failed) throw failed.reason;
}

export async function cutTalkiesOnBlock(
  deps: TalkieCutDeps,
  params: { readonly blockerId: string; readonly blockedId: string; readonly scope: 'user' | 'talkie' },
): Promise<void> {
  const { blockerId, blockedId, scope } = params;
  const directions: ReadonlyArray<readonly [string, string]> = scope === 'talkie'
    ? [[blockedId, blockerId]]
    : [[blockedId, blockerId], [blockerId, blockedId]];
  await cutDirections(deps, directions);
}

/**
 * Le passage d'un tête-à-tête en chiffrement de bout en bout (#14490) : le talkie y
 * devient indisponible (`TALKIE_E2EE_CONVERSATION`), et la voix en clair déjà ouverte
 * s'arrête À L'INSTANT, dans les deux sens, par la même coupure partagée qu'un blocage —
 * sans attendre le rejugement d'arrière-plan. Une voix scellée n'est en principe pas ouverte
 * à cet instant (un sceau sans paire chiffrée est refusé, et une paire n'a qu'un seul
 * tête-à-tête chiffré, #12966) ; la porte et la règle de la paire ne jugent toutefois pas
 * « chiffrée » de la même façon (un tête-à-tête obsolète, #14643), et une voix scellée peut
 * alors être coupée une fois à tort — fail-closed, elle se rouvre. Rien n'est posé hors
 * d'un tête-à-tête de deux comptes distincts.
 */
export async function cutTalkiesOnEndToEnd(
  deps: TalkieCutDeps,
  params: { readonly userIds: ReadonlyArray<string | null | undefined> },
): Promise<void> {
  const [userId, peerId] = params.userIds;
  if (params.userIds.length !== 2 || !userId || !peerId || userId.toLowerCase() === peerId.toLowerCase()) return;
  await cutDirections(deps, [[userId, peerId], [peerId, userId]]);
}
