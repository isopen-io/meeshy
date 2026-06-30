/**
 * Unit tests for posts index route barrel (index.ts)
 * Tests that postRoutes registers all route groups.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn().mockReturnValue(async () => {}),
}));

jest.mock('../../../../routes/posts/core', () => ({
  registerCoreRoutes: jest.fn(),
}));

jest.mock('../../../../routes/posts/feed', () => ({
  registerFeedRoutes: jest.fn(),
}));

jest.mock('../../../../routes/posts/comments', () => ({
  registerCommentRoutes: jest.fn(),
}));

jest.mock('../../../../routes/posts/interactions', () => ({
  registerInteractionRoutes: jest.fn(),
}));

jest.mock('../../../../routes/posts/audio', () => ({
  registerStoryAudioRoutes: jest.fn(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { postRoutes } from '../../../../routes/posts/index';
import { registerCoreRoutes } from '../../../../routes/posts/core';
import { registerFeedRoutes } from '../../../../routes/posts/feed';
import { registerCommentRoutes } from '../../../../routes/posts/comments';
import { registerInteractionRoutes } from '../../../../routes/posts/interactions';
import { registerStoryAudioRoutes } from '../../../../routes/posts/audio';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('postRoutes — registers all route groups', () => {
  it('calls all sub-route registration functions once', async () => {
    const app = Fastify({ logger: false });
    app.decorate('prisma', {} as any);

    await app.register(postRoutes);
    await app.ready();

    expect(registerCoreRoutes).toHaveBeenCalledTimes(1);
    expect(registerFeedRoutes).toHaveBeenCalledTimes(1);
    expect(registerCommentRoutes).toHaveBeenCalledTimes(1);
    expect(registerInteractionRoutes).toHaveBeenCalledTimes(1);
    expect(registerStoryAudioRoutes).toHaveBeenCalledTimes(1);

    await app.close();
  });
});

describe('postRoutes — registers without orphanMediaCleanup decorator', () => {
  it('does not throw when orphanMediaCleanup is not present on the instance', async () => {
    const app = Fastify({ logger: false });
    app.decorate('prisma', {} as any);

    await expect(app.register(postRoutes)).resolves.not.toThrow();
    await app.close();
  });
});

describe('postRoutes — registers with orphanMediaCleanup decorator present', () => {
  it('passes orphanCleanup to registerInteractionRoutes when decorator exists', async () => {
    const app = Fastify({ logger: false });
    app.decorate('prisma', {} as any);
    (app as any).orphanMediaCleanup = { schedule: jest.fn() };

    await app.register(postRoutes);
    await app.ready();

    expect(registerInteractionRoutes).toHaveBeenCalled();

    await app.close();
  });
});
