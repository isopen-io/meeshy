/**
 * core.story-translation.test.ts
 *
 * Verifies that PostTranslationService.translatePost is triggered for stories
 * whose `content` (caption) is non-empty — Prisme Linguistique compliance.
 *
 * These tests exercise the routing logic in isolation by mounting a minimal
 * Fastify instance with mocked services, so no database or ZMQ is required.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { PostTranslationService } from '../../../services/posts/PostTranslationService';
import { StoryTextObjectTranslationService } from '../../../services/posts/StoryTextObjectTranslationService';
import { registerCoreRoutes } from '../core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TranslatePostSpy = jest.MockedFunction<typeof PostTranslationService.prototype.translatePost>;
type StoryTranslateSpy = jest.MockedFunction<typeof StoryTextObjectTranslationService.prototype.handleTranslationCompleted>;

function buildCreatedPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-id-123',
    type: 'STORY',
    content: 'Hello story caption',
    authorId: 'user-id-abc',
    originalLanguage: null,
    ...overrides,
  };
}

function buildMockPrisma() {
  return {} as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
}

function buildMockPostService(createdPost: Record<string, unknown>) {
  return {
    createPost: jest.fn<() => Promise<typeof createdPost>>().mockResolvedValue(createdPost as never),
    getPostById: jest.fn(),
    updatePost: jest.fn(),
    deletePost: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Mocks — module-level so they are applied before imports resolve
// ---------------------------------------------------------------------------

jest.mock('../../../services/PostService', () => ({
  PostService: jest.fn(),
}));

jest.mock('../../../services/posts/PostTranslationService', () => {
  const translatePostMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const sharedInstance = { translatePost: translatePostMock };
  return {
    PostTranslationService: {
      shared: sharedInstance,
      _translatePostMock: translatePostMock,
    },
  };
});

jest.mock('../../../services/posts/StoryTextObjectTranslationService', () => {
  const handleMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const sharedInstance = { handleTranslationCompleted: handleMock };
  return {
    StoryTextObjectTranslationService: {
      shared: sharedInstance,
      _handleMock: handleMock,
    },
  };
});

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn(() => []),
    resolveUsernames: jest.fn(async () => new Map()),
    createPostMentions: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn(({ op }: { op: () => Promise<unknown> }) => op()),
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn(() => ({})),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// ---------------------------------------------------------------------------
// Fastify mount helper
// ---------------------------------------------------------------------------

async function buildApp(postServiceImpl: ReturnType<typeof buildMockPostService>): Promise<FastifyInstance> {
  const { PostService } = await import('../../../services/PostService') as { PostService: jest.MockedClass<typeof import('../../../services/PostService').PostService> };
  (PostService as jest.MockedClass<any>).mockImplementation(() => postServiceImpl);

  const app = Fastify({ logger: false });

  // Augment fastify instance with socialEvents (minimal no-op stub)
  (app as unknown as Record<string, unknown>).socialEvents = {
    broadcastStoryCreated: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    broadcastStatusCreated: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    broadcastPostCreated: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const requiredAuth = async (request: import('fastify').FastifyRequest, _reply: import('fastify').FastifyReply) => {
    (request as unknown as Record<string, unknown>).authContext = {
      isAuthenticated: true,
      registeredUser: { id: 'user-id-abc' },
    };
  };

  registerCoreRoutes(app, buildMockPrisma(), requiredAuth);
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('POST /posts — story content translation (Prisme Linguistique)', () => {
  let translatePostMock: TranslatePostSpy;
  let handleStoryTextMock: StoryTranslateSpy;

  beforeEach(async () => {
    const pts = (await import('../../../services/posts/PostTranslationService')) as unknown as {
      PostTranslationService: { _translatePostMock: TranslatePostSpy };
    };
    const stots = (await import('../../../services/posts/StoryTextObjectTranslationService')) as unknown as {
      StoryTextObjectTranslationService: { _handleMock: StoryTranslateSpy };
    };
    translatePostMock = pts.PostTranslationService._translatePostMock;
    handleStoryTextMock = stots.StoryTextObjectTranslationService._handleMock;
    translatePostMock.mockClear();
    handleStoryTextMock.mockClear();
  });

  it('should trigger PostTranslationService.translatePost when type=STORY with non-empty content', async () => {
    const createdPost = buildCreatedPost({ type: 'STORY', content: 'Hello story caption' });
    const app = await buildApp(buildMockPostService(createdPost));

    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { type: 'STORY', content: 'Hello story caption' },
    });

    expect(res.statusCode).toBe(201);
    expect(translatePostMock).toHaveBeenCalledTimes(1);
    expect(translatePostMock).toHaveBeenCalledWith(
      'post-id-123',
      'Hello story caption',
      null,
      'user-id-abc',
    );

    await app.close();
  });

  it('should NOT trigger PostTranslationService.translatePost when type=STORY with empty content', async () => {
    const createdPost = buildCreatedPost({ type: 'STORY', content: undefined });
    const app = await buildApp(buildMockPostService(createdPost));

    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { type: 'STORY' },
    });

    expect(res.statusCode).toBe(201);
    expect(translatePostMock).not.toHaveBeenCalled();

    await app.close();
  });

  it('should NOT trigger PostTranslationService.translatePost when type=STORY with whitespace-only content', async () => {
    const createdPost = buildCreatedPost({ type: 'STORY', content: '   ' });
    const app = await buildApp(buildMockPostService(createdPost));

    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { type: 'STORY', content: '   ' },
    });

    expect(res.statusCode).toBe(201);
    expect(translatePostMock).not.toHaveBeenCalled();

    await app.close();
  });

  it('should still trigger PostTranslationService.translatePost when type=POST', async () => {
    const createdPost = buildCreatedPost({ type: 'POST', content: 'A regular post caption' });
    const app = await buildApp(buildMockPostService(createdPost));

    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { type: 'POST', content: 'A regular post caption' },
    });

    expect(res.statusCode).toBe(201);
    expect(translatePostMock).toHaveBeenCalledTimes(1);
    expect(translatePostMock).toHaveBeenCalledWith(
      'post-id-123',
      'A regular post caption',
      null,
      'user-id-abc',
    );

    await app.close();
  });

  it('should not double-translate: PostTranslationService and StoryTextObjectTranslationService run independently', async () => {
    // PostTranslationService handles top-level content.
    // StoryTextObjectTranslationService handles storyEffects.textObjects[n].translations.
    // Neither route handler calls the other — they are triggered by separate ZMQ events.
    // This test asserts that creating a STORY with content triggers translatePost exactly once
    // and does NOT trigger handleTranslationCompleted (which is only called from ZMQ events).
    const createdPost = buildCreatedPost({ type: 'STORY', content: 'Caption for story' });
    const app = await buildApp(buildMockPostService(createdPost));

    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: {
        type: 'STORY',
        content: 'Caption for story',
        storyEffects: { textObjects: [{ text: 'overlay text', translations: {} }] },
      },
    });

    expect(res.statusCode).toBe(201);
    // PostTranslationService.translatePost called exactly once for the caption
    expect(translatePostMock).toHaveBeenCalledTimes(1);
    // StoryTextObjectTranslationService is NOT invoked from the HTTP route — only from ZMQ
    expect(handleStoryTextMock).not.toHaveBeenCalled();

    await app.close();
  });
});
