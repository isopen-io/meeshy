/**
 * Tests — PostService.recordAnonymousView (#10483, ex `recordAnonymousOpen`).
 *
 * La vue d'un lecteur SANS compte, désigné par sa clé de lecteur HMAC : elle
 * entre dans `viewCount` une fois par lecteur, sous la garde de lecture
 * anonyme (`isServableToAnonymous`) ; une vue répétée ne monte que la durée.
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { PostService } from '../services/PostService';
import { makeReachPrisma, type ReachPost } from './helpers/reach-prisma';
import { readerKeyOf } from '../services/posts/readerKey';

const POST_A = '507f1f77bcf86cd799439011';
const ROOT = '507f1f77bcf86cd799439012';
const LECTEUR = readerKeyOf({ sessionToken: 'visitor_a' });
const AUTRE = readerKeyOf({ sessionToken: 'visitor_b' });

const service = (posts: readonly ReachPost[]) => {
  const fake = makeReachPrisma(posts);
  return { ...fake, svc: new PostService(fake.prisma as never) };
};

describe('PostService.recordAnonymousView', () => {
  it('la 1ʳᵉ vue d’un lecteur compte viewCount, anonymousViewCount et postOpenCount en une écriture', async () => {
    const h = service([{ id: POST_A }]);

    expect(await h.svc.recordAnonymousView(POST_A, LECTEUR)).toBe(true);
    expect(h.store.read(POST_A)).toMatchObject({ viewCount: 1, anonymousViewCount: 1, postOpenCount: 1 });
    expect(h.prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
  });

  it('une vue répétée du même lecteur compte au total, pas dans les uniques', async () => {
    const h = service([{ id: POST_A }]);
    await h.svc.recordAnonymousView(POST_A, LECTEUR);

    expect(await h.svc.recordAnonymousView(POST_A, LECTEUR)).toBe(true);
    expect(h.store.read(POST_A)).toMatchObject({
      viewCount: 2, anonymousViewCount: 2, postOpenCount: 2, uniqueViewCount: 1, anonymousUniqueViewCount: 1,
    });
  });

  it('deux lecteurs ⇒ +2', async () => {
    const h = service([{ id: POST_A }]);
    await h.svc.recordAnonymousView(POST_A, LECTEUR);
    await h.svc.recordAnonymousView(POST_A, AUTRE);

    expect(h.store.read(POST_A)).toMatchObject({ viewCount: 2, anonymousViewCount: 2 });
  });

  it('garde la durée la plus longue', async () => {
    const h = service([{ id: POST_A }]);
    await h.svc.recordAnonymousView(POST_A, LECTEUR, 3000);
    await h.svc.recordAnonymousView(POST_A, LECTEUR, 8000);
    await h.svc.recordAnonymousView(POST_A, LECTEUR, 1000);

    expect(h.opens).toEqual([expect.objectContaining({ postId: POST_A, sessionKey: LECTEUR, durationMs: 8000 })]);
  });

  it('crédite la racine d’un repost', async () => {
    const h = service([{ id: ROOT }, { id: POST_A, repostOfId: ROOT, originalRepostOfId: ROOT }]);
    await h.svc.recordAnonymousView(POST_A, LECTEUR);

    expect(h.store.read(ROOT)).toMatchObject({ viewCount: 1, anonymousViewCount: 1 });
  });

  it.each([
    ['réservé aux amis', { id: POST_A, visibility: 'FRIENDS' }],
    ['expiré', { id: POST_A, type: 'STORY', expiresAt: new Date(Date.now() - 1000) }],
    ['d’un auteur désactivé', { id: POST_A, author: { isActive: false, deletedAt: null, deactivatedAt: new Date() } }],
  ])('ne compte pas un post %s', async (_nom, post) => {
    const h = service([post]);

    expect(await h.svc.recordAnonymousView(POST_A, LECTEUR)).toBe(false);
    expect(h.writes).toEqual([]);
  });

  it('ne compte pas un post introuvable', async () => {
    const h = service([]);

    expect(await h.svc.recordAnonymousView(POST_A, LECTEUR)).toBe(false);
    expect(h.writes).toEqual([]);
  });
});
