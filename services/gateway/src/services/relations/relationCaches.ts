/**
 * Un lien vient de changer : les deux caches d'amis — l'audience temps réel du
 * social (30 s, mémoire du process) et celle du fil (`feed:friends:`, 300 s) — ne
 * se rafraîchissent pas seuls (#13927). UN site pour tous ceux qui écrivent un
 * lien : l'acceptation, la rupture, la baisse, le rituel.
 */
import type { FastifyInstance } from 'fastify';
import { logError } from '../../utils/logger';
import { getCacheStore } from '../CacheStore';
import { invalidateFeedFriends } from '../posts/feedFriends';

export async function forgetFriends(fastify: FastifyInstance, ids: ReadonlyArray<string>): Promise<void> {
  ids.forEach((id) => fastify.socialEvents?.invalidateFriendsCache(id));
  try {
    await invalidateFeedFriends(getCacheStore(), ids);
  } catch (error) {
    logError(fastify.log, 'Error invalidating the feed friends cache:', error);
  }
}
