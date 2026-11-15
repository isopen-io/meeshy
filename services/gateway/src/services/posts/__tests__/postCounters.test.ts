/**
 * @jest-environment node
 *
 * #10402 — un compteur de lecture resté `null` reprend son compte.
 *
 * Le faux (`mongo-post-counter-store`) reproduit la loi que Prisma impose sur
 * MongoDB : `{ increment }` devient `$add`, et `null + n = null`. Les témoins
 * de bout en bout passent par les VRAIS sites d'appel (impressions, sessions
 * d'engagement, vues, ouvertures anonymes) : chacun rougit tant qu'un site
 * écrit encore par `{ increment }`.
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { incrementPostCounters, postCounterIncrementCommand } from '../postCounters';
import { creditPostView } from '../postViewCredit';
import { makeMongoPostCounterStore, type StoredPost } from '../../../__tests__/helpers/mongo-post-counter-store';
import { makeReachPrisma } from '../../../__tests__/helpers/reach-prisma';
import { PostService } from '../../PostService';
import { ingestSocialEvents, type SocialEventsDeps } from '../../../routes/social/events';

const POST_A = '507f1f77bcf86cd799439011';
const POST_B = '507f1f77bcf86cd799439012';

const NULL_COUNTERS = {
  impressionCount: null,
  postOpenCount: null,
  qualifiedViewCount: null,
  playCount: null,
  viewCount: null,
};

const legacyPost = (id: string, extra: Record<string, unknown> = {}): StoredPost =>
  ({ id, authorId: 'author', visibility: 'PUBLIC', visibilityUserIds: [], ...NULL_COUNTERS, ...extra });

const absentCountersPost = (id: string): StoredPost => ({ id, authorId: 'author', visibility: 'PUBLIC' });

describe('le faux reproduit la loi de Prisma sur MongoDB', () => {
  it('un `{ increment }` sur un compteur null le laisse null — la panne que ce lot ferme', async () => {
    const store = makeMongoPostCounterStore([legacyPost(POST_A)]);

    await store.updateMany({ where: { id: { in: [POST_A] } }, data: { impressionCount: { increment: 1 } } });

    expect(store.read(POST_A)?.impressionCount).toBeNull();
  });
});

describe('incrementPostCounters — un compteur null ou absent repart de zéro', () => {
  it('un compteur NULL passe à n', async () => {
    const store = makeMongoPostCounterStore([legacyPost(POST_A)]);

    await incrementPostCounters({ $runCommandRaw: store.runCommandRaw }, [POST_A], { impressionCount: { increment: 3 } });

    expect(store.read(POST_A)?.impressionCount).toBe(3);
  });

  it('un compteur ABSENT passe à n', async () => {
    const store = makeMongoPostCounterStore([absentCountersPost(POST_A)]);

    await incrementPostCounters({ $runCommandRaw: store.runCommandRaw }, [POST_A], { playCount: { increment: 1 } });

    expect(store.read(POST_A)?.playCount).toBe(1);
  });

  it('un compteur déjà compté s\'additionne, sur chaque post et chaque champ nommé', async () => {
    const store = makeMongoPostCounterStore([
      legacyPost(POST_A, { impressionCount: 4, postOpenCount: 2 }),
      legacyPost(POST_B),
    ]);

    await incrementPostCounters(
      { $runCommandRaw: store.runCommandRaw },
      [POST_A, POST_B],
      { impressionCount: { increment: 2 }, postOpenCount: { increment: 1 } },
    );

    expect(store.read(POST_A)).toMatchObject({ impressionCount: 6, postOpenCount: 3 });
    expect(store.read(POST_B)).toMatchObject({ impressionCount: 2, postOpenCount: 1 });
  });

  it('les parts anonymes (#10483) s\'incrémentent sur un post antérieur aux colonnes', async () => {
    const store = makeMongoPostCounterStore([absentCountersPost(POST_A)]);

    await incrementPostCounters(
      { $runCommandRaw: store.runCommandRaw },
      [POST_A],
      { viewCount: { increment: 1 }, anonymousViewCount: { increment: 1 }, anonymousImpressionCount: { increment: 2 } },
    );

    expect(store.read(POST_A)).toMatchObject({ viewCount: 1, anonymousViewCount: 1, anonymousImpressionCount: 2 });
  });

  it('`liveOnly` ne crédite pas un post supprimé', async () => {
    const store = makeMongoPostCounterStore([legacyPost(POST_A, { deletedAt: new Date() }), legacyPost(POST_B)]);

    await incrementPostCounters(
      { $runCommandRaw: store.runCommandRaw },
      [POST_A, POST_B],
      { impressionCount: { increment: 1 } },
      { liveOnly: true },
    );

    expect(store.read(POST_A)?.impressionCount).toBeNull();
    expect(store.read(POST_B)?.impressionCount).toBe(1);
  });

  it('n\'envoie rien sans id, sans incrément non nul, ni pour un champ qui n\'est pas un compteur de lecture', async () => {
    const runCommandRaw = jest.fn(async () => ({ ok: 1 }));

    await incrementPostCounters({ $runCommandRaw: runCommandRaw }, [], { viewCount: { increment: 1 } });
    await incrementPostCounters({ $runCommandRaw: runCommandRaw }, [POST_A], { viewCount: { increment: 0 } });
    await incrementPostCounters(
      { $runCommandRaw: runCommandRaw },
      [POST_A],
      { likeCount: { increment: 1 } } as never,
    );

    expect(runCommandRaw).not.toHaveBeenCalled();
    expect(postCounterIncrementCommand([POST_A], {})).toBeNull();
  });
});

describe('les sites d\'appel réels comptent un post antérieur aux colonnes', () => {
  it('une impression de DÉTAIL compte l\'impression ET l\'ouverture d\'un post aux compteurs null', async () => {
    const store = makeMongoPostCounterStore([legacyPost(POST_A)]);
    const prisma = {
      post: {
        findMany: async ({ where }: { where: { id: { in: string[] }; repostOfId?: unknown } }) =>
          where.repostOfId !== undefined ? [] : where.id.in.map((id) => ({ ...store.read(id), expiresAt: null })),
        updateMany: store.updateMany,
      },
      postImpression: { findFirst: async () => null, findMany: async () => [], deleteMany: async () => ({ count: 0 }), createMany: async () => ({ count: 1 }) },
      $runCommandRaw: store.runCommandRaw,
    } as unknown as PrismaClient;
    const deps = { fastify: {}, prisma, postService: {} } as unknown as SocialEventsDeps;

    await ingestSocialEvents(
      deps,
      [{ type: 'impression', postId: POST_A, source: 'detail' }],
      { kind: 'user', userId: 'reader', username: 'reader' },
    );

    expect(store.read(POST_A)).toMatchObject({ impressionCount: 1, postOpenCount: 1 });
  });

  it('une session d\'engagement de réel complète et qualifiée compte ouverture, lecture et vue qualifiée', async () => {
    const store = makeMongoPostCounterStore([absentCountersPost(POST_A)]);
    const prisma = {
      post: {
        findFirst: async () => ({ id: POST_A, authorId: 'author' }),
        update: store.update,
      },
      postEngagement: {
        findFirst: async () => null,
        findUnique: async () => null,
        upsert: async () => ({}),
      },
      $runCommandRaw: store.runCommandRaw,
    } as unknown as PrismaClient;

    const recorded = await new PostService(prisma).recordEngagementBatch([{
      sessionId: 's-1', postId: POST_A, contentType: 'REEL', surface: 'reels',
      startedAt: '2026-10-12T00:00:00.000Z', dwellMs: 9000, watchMs: 9000, completed: true,
    }], 'reader');

    expect(recorded).toBe(1);
    expect(store.read(POST_A)).toMatchObject({ postOpenCount: 1, playCount: 1, qualifiedViewCount: 1 });
  });

  it('la première vue d\'un lecteur compte sur un viewCount null', async () => {
    const store = makeMongoPostCounterStore([legacyPost(POST_A)]);
    const prisma = {
      post: { update: store.update },
      postView: { findUnique: async () => null, create: async () => ({}) },
      $runCommandRaw: store.runCommandRaw,
    } as unknown as PrismaClient;

    const isNew = await creditPostView(prisma, { postId: POST_A, userId: 'reader' });

    expect(isNew).toBe(true);
    expect(store.read(POST_A)?.viewCount).toBe(1);
  });

  it('une vue anonyme compte sur un viewCount et un postOpenCount null', async () => {
    const fake = makeReachPrisma([legacyPost(POST_A)]);

    const counted = await new PostService(fake.prisma as never).recordAnonymousView(POST_A, 'a'.repeat(64));

    expect(counted).toBe(true);
    expect(fake.store.read(POST_A)).toMatchObject({ viewCount: 1, postOpenCount: 1, anonymousViewCount: 1 });
  });
});

describe('les ventilations (#10483) — sous-documents { clé: n }', () => {
  it('une ventilation absente ou null repart de zéro, une clé existante s’additionne', async () => {
    const store = makeMongoPostCounterStore([
      absentCountersPost(POST_A),
      legacyPost(POST_B, { openCountByOrigin: null, viewCountByProvenance: { listing: 4 } }),
    ]);
    const prisma = { $runCommandRaw: store.runCommandRaw };

    await incrementPostCounters(prisma, [POST_A, POST_B], {
      viewCount: { increment: 1 },
      breakdowns: { openCountByOrigin: { feed: 2 }, viewCountByProvenance: { listing: 1, direct: 1 } },
    });

    expect(store.read(POST_A)).toMatchObject({
      viewCount: 1, openCountByOrigin: { feed: 2 }, viewCountByProvenance: { listing: 1, direct: 1 },
    });
    expect(store.read(POST_B)).toMatchObject({
      openCountByOrigin: { feed: 2 }, viewCountByProvenance: { listing: 5, direct: 1 },
    });
  });

  it('une clé qui n’est pas un mot simple (`$`, `.`) ou un champ inconnu ne part jamais', () => {
    const command = postCounterIncrementCommand([POST_A], {
      breakdowns: {
        openCountByOrigin: { '$where': 1, 'a.b': 1 },
        ...({ hackedField: { feed: 1 } } as Record<string, Record<string, number>>),
      },
    });

    expect(command).toBeNull();
  });
});
