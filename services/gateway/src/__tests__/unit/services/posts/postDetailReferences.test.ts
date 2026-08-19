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

// ─── L'ouverture unitaire d'un référencé HORS audience ───────────────────────
//
// Être nommé ouvre le contenu (spec §3.2) — et `GET /posts/:postId` est
// nommément l'ouverture détaillée que cette règle vise. Le filtre d'audience
// seul rendrait 404 à la personne que l'auteur vient de désigner : la
// notification qu'elle reçoit mènerait nulle part.

const BOB = 'u-bob';

function makeReferencedPrisma(params: {
  visible: unknown;
  unfiltered: unknown;
  reference: { expiredViewAt: Date | null } | null;
}) {
  const findFirst = jest.fn<any>()
    .mockResolvedValueOnce(params.visible)
    .mockResolvedValueOnce(params.unfiltered);
  return {
    post: { findFirst, count: jest.fn<any>().mockResolvedValue(0) },
    postReaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
    postBookmark: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
    communityMember: { findMany: jest.fn<any>().mockResolvedValue([]) },
    postMention: { findUnique: jest.fn<any>().mockResolvedValue(params.reference) },
  } as any;
}

describe('PostService.getPostById — le référencé hors audience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sert le contenu à qui y est nommé, même hors de son audience', async () => {
    const prisma = makeReferencedPrisma({
      visible: null,
      unfiltered: makePost(),
      reference: { expiredViewAt: null },
    });

    const post = await new PostService(prisma).getPostById('p-1', BOB);

    expect(post).not.toBeNull();
    expect((post as any).referenceAccess).toBe('granted');
  });

  it('refuse quand le droit de référence est éteint', async () => {
    const prisma = makeReferencedPrisma({
      visible: null,
      unfiltered: makePost({ expiresAt: new Date(Date.now() - 48 * 3600_000) }),
      reference: { expiredViewAt: new Date(Date.now() - 30 * 3600_000) },
    });

    expect(await new PostService(prisma).getPostById('p-1', BOB)).toBeNull();
  });

  it('refuse un lecteur hors audience que rien ne nomme', async () => {
    const prisma = makeReferencedPrisma({
      visible: null,
      unfiltered: makePost(),
      reference: null,
    });

    expect(await new PostService(prisma).getPostById('p-1', BOB)).toBeNull();
  });

  it('ne relit rien pour un lecteur anonyme — aucune référence ne le désigne', async () => {
    const prisma = makeReferencedPrisma({ visible: null, unfiltered: makePost(), reference: null });

    expect(await new PostService(prisma).getPostById('p-1', undefined)).toBeNull();
    expect(prisma.post.findFirst).toHaveBeenCalledTimes(1);
  });

  it('n\'émet aucune seconde lecture quand l\'audience suffit', async () => {
    const prisma = makeReferencedPrisma({
      visible: makePost(),
      unfiltered: null,
      reference: null,
    });

    expect(await new PostService(prisma).getPostById('p-1', BOB)).not.toBeNull();
    expect(prisma.post.findFirst).toHaveBeenCalledTimes(1);
  });
});
