/**
 * Les crédits du barème (#8959) que `PostService` déclenche : favori,
 * partage, repost, vue de story, et la reprise d'un contenu supprimé.
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

const mockRecordActivity = jest.fn<any>().mockResolvedValue(undefined);
const mockReclaimContent = jest.fn<any>().mockResolvedValue(0);
jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({
    recordActivity: (...args: unknown[]) => mockRecordActivity(...args),
    reclaimContent: (...args: unknown[]) => mockReclaimContent(...args),
  })),
}));

import { PostService } from '../../../../services/PostService';

const POST_ID = '507f1f77bcf86cd799439011';
const READER_ID = '64a000000000000000000001';
const AUTHOR_ID = '64a000000000000000000002';

const settle = () => new Promise((resolve) => setImmediate(resolve));

class P2002Error extends Error {
  code = 'P2002';
}

const soundCapture = { releasePost: jest.fn<any>().mockResolvedValue(undefined) } as any;

function makePrisma(row: Record<string, unknown> = {}) {
  const postRow = {
    id: POST_ID,
    authorId: AUTHOR_ID,
    type: 'POST',
    visibility: 'PUBLIC',
    visibilityUserIds: [],
    shareCount: 0,
    bookmarkCount: 0,
    expiresAt: null,
    repostOfId: null,
    originalRepostOfId: null,
    media: [],
    ...row,
  };
  const prisma: any = {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(postRow),
      update: jest.fn<any>().mockResolvedValue({ ...postRow, shareCount: 1, bookmarkCount: 1 }),
      create: jest.fn<any>().mockResolvedValue({ ...postRow, id: 'repost-1', authorId: READER_ID }),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    postBookmark: { create: jest.fn<any>().mockResolvedValue({}) },
    trackingLink: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockImplementation(async (arg: any) => ({ token: arg.data.token, shortUrl: arg.data.shortUrl })),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    postView: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({ id: 'pv-1' }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    postMention: { findUnique: jest.fn<any>().mockResolvedValue(null), updateMany: jest.fn<any>() },
    friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    communityMember: { findMany: jest.fn<any>().mockResolvedValue([]) },
    adminAuditLog: { create: jest.fn<any>().mockResolvedValue({}) },
    notification: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    $runCommandRaw: jest.fn<any>().mockResolvedValue({ cursor: { firstBatch: [], id: 0 }, ok: 1 }),
  };
  prisma.$transaction = jest.fn(async (fn: unknown) => (fn as (tx: unknown) => unknown)(prisma));
  return prisma;
}

const serviceFor = (prisma: ReturnType<typeof makePrisma>) =>
  new PostService(prisma, undefined, undefined, undefined, undefined, soundCapture);

beforeEach(() => {
  mockRecordActivity.mockClear();
  mockReclaimContent.mockClear();
});

describe('tool.post_bookmark — PostService.bookmarkPost', () => {
  it('crédite le premier favori, avec le post et son auteur', async () => {
    await serviceFor(makePrisma()).bookmarkPost(POST_ID, READER_ID);
    await settle();

    expect(mockRecordActivity).toHaveBeenCalledWith(READER_ID, 'tool.post_bookmark', {
      targetId: POST_ID,
      targetOwnerId: AUTHOR_ID,
    });
  });

  it('un favori déjà posé (P2002) ne recrédite pas', async () => {
    const prisma = makePrisma();
    prisma.postBookmark.create.mockRejectedValue(new P2002Error('dup'));

    await serviceFor(prisma).bookmarkPost(POST_ID, READER_ID);
    await settle();

    expect(mockRecordActivity).not.toHaveBeenCalled();
  });
});

describe('social.share — PostService.shareWithTrackingLink', () => {
  it('crédite le premier partage avec la cible et son auteur', async () => {
    const prisma = makePrisma();
    await serviceFor(prisma)
      .shareWithTrackingLink(POST_ID, READER_ID, { baseUrl: 'https://meeshy.me' });
    await settle();

    expect(prisma.post.findFirst.mock.calls[0][0].select).toMatchObject({ authorId: true });
    expect(mockRecordActivity).toHaveBeenCalledWith(READER_ID, 'social.share', {
      targetId: POST_ID,
      targetOwnerId: AUTHOR_ID,
    });
  });

  it('un lien déjà émis (réutilisé) ne recrédite pas', async () => {
    const prisma = makePrisma();
    prisma.trackingLink.findFirst.mockResolvedValue({ token: 'abc123', shortUrl: '/l/abc123' });

    await serviceFor(prisma)
      .shareWithTrackingLink(POST_ID, READER_ID, { baseUrl: 'https://meeshy.me' });
    await settle();

    expect(mockRecordActivity).not.toHaveBeenCalled();
  });
});

describe('social.repost — PostService.repostPost', () => {
  it('crédite le reposteur, propriétaire = auteur de l’original', async () => {
    const repost = await serviceFor(makePrisma())
      .repostPost(POST_ID, READER_ID, { targetType: 'POST' as any });
    await settle();

    expect(repost).not.toBeNull();
    expect(mockRecordActivity).toHaveBeenCalledWith(READER_ID, 'social.repost', {
      targetId: POST_ID,
      targetOwnerId: AUTHOR_ID,
    });
  });

  it('un original introuvable ne crédite rien', async () => {
    const prisma = makePrisma();
    prisma.post.findFirst.mockResolvedValue(null);

    await serviceFor(prisma).repostPost(POST_ID, READER_ID);
    await settle();

    expect(mockRecordActivity).not.toHaveBeenCalled();
  });
});

describe('tool.story_viewed — PostService.recordView', () => {
  it('une première vue d’une story, regardée cinq secondes, crédite le lecteur', async () => {
    const prisma = makePrisma({ type: 'STORY' });

    expect(await serviceFor(prisma).recordView(POST_ID, READER_ID, 5_000)).toBe(true);
    await settle();

    expect(mockRecordActivity).toHaveBeenCalledWith(READER_ID, 'tool.story_viewed', {
      targetId: POST_ID,
      targetOwnerId: AUTHOR_ID,
    });
  });

  it('une vue déjà comptée ne recrédite pas', async () => {
    const prisma = makePrisma({ type: 'STORY' });
    prisma.postView.findUnique.mockResolvedValue({ id: 'pv-1', duration: 1000 });

    await serviceFor(prisma).recordView(POST_ID, READER_ID, 5_000);
    await settle();

    expect(mockRecordActivity).not.toHaveBeenCalled();
  });

  it('l’auteur qui revoit sa story ne se crédite pas', async () => {
    const prisma = makePrisma({ type: 'STORY' });

    await serviceFor(prisma).recordView(POST_ID, AUTHOR_ID, 5_000);
    await settle();

    expect(mockRecordActivity).not.toHaveBeenCalled();
  });
});

describe('reprise anti-abus — PostService.deletePost', () => {
  it('la suppression d’une story par un modérateur reprend les points de son AUTEUR', async () => {
    const prisma = makePrisma({ type: 'STORY' });

    await serviceFor(prisma)
      .deletePost(POST_ID, READER_ID, { actorRole: 'MODERATOR' });
    await settle();

    expect(mockReclaimContent).toHaveBeenCalledWith(AUTHOR_ID, 'content.story', POST_ID);
  });
});
