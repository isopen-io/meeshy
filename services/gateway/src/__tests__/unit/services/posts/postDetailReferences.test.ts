/**
 * Ce que le DÉTAIL d'un post dit de ses références.
 *
 * Le feed filtre au `select` — une charge utile identique pour tout le monde ne
 * peut pas fuiter. Le détail, lui, est une lecture unitaire : il charge TOUTES
 * les références et laisse `projectReferencesForViewer` décider de ce que CE
 * lecteur en voit. Ces deux faits se testent ici sur le service, là où le
 * chargement et la projection se rencontrent.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../../services/posts/communityVisibility', () => ({
  getCommunityCoMemberIds: jest.fn<any>().mockResolvedValue([]),
}));

jest.mock('../../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstanceSync: jest.fn<any>().mockReturnValue(null) },
}));

import { PostService } from '../../../../services/PostService';

const AUTHOR = 'u-author';
const CAROL = 'u-carol';

const POST_MENTIONS = [
  {
    display: 'INLINE',
    mentionedUser: { id: 'u-alice', username: 'alice', displayName: 'Alice', avatar: null },
  },
  {
    display: 'SILENT',
    mentionedUser: { id: CAROL, username: 'carol', displayName: 'Carol', avatar: null },
  },
];

function makePrisma(post: unknown) {
  return {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(post),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    postReaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
    postBookmark: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
    communityMember: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-1',
    authorId: AUTHOR,
    type: 'STORY',
    visibility: 'FRIENDS',
    isQuote: false,
    repostOfId: null,
    originalRepostOfId: null,
    repostOf: null,
    expiresAt: null,
    postMentions: POST_MENTIONS,
    ...overrides,
  };
}

describe('PostService.getPostById — références', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('charge la relation SANS filtrer les silencieuses — la projection s\'en charge', async () => {
    const prisma = makePrisma(makePost());
    await new PostService(prisma).getPostById('p-1', AUTHOR);

    const include = prisma.post.findFirst.mock.calls[0][0].include;
    expect(include.postMentions.where).toBeUndefined();
  });

  it('rend TOUTES les références à l\'auteur, silencieuse comprise', async () => {
    const prisma = makePrisma(makePost());
    const post = await new PostService(prisma).getPostById('p-1', AUTHOR);

    expect((post as any).mentions.map((m: any) => m.userId)).toEqual(['u-alice', CAROL]);
  });

  it('rend sa propre silencieuse à la personne concernée', async () => {
    const prisma = makePrisma(makePost());
    const post = await new PostService(prisma).getPostById('p-1', CAROL);

    expect((post as any).mentions.map((m: any) => m.userId)).toEqual(['u-alice', CAROL]);
  });

  it('cache la silencieuse à un tiers, et au lecteur anonyme', async () => {
    const prisma = makePrisma(makePost());
    const service = new PostService(prisma);

    expect(((await service.getPostById('p-1', 'u-bob')) as any).mentions.map((m: any) => m.userId))
      .toEqual(['u-alice']);
    expect(((await service.getPostById('p-1', undefined)) as any).mentions.map((m: any) => m.userId))
      .toEqual(['u-alice']);
  });

  it('ne laisse JAMAIS fuiter la relation brute à côté de sa forme aplatie', async () => {
    const prisma = makePrisma(makePost());
    const post = await new PostService(prisma).getPostById('p-1', 'u-bob');

    expect(post).not.toHaveProperty('postMentions');
  });
});
