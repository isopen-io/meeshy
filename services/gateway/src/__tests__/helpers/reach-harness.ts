/**
 * La VRAIE porte `POST /social/events` montée sur un Prisma en mémoire qui tient
 * la loi de MongoDB (`reach-prisma.ts`) — partagée par les témoins de portée
 * (#10483). La vue d'un compte passe par `creditPostView`, le crédit réel.
 */
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { makeReachPrisma, type ReachGuest, type ReachPost, type ReachWorld } from './reach-prisma';
import { registerSocialEventRoutes, type SocialEventsDeps } from '../../routes/social/events';
import { creditPostView } from '../../services/posts/postViewCredit';
import type { ViewContext } from '../../services/posts/viewProvenance';
import { resetCacheStore } from '../../services/CacheStore';

export const REACH_GUEST: ReachGuest = {
  id: '507f1f77bcf86cd7994390ee',
  sessionTokens: ['guest-token-iphone', 'guest-token-web'],
};

export type ReachHarness = ReturnType<typeof makeReachPrisma> & { app: FastifyInstance };

export async function reachHarness(
  posts: readonly ReachPost[],
  guests: readonly ReachGuest[] = [REACH_GUEST],
  world: ReachWorld = {},
): Promise<ReachHarness> {
  // Le registre des ouvertures (`viewOpenLedger`) vit dans le CacheStore : un
  // banc neuf repart d'un registre vide.
  resetCacheStore();
  const fake = makeReachPrisma(posts, guests, world);
  const app = Fastify({ logger: false });
  app.decorate('prisma', fake.prisma as never);

  // Le régime du VRAI middleware facultatif : un jeton porteur = un compte ; un
  // X-Session-Token d'invité = un participant ; tout autre jeton (clé visiteur)
  // retombe sur le contexte non authentifié.
  const optionalAuth = async (req: FastifyRequest) => {
    const bearer = req.headers.authorization?.replace('Bearer ', '');
    const token = req.headers['x-session-token'] as string | undefined;
    const guest = guests.find((g) => token !== undefined && g.sessionTokens.includes(token));
    (req as unknown as { authContext: unknown }).authContext = bearer
      ? { type: 'user', isAuthenticated: true, isAnonymous: false, userId: bearer, registeredUser: { id: bearer, username: 'reader' } }
      : guest
        ? { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: guest.id, participantId: guest.id, sessionToken: token }
        : { type: 'anonymous', isAuthenticated: false, isAnonymous: true, userId: 'anonymous' };
  };

  const postService = {
    recordView: async (postId: string, userId: string, durationMs?: number, context: ViewContext = {}) =>
      creditPostView(fake.prisma as never, { postId, userId, durationMs, ...context }),
    getPostById: async () => null,
    recordMediaDownloads: async () => null,
    recordEngagementBatch: async () => 0,
  } as unknown as SocialEventsDeps['postService'];

  registerSocialEventRoutes(app, fake.prisma as never, optionalAuth, postService);
  await app.ready();
  return { ...fake, app };
}

export const sendReach = (app: FastifyInstance, events: unknown[], headers: Record<string, string>, ip = '203.0.113.7') =>
  app.inject({ method: 'POST', url: '/social/events', headers, payload: { events }, remoteAddress: ip });

/** Un lot v2 : événements ET contexte de lot (#10499). */
export const sendReachV2 = (
  app: FastifyInstance,
  events: unknown[],
  headers: Record<string, string>,
  context?: Record<string, unknown>,
) => app.inject({ method: 'POST', url: '/social/events', headers, payload: { events, ...(context ? { context } : {}) } });

export const visitorHeader = (n: number | string) =>
  ({ 'x-session-token': `visitor_00000000-0000-4000-8000-${String(n).padStart(12, '0')}` });

export const viewEvent = (postId: string, extra: Record<string, unknown> = {}) => ({ type: 'view', postId, ...extra });
export const impressionEvent = (postId: string, extra: Record<string, unknown> = {}) => ({ type: 'impression', postId, ...extra });
