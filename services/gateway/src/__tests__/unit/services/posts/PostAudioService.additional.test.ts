/**
 * Additional PostAudioService coverage for uncovered branches:
 * - getPlatformTargetLanguages with sourceLanguage (line 100)
 * - broadcastMediaOwnerUpdate commentId branch → broadcastCommentMediaUpdate (lines 257-258)
 * - broadcastCommentMediaUpdate: comment not found (lines 286-288)
 * - broadcastCommentMediaUpdate: post not found (lines 295-298)
 * - broadcastCommentMediaUpdate: success path (lines 300, 310)
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(),
      debug: jest.fn(), trace: jest.fn(),
    }),
  },
}));

jest.mock('../../../../utils/languages', () => ({
  getLanguagesWithTranslation: jest.fn<any>().mockReturnValue([
    { code: 'en' }, { code: 'fr' }, { code: 'es' },
  ]),
}));

jest.mock('../../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstanceSync: jest.fn<any>().mockReturnValue(null) },
}));

jest.mock('@meeshy/shared/utils/attachment-validators', () => ({
  parseAttachmentTranscription: jest.fn<any>().mockReturnValue({ ok: true }),
}));

jest.mock('../../../../services/posts/postIncludes', () => ({
  NOT_DELETED: null,
  postInclude: {},
  commentMediaInclude: {},
}));

import { PostAudioService } from '../../../../services/posts/PostAudioService';

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeMockPrisma = (overrides: Record<string, any> = {}) => ({
  postMedia: {
    update: jest.fn<any>().mockResolvedValue({ commentId: null }),
  },
  postComment: {
    findFirst: jest.fn<any>().mockResolvedValue(null),
  },
  post: {
    findFirst: jest.fn<any>().mockResolvedValue(null),
  },
  ...overrides,
});

const makeMockSocialEvents = () => ({
  broadcastCommentMediaUpdated: jest.fn<any>().mockResolvedValue(undefined),
  broadcastPostUpdated: jest.fn<any>().mockResolvedValue(undefined),
});

const baseTranscription = {
  text: 'Hello world',
  language: 'en',
  confidence: 0.95,
  durationMs: 5000,
  source: 'whisper',
  model: 'whisper_medium',
  segments: [],
};

beforeEach(() => {
  // Reset the singleton between tests
  (PostAudioService as any)._shared = null;
});

// ── getPlatformTargetLanguages with sourceLanguage (line 100) ─────────────────

describe('PostAudioService — getPlatformTargetLanguages with sourceLanguage', () => {
  it('filters out the sourceLanguage from the target list', () => {
    const service = PostAudioService.init(makeMockPrisma() as any, makeMockSocialEvents() as any);
    const result = (service as any).getPlatformTargetLanguages('en');
    // 'en' should be excluded from ['en','fr','es']
    expect(result).not.toContain('en');
    expect(result).toContain('fr');
    expect(result).toContain('es');
  });

  it('returns all languages when sourceLanguage is undefined', () => {
    const service = PostAudioService.init(makeMockPrisma() as any, makeMockSocialEvents() as any);
    const result = (service as any).getPlatformTargetLanguages(undefined);
    expect(result).toEqual(['en', 'fr', 'es']);
  });
});

// ── broadcastCommentMediaUpdate: comment not found (lines 286-288) ────────────

describe('PostAudioService — broadcastCommentMediaUpdate comment not found', () => {
  it('logs warn and returns when comment is not found', async () => {
    const mockPrisma = makeMockPrisma();
    // postMedia.update returns commentId to trigger the comment path
    mockPrisma.postMedia.update.mockResolvedValue({ commentId: 'comment-123' });
    // postComment.findFirst returns null (comment not found)
    mockPrisma.postComment.findFirst.mockResolvedValue(null);

    const service = PostAudioService.init(mockPrisma as any, makeMockSocialEvents() as any);

    await service.handleTranscriptionReady({
      postId: 'post-1',
      postMediaId: 'media-1',
      transcription: baseTranscription,
    });

    expect(mockPrisma.postComment.findFirst).toHaveBeenCalled();
    expect(mockPrisma.post.findFirst).not.toHaveBeenCalled();
  });
});

// ── broadcastCommentMediaUpdate: post not found (lines 295-298) ───────────────

describe('PostAudioService — broadcastCommentMediaUpdate post not found', () => {
  it('logs warn and returns when parent post is not found', async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.postMedia.update.mockResolvedValue({ commentId: 'comment-456' });
    mockPrisma.postComment.findFirst.mockResolvedValue({
      id: 'comment-456', postId: 'post-2', content: 'A comment',
      originalLanguage: 'en', translations: [], likeCount: 0, replyCount: 0,
      effectFlags: [], parentId: null, createdAt: new Date(), metadata: null,
      author: { id: 'user-1', username: 'alice', displayName: 'Alice', avatar: null },
      media: [],
    });
    mockPrisma.post.findFirst.mockResolvedValue(null);

    const mockSocialEvents = makeMockSocialEvents();
    const service = PostAudioService.init(mockPrisma as any, mockSocialEvents as any);

    await service.handleTranscriptionReady({
      postId: 'post-2',
      postMediaId: 'media-2',
      transcription: baseTranscription,
    });

    expect(mockPrisma.postComment.findFirst).toHaveBeenCalled();
    expect(mockPrisma.post.findFirst).toHaveBeenCalled();
    expect(mockSocialEvents.broadcastCommentMediaUpdated).not.toHaveBeenCalled();
  });
});

// ── broadcastCommentMediaUpdate: success path (lines 300, 310) ────────────────

describe('PostAudioService — broadcastCommentMediaUpdate success', () => {
  it('broadcasts comment:media-updated when both comment and post are found', async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.postMedia.update.mockResolvedValue({ commentId: 'comment-789' });
    const fakeComment = {
      id: 'comment-789', postId: 'post-3', content: 'Audio comment',
      originalLanguage: 'fr', translations: [], likeCount: 1, replyCount: 0,
      effectFlags: [], parentId: null, createdAt: new Date(), metadata: null,
      author: { id: 'user-2', username: 'bob', displayName: 'Bob', avatar: null },
      media: [{ id: 'media-789', type: 'audio', url: '/uploads/a.mp3' }],
    };
    mockPrisma.postComment.findFirst.mockResolvedValue(fakeComment);
    mockPrisma.post.findFirst.mockResolvedValue({
      authorId: 'user-3',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });

    const mockSocialEvents = makeMockSocialEvents();
    const service = PostAudioService.init(mockPrisma as any, mockSocialEvents as any);

    await service.handleTranscriptionReady({
      postId: 'post-3',
      postMediaId: 'media-789',
      transcription: baseTranscription,
    });

    expect(mockSocialEvents.broadcastCommentMediaUpdated).toHaveBeenCalledTimes(1);
    const [payload, authorId, visibility, visibilityUserIds] =
      mockSocialEvents.broadcastCommentMediaUpdated.mock.calls[0] as any[];
    expect(payload.commentId).toBe('comment-789');
    expect(payload.postId).toBe('post-3');
    expect(authorId).toBe('user-3');
    expect(visibility).toBe('PUBLIC');
    expect(visibilityUserIds).toEqual([]);
  });

  it('uses null-coalesced visibilityUserIds when post.visibilityUserIds is null', async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.postMedia.update.mockResolvedValue({ commentId: 'comment-null-vis' });
    mockPrisma.postComment.findFirst.mockResolvedValue({
      id: 'comment-null-vis', postId: 'post-4', content: '',
      originalLanguage: 'en', translations: [], likeCount: 0, replyCount: 0,
      effectFlags: [], parentId: null, createdAt: new Date(), metadata: null,
      author: { id: 'user-4', username: 'carol', displayName: 'Carol', avatar: null },
      media: [],
    });
    mockPrisma.post.findFirst.mockResolvedValue({
      authorId: 'user-5',
      visibility: 'FRIENDS',
      visibilityUserIds: null, // null should be coalesced to []
    });

    const mockSocialEvents = makeMockSocialEvents();
    const service = PostAudioService.init(mockPrisma as any, mockSocialEvents as any);

    await service.handleAudioTranslationsReady({
      postId: 'post-4',
      postMediaId: 'media-null-vis',
      translations: { en: { type: 'audio', transcription: 'hi', path: '/p', url: '/u', durationMs: 1000, format: 'mp3', cloned: false, quality: 0.9, ttsModel: 'xtts' } },
    });

    expect(mockSocialEvents.broadcastCommentMediaUpdated).toHaveBeenCalledTimes(1);
    const callArgs = mockSocialEvents.broadcastCommentMediaUpdated.mock.calls[0] as any[];
    expect(callArgs[3]).toEqual([]); // null ?? [] = []
  });
});

// ── broadcastMediaOwnerUpdate null commentId (post path — line 260) ───────────

describe('PostAudioService — broadcastMediaOwnerUpdate null commentId goes to post path', () => {
  it('does not call broadcastCommentMediaUpdate when commentId is null', async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.postMedia.update.mockResolvedValue({ commentId: null });
    // Post findFirst returns null to avoid infinite mocking of postInclude
    mockPrisma.post.findFirst.mockResolvedValue(null);

    const service = PostAudioService.init(mockPrisma as any, makeMockSocialEvents() as any);

    await service.handleTranscriptionReady({
      postId: 'post-no-comment',
      postMediaId: 'media-no-comment',
      transcription: baseTranscription,
    });

    // postComment.findFirst should NOT be called (went to broadcastPostUpdate)
    expect(mockPrisma.postComment.findFirst).not.toHaveBeenCalled();
    // post.findFirst WAS called (by broadcastPostUpdate)
    expect(mockPrisma.post.findFirst).toHaveBeenCalled();
  });
});
