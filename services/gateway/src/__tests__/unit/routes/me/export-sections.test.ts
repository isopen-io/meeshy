/**
 * Unit tests for routes/me/export-sections.ts (#3633).
 *
 * Covers the pure query functions added to widen GET /me/export beyond
 * profile/messages/contacts: posts, stories, comments, reactions, media,
 * voiceProfile, sessions — each bounded (take/skip), each reporting
 * { total, hasMore } derived from a companion `count`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  resolveExportPage,
  exportPosts,
  exportStories,
  exportComments,
  exportReactions,
  exportMedia,
  exportVoiceProfile,
  exportSessions,
} from '../../../../routes/me/export-sections';

const USER_ID = '507f1f77bcf86cd799439011';

function fakePrisma(overrides: Record<string, any> = {}) {
  return {
    post: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    postComment: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    reaction: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    postReaction: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    commentReaction: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    postMedia: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    userVoiceModel: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    userSession: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    ...overrides,
  } as any;
}

describe('resolveExportPage', () => {
  it('defaults to limit=500, offset=0 with no query', () => {
    expect(resolveExportPage({})).toEqual({ limit: 500, offset: 0 });
  });

  it('caps limit at 2000 even if the client asks for more', () => {
    expect(resolveExportPage({ limit: '999999' })).toEqual({ limit: 2000, offset: 0 });
  });

  it('parses valid limit/offset', () => {
    expect(resolveExportPage({ limit: '100', offset: '50' })).toEqual({ limit: 100, offset: 50 });
  });

  it('ignores negative/zero/garbage values and falls back to defaults', () => {
    expect(resolveExportPage({ limit: '-5', offset: '-1' })).toEqual({ limit: 500, offset: 0 });
    expect(resolveExportPage({ limit: 'not-a-number', offset: 'nope' })).toEqual({ limit: 500, offset: 0 });
  });
});

describe('exportPosts', () => {
  it('filters by authorId, type in [POST, REEL], deletedAt: null — bounded by take/skip', async () => {
    const prisma = fakePrisma();
    await exportPosts(prisma, USER_ID, { limit: 10, offset: 5 });
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { authorId: USER_ID, type: { in: ['POST', 'REEL'] }, deletedAt: null },
        take: 10,
        skip: 5,
      })
    );
    expect(prisma.post.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { authorId: USER_ID, type: { in: ['POST', 'REEL'] }, deletedAt: null } })
    );
  });

  it('reports hasMore=true when total exceeds offset+returned', async () => {
    const prisma = fakePrisma({
      post: { findMany: jest.fn<any>().mockResolvedValue([{ id: '1' }]), count: jest.fn<any>().mockResolvedValue(5) },
    });
    const section = await exportPosts(prisma, USER_ID, { limit: 1, offset: 0 });
    expect(section).toEqual({ items: [{ id: '1' }], total: 5, hasMore: true });
  });

  it('reports hasMore=false on the last page', async () => {
    const prisma = fakePrisma({
      post: { findMany: jest.fn<any>().mockResolvedValue([{ id: '5' }]), count: jest.fn<any>().mockResolvedValue(5) },
    });
    const section = await exportPosts(prisma, USER_ID, { limit: 1, offset: 4 });
    expect(section.hasMore).toBe(false);
  });
});

describe('exportStories', () => {
  it('filters by type in [STORY, STATUS] — distinct from exportPosts', async () => {
    const prisma = fakePrisma();
    await exportStories(prisma, USER_ID, { limit: 500, offset: 0 });
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { authorId: USER_ID, type: { in: ['STORY', 'STATUS'] }, deletedAt: null } })
    );
  });
});

describe('exportComments', () => {
  it('filters by authorId, excludes soft-deleted', async () => {
    const prisma = fakePrisma();
    await exportComments(prisma, USER_ID, { limit: 500, offset: 0 });
    expect(prisma.postComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { authorId: USER_ID, deletedAt: null } })
    );
  });
});

describe('exportReactions', () => {
  it('queries message reactions by participantId, post/comment reactions by userId — three independent bounded queries', async () => {
    const prisma = fakePrisma();
    const pIds = ['part-1', 'part-2'];
    await exportReactions(prisma, pIds, USER_ID, { limit: 20, offset: 0 });

    expect(prisma.reaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { participantId: { in: pIds } }, take: 20, skip: 0 })
    );
    expect(prisma.postReaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID }, take: 20, skip: 0 })
    );
    expect(prisma.commentReaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID }, take: 20, skip: 0 })
    );
  });

  it('returns three independently-paginated sections', async () => {
    const prisma = fakePrisma({
      reaction: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'r1' }]), count: jest.fn<any>().mockResolvedValue(1) },
      postReaction: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
      commentReaction: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    });
    const sections = await exportReactions(prisma, ['part-1'], USER_ID, { limit: 500, offset: 0 });
    expect(sections.messages).toEqual({ items: [{ id: 'r1' }], total: 1, hasMore: false });
    expect(sections.posts).toEqual({ items: [], total: 0, hasMore: false });
    expect(sections.comments).toEqual({ items: [], total: 0, hasMore: false });
  });
});

describe('exportMedia', () => {
  it('excludes anonymous uploads and queries both attachment tables by owner', async () => {
    const prisma = fakePrisma();
    await exportMedia(prisma, USER_ID, { limit: 500, offset: 0 });
    expect(prisma.messageAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { uploadedBy: USER_ID, isAnonymous: false } })
    );
    expect(prisma.postMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { uploaderId: USER_ID } })
    );
  });
});

describe('exportVoiceProfile', () => {
  it('never selects the binary embedding/chatterboxConditionals columns', async () => {
    const prisma = fakePrisma();
    await exportVoiceProfile(prisma, USER_ID);
    const call = prisma.userVoiceModel.findFirst.mock.calls[0][0];
    expect(call.where).toEqual({ userId: USER_ID });
    expect(call.select).not.toHaveProperty('embedding');
    expect(call.select).not.toHaveProperty('chatterboxConditionals');
    expect(call.select).not.toHaveProperty('embeddingPath');
  });

  it('returns null when the user has no voice profile', async () => {
    const prisma = fakePrisma();
    await expect(exportVoiceProfile(prisma, USER_ID)).resolves.toBeNull();
  });
});

describe('exportSessions', () => {
  it('never selects sessionToken, refreshToken, or deviceFingerprint', async () => {
    const prisma = fakePrisma();
    await exportSessions(prisma, USER_ID, { limit: 500, offset: 0 });
    const call = prisma.userSession.findMany.mock.calls[0][0];
    expect(call.select).not.toHaveProperty('sessionToken');
    expect(call.select).not.toHaveProperty('refreshToken');
    expect(call.select).not.toHaveProperty('deviceFingerprint');
  });

  it('is bounded and filtered by userId', async () => {
    const prisma = fakePrisma();
    await exportSessions(prisma, USER_ID, { limit: 50, offset: 10 });
    expect(prisma.userSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID }, take: 50, skip: 10 })
    );
  });
});
