/**
 * #20204 — LA FICHE D'UN POST TAIT CE QUI VOYAGE AVEC LUI.
 *
 * #16894 a fait retirer, par les dix portes de LISTE, la source d'une
 * republication et les commentaires en aperçu d'un auteur qu'un blocage sépare
 * du lecteur. `GET /posts/:postId` — la porte UNITAIRE, celle que le tap sur
 * une carte ouvre — servait les deux : un commentaire retiré du fil revenait
 * entier dès qu'on ouvrait la publication qui le porte en aperçu.
 *
 * Le témoin passe par `app.inject()`, donc par la SÉRIALISATION : c'est la
 * seule place d'où l'on voit ce qui sort (`services/gateway/CLAUDE.md`
 * § « un témoin de confidentialité assert sur la VALEUR SERVIE »).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const mockGetPostById = jest.fn<(postId: string, viewerId?: string) => Promise<Record<string, unknown> | null>>();

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    getPostById: (postId: string, viewerId?: string) => mockGetPostById(postId, viewerId),
  })),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn(), translateOnDemand: jest.fn() } },
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn(),
  MentionService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn().mockReturnValue({}),
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ getNativeClient: () => ({ incr: async () => 1, pexpire: async () => 1, pttl: async () => -1 }) }),
}));

import { registerCoreRoutes } from '../../../../routes/posts/core';

const POST_ID = '507f1f77bcf86cd799439022';
const VIEWER = '507f1f77bcf86cd799439011';
const AUTHOR = '507f1f77bcf86cd799439002';
/** Celui que le lecteur a bloqué. */
const BLOCKED = '507f1f77bcf86cd799439003';
/** Celui qui a bloqué le lecteur — l'autre sens, que le dépôt garde aussi. */
const BLOCKER = '507f1f77bcf86cd799439004';

const person = (id: string) => ({ id, username: `u${id.slice(-2)}`, displayName: null, avatar: null });

const servedPost = () => ({
  id: POST_ID,
  type: 'POST',
  visibility: 'PUBLIC',
  content: 'Bonjour',
  authorId: AUTHOR,
  author: person(AUTHOR),
  comments: [
    { id: 'c-ok', content: 'bonjour', author: person(AUTHOR) },
    { id: 'c-blocked', content: 'du compte que j’ai bloqué', author: person(BLOCKED) },
    { id: 'c-blocker', content: 'du compte qui m’a bloqué', author: person(BLOCKER) },
  ],
  repostOf: { id: 'src-1', content: 'source séparée', author: person(BLOCKER), postMentions: [] },
});

type Blocks = { readonly blockedByViewer: readonly string[]; readonly blockers: readonly string[] };

async function buildApp(blocks: Blocks, opts: { readonly blocksRead?: 'ok' | 'throws' } = {}) {
  const app = Fastify({ logger: false });
  const findUnique = jest.fn<any>(async () => ({ blockedUserIds: [...blocks.blockedByViewer] }));
  if (opts.blocksRead === 'throws') findUnique.mockRejectedValue(new Error('mongo down'));
  const prisma = {
    post: { findFirst: jest.fn<any>(async () => null) },
    user: {
      findUnique,
      findMany: jest.fn<any>(async () => blocks.blockers.map((id) => ({ id }))),
    },
  } as unknown as Parameters<typeof registerCoreRoutes>[1];
  const auth = async (req: FastifyRequest) => {
    (req as unknown as { authContext: unknown }).authContext = {
      isAuthenticated: true,
      type: 'jwt',
      registeredUser: { id: VIEWER, role: 'USER', emailVerifiedAt: new Date() },
    };
  };
  app.decorate('notificationService', {} as never);
  registerCoreRoutes(app, prisma, auth, auth);
  await app.ready();
  return { app, findUnique };
}

const openDetail = (app: FastifyInstance) => app.inject({ method: 'GET', url: `/posts/${POST_ID}` });

beforeEach(() => {
  mockGetPostById.mockReset();
  mockGetPostById.mockResolvedValue(servedPost());
});

describe('#20204 — GET /posts/:postId et ce qui voyage avec le post', () => {
  it('retire la source republiée d’un auteur séparé, et ses commentaires de l’aperçu', async () => {
    const { app } = await buildApp({ blockedByViewer: [BLOCKED], blockers: [BLOCKER] });

    const res = await openDetail(app);

    expect(res.statusCode).toBe(200);
    const served = res.json().data as { repostOf: unknown; comments: ReadonlyArray<{ id: string }> };
    expect(served.repostOf).toBeNull();
    expect(served.comments.map((c) => c.id)).toEqual(['c-ok']);
    expect(res.body).not.toContain('source séparée');
    expect(res.body).not.toContain('que j’ai bloqué');
    expect(res.body).not.toContain('qui m’a bloqué');
    await app.close();
  });

  it('sans aucun blocage, la fiche sert tout — témoin de NON-RÉGRESSION', async () => {
    const { app } = await buildApp({ blockedByViewer: [], blockers: [] });

    const served = (await openDetail(app)).json().data as { repostOf: { id: string } | null; comments: ReadonlyArray<{ id: string }> };

    expect(served.repostOf?.id).toBe('src-1');
    expect(served.comments.map((c) => c.id)).toEqual(['c-ok', 'c-blocked', 'c-blocker']);
    await app.close();
  });

  it('ne lit les blocages qu’UNE fois par ouverture', async () => {
    const { app, findUnique } = await buildApp({ blockedByViewer: [BLOCKED], blockers: [] });

    await openDetail(app);

    expect(findUnique).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('FERMÉ : une lecture des blocages qui lève ne sert pas la fiche', async () => {
    const { app } = await buildApp({ blockedByViewer: [], blockers: [] }, { blocksRead: 'throws' });

    const res = await openDetail(app);

    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('source séparée');
    await app.close();
  });
});
