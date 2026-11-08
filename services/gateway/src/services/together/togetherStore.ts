/**
 * L'ÉTAT D'UNE SÉANCE « ENSEMBLE » (#17012) — scellé au repos, durée de vie courte.
 *
 * Deux clés (et une pierre tombale) : la séance (`together:session:<id>`), SCELLÉE par `secret-at-rest` et liée à
 * son identifiant comme données authentifiées (une valeur recopiée sous la clé d'une autre
 * séance ne s'ouvre pas) ; et l'index de la paire (`together:pair:<HMAC de la paire>`) qui ne
 * porte que l'identifiant aléatoire de sa séance courante — une séance par paire.
 *
 * Rien n'est gardé au-delà de la séance : la durée de vie suit l'état (invitation courte,
 * séance prolongée à chaque synchronisation), et la fin efface les deux clés. Une valeur
 * illisible, expirée ou scellée pour une autre séance vaut « rien ».
 */
import { TOGETHER_MEDIA_KINDS, TOGETHER_SESSION_TTL_SECONDS, type TogetherMediaKind, type TogetherPlayback } from '@meeshy/shared/types/together';
import { createHash, createHmac } from 'node:crypto';
import type { CacheStore } from '../CacheStore';
import { SECRETS_AT_REST_KEY_ENV, hasValidSecretsKey, isSealedSecret, openSecret, sealSecret } from '../../utils/secret-at-rest';

export type TogetherSession = {
  readonly sessionId: string;
  readonly hostId: string;
  readonly guestId: string;
  readonly conversationId: string;
  readonly attachmentId: string;
  readonly media: TogetherMediaKind;
  readonly joined: boolean;
  readonly playback: TogetherPlayback;
  /** Horloge du serveur (ms epoch) à l'invitation : le plafond de durée se compte d'ici, jamais d'une synchronisation. */
  readonly createdAt: number;
  readonly expiresAt: number;
};

export type TogetherCache = Pick<CacheStore, 'get' | 'set' | 'del'>;

const sessionKey = (sessionId: string): string => `together:session:${sessionId}`;
const contextOf = (sessionId: string): string => `Together.session:${sessionId}`;

const endedKey = (sessionId: string): string => `together:ended:${sessionId}`;

/**
 * L'index d'une paire ne dit pas QUI : son nom est un HMAC de la paire, à la clé de
 * scellement (séparée par son domaine). Sans clé — développement et test seulement, où
 * le scellement range aussi en clair — une empreinte SHA-256.
 */
export const togetherPairKey = (a: string, b: string): string => {
  const [low, high] = [a.toLowerCase(), b.toLowerCase()].sort();
  const material = `Together.pair:${low}:${high}`;
  const key = hasValidSecretsKey() ? process.env[SECRETS_AT_REST_KEY_ENV]?.trim() : undefined;
  const digest = key ? createHmac('sha256', Buffer.from(key, 'base64')).update(material) : createHash('sha256').update(material);
  return `together:pair:${digest.digest('hex')}`;
};

/** L'index d'un compte (ses séances en cours, pour les couper à sa déconnexion) : même discrétion que l'index de paire. */
export const togetherUserKey = (userId: string): string => {
  const material = `Together.user:${userId.toLowerCase()}`;
  const key = hasValidSecretsKey() ? process.env[SECRETS_AT_REST_KEY_ENV]?.trim() : undefined;
  const digest = key ? createHmac('sha256', Buffer.from(key, 'base64')).update(material) : createHash('sha256').update(material);
  return `together:user:${digest.digest('hex')}`;
};

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

function parsePlayback(value: unknown): TogetherPlayback | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.playing !== 'boolean' || !isCount(row.positionMs) || !isCount(row.at) || !isCount(row.rev) || !isText(row.byUserId)) return null;
  return { playing: row.playing, positionMs: row.positionMs, at: row.at, rev: row.rev, byUserId: row.byUserId };
}

function parseSession(raw: string, sessionId: string): TogetherSession | null {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const playback = parsePlayback(row.playback);
  const media = TOGETHER_MEDIA_KINDS.find((kind) => kind === row.media);
  const texts = [row.hostId, row.guestId, row.conversationId, row.attachmentId];
  if (row.sessionId !== sessionId || !playback || !media || !texts.every(isText) || typeof row.joined !== 'boolean' || !isCount(row.createdAt) || !isCount(row.expiresAt)) {
    return null;
  }
  return {
    sessionId,
    hostId: row.hostId as string,
    guestId: row.guestId as string,
    conversationId: row.conversationId as string,
    attachmentId: row.attachmentId as string,
    media,
    joined: row.joined,
    playback,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

/**
 * Range la séance scellée. L'index de la paire n'y est JAMAIS écrit : il se prend d'un geste
 * atomique ({@link PairClaim}) et ne se prolonge que s'il désigne encore cette séance
 * ({@link PairExtend}) — une écriture en vol ne peut pas reprendre l'index d'une invitation
 * plus récente. Sans clé de scellement dans un environnement servi, LÈVE.
 */
export async function storeTogether(cache: TogetherCache, session: TogetherSession, ttlSeconds: number): Promise<void> {
  const sealed = sealSecret(JSON.stringify(session), contextOf(session.sessionId));
  await cache.set(sessionKey(session.sessionId), sealed, ttlSeconds);
}

/**
 * Prend l'index d'une paire d'un seul geste ATOMIQUE et rend l'identifiant qu'il portait
 * (`null` : aucun) — deux invitations simultanées ne peuvent pas toutes deux croire l'index
 * vide. En production c'est `SET … EX … GET` sur le client Redis natif (`togetherDeps.ts`),
 * qui ÉCHOUE plutôt que de basculer en mémoire locale : une prise locale ne vaut rien entre
 * instances.
 */
export type PairClaim = (pairKey: string, sessionId: string, ttlSeconds: number) => Promise<string | null>;

/**
 * Prolonge l'index d'une paire SI ET SEULEMENT SI il désigne encore `sessionId` (en production,
 * `EXPIRE` gardé par un script Lua sur le client Redis natif) ; sinon ne fait rien.
 */
export type PairExtend = (pairKey: string, sessionId: string, ttlSeconds: number) => Promise<void>;

let exclusiveChain: Promise<unknown> = Promise.resolve();
/** Sérialise, dans CE processus, une lecture-puis-écriture du cache (sans Redis : un seul processus). */
const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
  const run = exclusiveChain.then(task, task);
  exclusiveChain = run.catch(() => undefined);
  return run;
};

/** La prise pour un cache sans commande atomique (développement et test, un seul processus). */
export const claimPairThroughCache =
  (cache: TogetherCache): PairClaim =>
  (pairKey, sessionId, ttlSeconds) =>
    exclusive(async () => {
      const previous = await cache.get(pairKey);
      await cache.set(pairKey, sessionId, ttlSeconds);
      return previous;
    });

/** La prolongation pour un cache sans commande atomique (développement et test, un seul processus). */
export const extendPairThroughCache =
  (cache: TogetherCache): PairExtend =>
  (pairKey, sessionId, ttlSeconds) =>
    exclusive(async () => {
      if ((await cache.get(pairKey)) === sessionId) await cache.set(pairKey, sessionId, ttlSeconds);
    });

const parseIds = (raw: string | null): readonly string[] => {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isText) : [];
  } catch {
    return [];
  }
};

const USER_INDEX_MAX = 20;

/** Inscrit la séance à l'index de ses deux comptes : de quoi la couper quand l'un d'eux disparaît. */
export async function indexTogetherUsers(cache: TogetherCache, session: TogetherSession, ttlSeconds: number): Promise<void> {
  await Promise.all(
    [session.hostId, session.guestId].map((userId) =>
      exclusive(async () => {
        const key = togetherUserKey(userId);
        const ids = parseIds(await cache.get(key)).filter((id) => id !== session.sessionId);
        await cache.set(key, JSON.stringify([...ids, session.sessionId].slice(-USER_INDEX_MAX)), ttlSeconds);
      }),
    ),
  );
}

const unindexTogetherUser = (cache: TogetherCache, userId: string, sessionId: string): Promise<void> =>
  exclusive(async () => {
    const key = togetherUserKey(userId);
    const kept = parseIds(await cache.get(key)).filter((id) => id !== sessionId);
    if (kept.length === 0) await cache.del(key);
    else await cache.set(key, JSON.stringify(kept), TOGETHER_SESSION_TTL_SECONDS);
  });

/** Les séances en cours d'un compte (invitations comprises) ; une entrée expirée ne compte pas. */
export async function readUserTogether(cache: TogetherCache, userId: string, now: number): Promise<readonly TogetherSession[]> {
  const sessions = await Promise.all(parseIds(await cache.get(togetherUserKey(userId))).map((id) => readTogether(cache, id, now)));
  return sessions.filter((session): session is TogetherSession => session !== null);
}

/** La séance, ou `null` (absente, expirée, illisible, scellée pour une autre). */
export async function readTogether(cache: TogetherCache, sessionId: string, now: number): Promise<TogetherSession | null> {
  const stored = await cache.get(sessionKey(sessionId));
  // Une séance naît scellée : une valeur en clair n'est jamais lue quand la clé est posée.
  if (stored === null || (hasValidSecretsKey() && !isSealedSecret(stored))) return null;
  try {
    const session = parseSession(openSecret(stored, contextOf(sessionId)), sessionId);
    return session && session.expiresAt > now ? session : null;
  } catch {
    return null;
  }
}

/** La séance courante d'une paire, ou `null`. */
export async function readPairTogether(cache: TogetherCache, a: string, b: string, now: number): Promise<TogetherSession | null> {
  const sessionId = await cache.get(togetherPairKey(a, b));
  return sessionId ? readTogether(cache, sessionId, now) : null;
}

/**
 * La PIERRE TOMBALE d'une séance finie : posée AVANT l'effacement, relue APRÈS chaque
 * écriture. Une acceptation ou une synchronisation qui a été jugée avant une coupure et
 * écrit après elle voit la pierre, efface ce qu'elle vient d'écrire et n'émet rien.
 */
export async function markTogetherEnded(cache: TogetherCache, sessionId: string, ttlSeconds: number): Promise<void> {
  await cache.set(endedKey(sessionId), '1', ttlSeconds);
}

export async function isTogetherEnded(cache: TogetherCache, sessionId: string): Promise<boolean> {
  return (await cache.get(endedKey(sessionId))) !== null;
}

/** Efface la séance, et l'index de la paire s'il la désigne encore. */
export async function clearTogether(cache: TogetherCache, session: TogetherSession): Promise<void> {
  const pair = togetherPairKey(session.hostId, session.guestId);
  if ((await cache.get(pair)) === session.sessionId) await cache.del(pair);
  await cache.del(sessionKey(session.sessionId));
  await Promise.all([session.hostId, session.guestId].map((userId) => unindexTogetherUser(cache, userId, session.sessionId)));
}
