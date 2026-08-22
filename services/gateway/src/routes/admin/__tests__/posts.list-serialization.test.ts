/**
 * `GET /admin/posts` — ce que la fiche utilisateur de la console REÇOIT
 * VRAIMENT.
 *
 * Même défaut que `admin/content.ts` — `data: { type: 'array', items: { type:
 * 'object' } }` vide chaque élément — mais ici l'appelant est CORRECT :
 * `UserPostsSection` lit `resp.data?.data`, l'idiome juste. Le résultat n'est
 * donc pas une liste vide : c'est une liste PLEINE de cartes muettes, une par
 * post, toutes sans auteur, sans contenu, sans média et sans compteur. La
 * pagination et le total sont exacts.
 *
 * Cette route est la preuve que les deux défauts de la famille sont
 * INDÉPENDANTS : celui du sérialiseur frappe même un client irréprochable.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { adminPostRoutes } from '../posts';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const POST_ID = '507f1f77bcf86cd799439041';

const postFindMany = jest.fn<any>();
const postCount = jest.fn<any>();

const mockPrisma = {
  post: { findMany: postFindMany, count: postCount },
} as any;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: { id: ADMIN_ID, role: 'ADMIN' },
    };
  });
  app.register(adminPostRoutes);
  await app.ready();
  return app;
}

function moderatedPost() {
  return {
    id: POST_ID,
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Un post que la modération inspecte',
    originalLanguage: 'fr',
    communityId: '507f1f77bcf86cd799439042',
    moodEmoji: '🎉',
    isPinned: false,
    isEdited: true,
    deletedAt: null,
    expiresAt: null,
    likeCount: 12,
    commentCount: 3,
    repostCount: 1,
    viewCount: 200,
    bookmarkCount: 5,
    shareCount: 2,
    createdAt: new Date('2026-08-20T08:00:00.000Z'),
    updatedAt: new Date('2026-08-21T08:00:00.000Z'),
    author: {
      id: '507f1f77bcf86cd799439043',
      username: 'carol',
      displayName: 'Carol Nguyen',
      avatar: 'https://cdn.meeshy.me/c.png',
    },
    media: [
      {
        id: '507f1f77bcf86cd799439044',
        url: 'https://cdn.meeshy.me/m.jpg',
        mimeType: 'image/jpeg',
      },
    ],
    _count: { comments: 3, views: 200, bookmarks: 5 },
  };
}

describe('GET /admin/posts — la liste servie à la fiche utilisateur', () => {
  beforeEach(() => {
    postFindMany.mockReset().mockResolvedValue([moderatedPost()]);
    postCount.mockReset().mockResolvedValue(1);
  });

  it('sert le post avec son contenu et son type, et non un objet vide', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/posts' });

    expect(res.statusCode).toBe(200);
    const [served] = res.json().data;
    expect(served).toMatchObject({
      id: POST_ID,
      type: 'POST',
      visibility: 'PUBLIC',
      content: 'Un post que la modération inspecte',
      originalLanguage: 'fr',
      isPinned: false,
      isEdited: true,
    });
    await app.close();
  });

  it("sert l'auteur — sans lui la carte de modération ne désigne personne", async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/posts' });

    const [served] = res.json().data;
    expect(served.author).toMatchObject({
      id: '507f1f77bcf86cd799439043',
      username: 'carol',
      displayName: 'Carol Nguyen',
    });
    await app.close();
  });

  it("sert les compteurs d'engagement et les médias attachés", async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/posts' });

    const [served] = res.json().data;
    expect(served).toMatchObject({
      likeCount: 12,
      commentCount: 3,
      viewCount: 200,
      bookmarkCount: 5,
      shareCount: 2,
    });
    expect(served.media).toHaveLength(1);
    expect(served.media[0]).toMatchObject({ mimeType: 'image/jpeg' });
    expect(served._count).toEqual({ comments: 3, views: 200, bookmarks: 5 });
    await app.close();
  });
});
