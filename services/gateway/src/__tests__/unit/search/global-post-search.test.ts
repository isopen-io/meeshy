/**
 * #14620 — `GET /posts/search` : la recherche générale trouve les posts, réels
 * et stories que le lecteur a le droit de voir, par la loi d'audience du FIL
 * (`buildFeedVisibilityFilter`, réelle ici) évaluée sur une base en mémoire.
 * Seules les LECTURES du graphe social (amis, contacts, cercles, blocages)
 * sont fournies par le témoin.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const READER = '650000000000000000000001';
const FRIEND = '650000000000000000000002';
const STRANGER = '650000000000000000000003';
const BLOCKED = '650000000000000000000004';
const CLOSE = '650000000000000000000005';

jest.mock('../../../services/posts/feedFriends', () => ({
  ...(jest.requireActual('../../../services/posts/feedFriends') as Record<string, unknown>),
  loadFeedFriendIds: async () => ['650000000000000000000002'],
  loadFeedCircles: async () => ({ acquaintance: [], close: ['650000000000000000000005'], blood: [] }),
}));
jest.mock('../../../services/posts/feedContacts', () => ({ loadFeedDirectContactIds: async () => [] }));
jest.mock('../../../services/posts/communityVisibility', () => ({
  ...(jest.requireActual('../../../services/posts/communityVisibility') as Record<string, unknown>),
  getCommunityCoMemberIds: async () => [],
}));
jest.mock('../../../services/ContactDirectoryService', () => ({
  blockedIdsAroundViewer: async () => ['650000000000000000000004'],
}));
jest.mock('../../../services/CacheStore', () => ({ getCacheStore: () => undefined }));

import { registerGlobalPostSearchRoute } from '../../../routes/search/global-search';
import { findManyIn, type Doc } from './where-eval';

let clock = 0;
const post = (authorId: string, content: string, over: Doc = {}): Doc => {
  clock += 1;
  return {
    id: `6700000000000000000000${String(clock).padStart(2, '0')}`,
    authorId,
    type: 'POST',
    visibility: 'PUBLIC',
    visibilityUserIds: [],
    content,
    translations: null,
    originalLanguage: 'fr',
    createdAt: new Date(Date.UTC(2026, 10, 1, 10, 0, clock)),
    expiresAt: null,
    ...over,
  };
};

function prismaFor(posts: Doc[]) {
  return {
    post: { findMany: async (args: { where?: Doc; select?: Record<string, unknown>; take?: number }) => findManyIn(posts, args) },
    postReaction: { findMany: async () => [] },
    postBookmark: { findMany: async () => [] },
  };
}

async function search(posts: Doc[], query: string, extra = '') {
  const app: FastifyInstance = Fastify({ logger: false });
  const requiredAuth = async (request: { authContext?: unknown }) => {
    request.authContext = { registeredUser: { id: READER }, isAnonymous: false, userId: READER, type: 'user' };
  };
  registerGlobalPostSearchRoute(app, prismaFor(posts) as never, requiredAuth);
  await app.ready();
  const response = await app.inject({ method: 'GET', url: `/posts/search?q=${encodeURIComponent(query)}${extra}` });
  await app.close();
  return { status: response.statusCode, body: response.json() as { data: Doc[]; pagination: Doc } };
}

const texts = (data: Doc[]) => data.map((item) => item.content);

describe('GET /posts/search — la loi d’audience du fil (#14620)', () => {
  it('trouve un post public, un réel et une story qui correspondent', async () => {
    const { status, body } = await search(
      [post(STRANGER, 'Coucher de soleil'), post(STRANGER, 'soleil en réel', { type: 'REEL' }), post(FRIEND, 'story au soleil', { type: 'STORY', expiresAt: new Date(Date.now() + 3_600_000) })],
      'SOLEIL'
    );
    expect(status).toBe(200);
    expect(texts(body.data)).toEqual(['story au soleil', 'soleil en réel', 'Coucher de soleil']);
    expect(body.data.map((item) => item.type)).toEqual(['STORY', 'REEL', 'POST']);
  });

  it("ne rend pas le post réservé aux amis d'un inconnu, mais celui d'un ami", async () => {
    const { body } = await search([post(STRANGER, 'soleil entre amis', { visibility: 'FRIENDS' }), post(FRIEND, 'soleil de mon ami', { visibility: 'FRIENDS' })], 'soleil');
    expect(texts(body.data)).toEqual(['soleil de mon ami']);
  });

  it("ne rend pas un post privé (ONLY) qui ne nomme pas le lecteur, ni un cercle qu'il n'atteint pas", async () => {
    const { body } = await search(
      [
        post(STRANGER, 'soleil privé', { visibility: 'ONLY', visibilityUserIds: [FRIEND] }),
        post(FRIEND, 'soleil des proches', { visibility: 'CLOSE' }),
        post(CLOSE, 'soleil de mon proche', { visibility: 'CLOSE' }),
        post(STRANGER, 'soleil pour moi', { visibility: 'ONLY', visibilityUserIds: [READER] }),
      ],
      'soleil'
    );
    expect(texts(body.data)).toEqual(['soleil pour moi', 'soleil de mon proche']);
  });

  it("n'expose jamais un auteur bloqué, même en public", async () => {
    const { body } = await search([post(BLOCKED, 'soleil bloqué'), post(STRANGER, 'soleil libre')], 'soleil');
    expect(texts(body.data)).toEqual(['soleil libre']);
  });

  it('exclut la story expirée (même la sienne) et le post supprimé', async () => {
    const { body } = await search(
      [
        post(FRIEND, 'soleil échu', { type: 'STORY', expiresAt: new Date(Date.now() - 60_000) }),
        post(READER, 'mon soleil échu', { type: 'STORY', expiresAt: new Date(Date.now() - 60_000) }),
        post(STRANGER, 'soleil supprimé', { deletedAt: new Date('2026-10-01') }),
        post(STRANGER, 'soleil vivant'),
      ],
      'soleil'
    );
    expect(texts(body.data)).toEqual(['soleil vivant']);
  });

  it('trouve un post par sa traduction, et filtre par format', async () => {
    const posts = [post(STRANGER, 'sunset', { originalLanguage: 'en', translations: { fr: { text: 'coucher de soleil' } } }), post(STRANGER, 'soleil en réel', { type: 'REEL' })];
    expect(texts((await search(posts, 'soleil', '&types=POST')).body.data)).toEqual(['sunset']);
    expect((await search(posts, 'soleil', '&types=STATUS')).status).toBe(400);
  });

  it('pagine par curseur, sans doublon', async () => {
    const posts = Array.from({ length: 3 }, (_, index) => post(STRANGER, `soleil ${index}`));
    const first = await search(posts, 'soleil', '&limit=2');
    expect(texts(first.body.data)).toEqual(['soleil 2', 'soleil 1']);
    const second = await search(posts, 'soleil', `&limit=2&cursor=${first.body.pagination.nextCursor}`);
    expect(texts(second.body.data)).toEqual(['soleil 0']);
    expect(second.body.pagination).toEqual({ limit: 2, hasMore: false, nextCursor: null });
  });
});
