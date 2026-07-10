/**
 * PostFeedService.getStories — author presence enrichment (2026-07-10)
 *
 * The story viewer shows an identity interstitial (avatar + name + presence)
 * at every group switch. Presence must be resolvable AT SWITCH TIME from the
 * feed payload itself — not lazily after the slide is already displayed.
 * The stories path therefore selects `isOnline` + `lastActiveAt` on the
 * author, while the regular post feed keeps the lean author shape (presence
 * exposure stays scoped to people allowed to see the story).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PostFeedService } from '../../../services/PostFeedService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

let mockPostFindMany: jest.Mock;
let mockPrisma: PrismaClient;

beforeEach(() => {
  mockPostFindMany = jest.fn().mockResolvedValue([]);

  mockPrisma = {
    post: { findMany: mockPostFindMany } as unknown as PrismaClient['post'],
    postReaction: { findMany: jest.fn().mockResolvedValue([]) } as unknown as PrismaClient['postReaction'],
    friendRequest: { findMany: jest.fn().mockResolvedValue([]) } as unknown as PrismaClient['friendRequest'],
    participant: { findMany: jest.fn().mockResolvedValue([]) } as unknown as PrismaClient['participant'],
    postView: { findMany: jest.fn().mockResolvedValue([]) } as unknown as PrismaClient['postView'],
    postBookmark: { findMany: jest.fn().mockResolvedValue([]) } as unknown as PrismaClient['postBookmark'],
    postImpression: { groupBy: jest.fn().mockResolvedValue([]) } as unknown as PrismaClient['postImpression'],
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    } as unknown as PrismaClient['user'],
    postMention: { findMany: jest.fn().mockResolvedValue([]) } as unknown as PrismaClient['postMention'],
  } as unknown as PrismaClient;
});

describe('PostFeedService.getStories — author presence (isOnline/lastActiveAt)', () => {
  it('selects author presence fields on the full stories include', async () => {
    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1');

    const args = mockPostFindMany.mock.calls[0][0];
    expect(args.include?.author?.select?.isOnline).toBe(true);
    expect(args.include?.author?.select?.lastActiveAt).toBe(true);
  });

  it('selects author presence fields on the tray projection', async () => {
    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1', { projection: 'tray' });

    const args = mockPostFindMany.mock.calls[0][0];
    expect(args.select?.author?.select?.isOnline).toBe(true);
    expect(args.select?.author?.select?.lastActiveAt).toBe(true);
  });

  it('keeps the lean author shape (no presence) on the regular feed', async () => {
    const service = new PostFeedService(mockPrisma);
    await service.getFeed('user-1', 1, 20);

    const args = mockPostFindMany.mock.calls[0][0];
    expect(args.include?.author?.select?.isOnline).toBeUndefined();
    expect(args.include?.author?.select?.lastActiveAt).toBeUndefined();
  });
});
