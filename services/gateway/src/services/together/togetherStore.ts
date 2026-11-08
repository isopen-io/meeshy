/**
 * L'ÉTAT D'UNE SÉANCE « ENSEMBLE » (#17012) — scellé au repos, durée de vie courte.
 *
 * Deux clés : la séance (`together:session:<id>`), SCELLÉE par `secret-at-rest` et liée à
 * son identifiant comme données authentifiées (une valeur recopiée sous la clé d'une autre
 * séance ne s'ouvre pas) ; et l'index de la paire (`together:pair:<bas>:<haut>`) qui ne
 * porte que l'identifiant aléatoire de sa séance courante — une séance par paire.
 *
 * Rien n'est gardé au-delà de la séance : la durée de vie suit l'état (invitation courte,
 * séance prolongée à chaque synchronisation), et la fin efface les deux clés. Une valeur
 * illisible, expirée ou scellée pour une autre séance vaut « rien ».
 */
import { TOGETHER_MEDIA_KINDS, type TogetherMediaKind, type TogetherPlayback } from '@meeshy/shared/types/together';
import type { CacheStore } from '../CacheStore';
import { openSecret, sealSecret } from '../../utils/secret-at-rest';

export type TogetherSession = {
  readonly sessionId: string;
  readonly hostId: string;
  readonly guestId: string;
  readonly conversationId: string;
  readonly attachmentId: string;
  readonly media: TogetherMediaKind;
  readonly joined: boolean;
  readonly playback: TogetherPlayback;
  readonly expiresAt: number;
};

export type TogetherCache = Pick<CacheStore, 'get' | 'set' | 'del'>;

const sessionKey = (sessionId: string): string => `together:session:${sessionId}`;
const contextOf = (sessionId: string): string => `Together.session:${sessionId}`;

export const togetherPairKey = (a: string, b: string): string => {
  const [low, high] = [a.toLowerCase(), b.toLowerCase()].sort();
  return `together:pair:${low}:${high}`;
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
  if (row.sessionId !== sessionId || !playback || !media || !texts.every(isText) || typeof row.joined !== 'boolean' || !isCount(row.expiresAt)) {
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
    expiresAt: row.expiresAt,
  };
}

/** Range la séance scellée et son index de paire. Sans clé de scellement dans un environnement servi, LÈVE. */
export async function storeTogether(cache: TogetherCache, session: TogetherSession, ttlSeconds: number): Promise<void> {
  const sealed = sealSecret(JSON.stringify(session), contextOf(session.sessionId));
  await cache.set(togetherPairKey(session.hostId, session.guestId), session.sessionId, ttlSeconds);
  await cache.set(sessionKey(session.sessionId), sealed, ttlSeconds);
}

/** La séance, ou `null` (absente, expirée, illisible, scellée pour une autre). */
export async function readTogether(cache: TogetherCache, sessionId: string, now: number): Promise<TogetherSession | null> {
  const stored = await cache.get(sessionKey(sessionId));
  if (stored === null) return null;
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

/** Efface la séance, et l'index de la paire s'il la désigne encore. */
export async function clearTogether(cache: TogetherCache, session: TogetherSession): Promise<void> {
  const pair = togetherPairKey(session.hostId, session.guestId);
  if ((await cache.get(pair)) === session.sessionId) await cache.del(pair);
  await cache.del(sessionKey(session.sessionId));
}
