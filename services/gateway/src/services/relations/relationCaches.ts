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
import { teamAccountIds } from './teamPeers';

export async function forgetFriends(fastify: FastifyInstance, ids: ReadonlyArray<string>): Promise<void> {
  ids.forEach((id) => fastify.socialEvents?.invalidateFriendsCache(id));
  try {
    await invalidateFeedFriends(getCacheStore(), ids);
  } catch (error) {
    logError(fastify.log, 'Error invalidating the feed friends cache:', error);
  }
}

/**
 * Le rôle ou l'état d'un compte vient de changer (#16623, audit du 2026-11-08) : les
 * cercles de l'équipe rangent ses collègues sans lien, au fil (5 min) comme au temps réel
 * (30 s). On oublie les siens et ceux de chaque compte de l'équipe, pour qu'un modérateur
 * rétrogradé ne lise plus, même une minute, les publications Proches et Sang de ses
 * ex-collègues. Une lecture de l'équipe qui échoue oublie au moins le compte lui-même.
 */
export async function forgetTeamCircles(fastify: FastifyInstance, userId: string): Promise<void> {
  const colleagues = await teamAccountIds(fastify.prisma).catch((error: unknown) => {
    logError(fastify.log, 'Error reading the team accounts to forget their circles:', error);
    return [] as readonly string[];
  });
  await forgetFriends(fastify, [...new Set([userId, ...colleagues])]);
}
